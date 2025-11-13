import asyncio
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import Message, FSInputFile
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from sqlalchemy import select
from database import init_db, Article, ProcessedFile, MatchedArticle
from file_processor import FileProcessor
from config import Config
import json

# Инициализация бота
bot = Bot(token=Config.TELEGRAM_BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())
file_processor = FileProcessor()

class FileProcessingStates(StatesGroup):
    waiting_for_file = State()

@dp.message(Command("start"))
async def cmd_start(message: Message):
    """Обработка команды /start"""
    welcome_text = """
👋 Добро пожаловать в бот для сопоставления артикулов!

Я могу помочь вам:
📄 Обработать счета, коммерческие предложения и другие документы
🔍 Найти артикулы из вашей базы в присланных файлах
📊 Показать результаты сопоставления

Отправьте мне файл (PDF, изображение, Excel, Word), и я найду в нем артикулы из базы данных.

Команды:
/start - Начать работу
/help - Справка
/web - Открыть веб-интерфейс
"""
    await message.answer(welcome_text)

@dp.message(Command("help"))
async def cmd_help(message: Message):
    """Обработка команды /help"""
    help_text = """
📖 Справка по использованию бота:

1. Отправьте файл боту:
   - Изображения (JPG, PNG) - счета, накладные
   - PDF документы
   - Excel файлы (.xlsx, .xls)
   - Word документы (.docx)

2. Бот автоматически:
   - Распознает текст из файла
   - Найдет артикулы из вашей базы
   - Покажет результаты сопоставления

3. Веб-интерфейс:
   - Используйте /web для открытия веб-версии
   - Там вы можете загружать файлы и просматривать историю

Поддерживаемые форматы:
📷 Изображения: JPG, PNG
📄 Документы: PDF, DOCX
📊 Таблицы: XLSX, XLS
"""
    await message.answer(help_text)

@dp.message(Command("web"))
async def cmd_web(message: Message):
    """Открытие веб-интерфейса"""
    import time
    # Добавляем timestamp для предотвращения кэширования
    timestamp = int(time.time())
    webapp_url = f"{Config.WEB_APP_URL}?user_id={message.from_user.id}&v={timestamp}"
    
    # Используем ReplyKeyboardMarkup с WebApp кнопкой
    keyboard = types.ReplyKeyboardMarkup(
        keyboard=[[
            types.KeyboardButton(text="🌐 Открыть мини-приложение", web_app=types.WebAppInfo(url=webapp_url))
        ]],
        resize_keyboard=True,
        one_time_keyboard=True
    )
    
    await message.answer(
        "Нажмите кнопку ниже, чтобы открыть мини-приложение:",
        reply_markup=keyboard
    )

@dp.message(F.photo | F.document)
async def handle_file(message: Message, state: FSMContext):
    """Обработка файлов от пользователя"""
    await message.answer("⏳ Обрабатываю файл...")
    
    try:
        # Определяем тип файла и получаем файл
        if message.photo:
            file = message.photo[-1]  # Берем самое большое фото
            file_type = "image/jpeg"
            file_name = f"photo_{message.from_user.id}_{message.message_id}.jpg"
        elif message.document:
            file = message.document
            file_type = message.document.mime_type or "application/octet-stream"
            file_name = message.document.file_name or f"file_{message.from_user.id}_{message.message_id}"
            
            # Проверка типа файла
            if file_type not in Config.SUPPORTED_IMAGE_TYPES + Config.SUPPORTED_DOCUMENT_TYPES:
                await message.answer(
                    f"❌ Неподдерживаемый тип файла: {file_type}\n"
                    f"Поддерживаются: изображения (JPG, PNG), PDF, Excel, Word"
                )
                return
        else:
            await message.answer("❌ Не удалось определить тип файла")
            return
        
        # Скачиваем файл
        file_info = await bot.get_file(file.file_id)
        file_data = await bot.download_file(file_info.file_path)
        file_bytes = await file_data.read()
        
        # Сохраняем файл
        file_path = await file_processor.save_file(file_bytes, file_name)
        
        # Извлекаем текст
        await message.answer("🔍 Извлекаю текст из файла...")
        extracted_text = await file_processor.process_file(file_path, file_type)
        
        if not extracted_text.strip():
            await message.answer("⚠️ Не удалось извлечь текст из файла. Попробуйте другой файл.")
            return
        
        # Получаем артикулы из базы данных
        from database import async_session_maker
        async with async_session_maker() as session:
            result = await session.execute(select(Article))
            articles = result.scalars().all()
            article_numbers = [article.article_number for article in articles]
        
        if not article_numbers:
            await message.answer(
                "⚠️ База данных артикулов пуста. "
                "Добавьте артикулы через веб-интерфейс или API."
            )
            return
        
        # Ищем совпадения
        await message.answer("🔎 Ищу артикулы в документе...")
        matches = file_processor.extract_article_numbers(extracted_text, article_numbers)
        
        # Сохраняем результат в базу данных
        from database import async_session_maker
        processed_file_id = None
        async with async_session_maker() as session:
            processed_file = ProcessedFile(
                user_id=message.from_user.id,
                file_name=file_name,
                file_type=file_type,
                file_path=file_path,
                extracted_text=extracted_text[:10000],  # Ограничиваем размер
                matched_articles=json.dumps(matches, ensure_ascii=False),
                status="completed"
            )
            session.add(processed_file)
            await session.commit()
            await session.refresh(processed_file)
            processed_file_id = processed_file.id
            
            # Сохраняем детали совпадений
            for match in matches:
                # Находим артикул в базе
                article_result = await session.execute(
                    select(Article).where(Article.article_number == match["article"])
                )
                article = article_result.scalar_one_or_none()
                
                if article:
                    matched_article = MatchedArticle(
                        processed_file_id=processed_file.id,
                        article_id=article.id,
                        found_text=match["found_text"],
                        confidence=match["confidence"]
                    )
                    session.add(matched_article)
            
            await session.commit()
        
        # Формируем ответ
        if matches:
            response = f"✅ Найдено совпадений: {len(matches)}\n\n"
            for i, match in enumerate(matches[:10], 1):  # Показываем первые 10
                response += f"{i}. Артикул: {match['article']}\n"
                response += f"   Контекст: {match['found_text'][:100]}...\n"
                response += f"   Уверенность: {int(match['confidence'] * 100)}%\n\n"
            
            if len(matches) > 10:
                response += f"... и еще {len(matches) - 10} совпадений\n"
            
            response += f"\n🌐 Откройте веб-интерфейс для детального просмотра"
        else:
            response = "❌ Артикулы из базы данных не найдены в документе."
        
        await message.answer(response)
        
        # Предлагаем открыть веб-интерфейс (если есть совпадения и файл сохранен)
        if matches and processed_file_id:
            webapp_url = f"{Config.WEB_APP_URL}?user_id={message.from_user.id}&file_id={processed_file_id}"
            keyboard = types.InlineKeyboardMarkup(inline_keyboard=[[
                types.InlineKeyboardButton(text="🌐 Открыть детали", web_app=types.WebAppInfo(url=webapp_url))
            ]])
            await message.answer("Нажмите для просмотра деталей:", reply_markup=keyboard)
        
    except Exception as e:
        await message.answer(f"❌ Ошибка при обработке файла: {str(e)}")
        print(f"Ошибка обработки файла: {e}")

@dp.message()
async def handle_other_messages(message: Message):
    """Обработка прочих сообщений"""
    await message.answer(
        "Отправьте мне файл для обработки или используйте команды:\n"
        "/start - Начать\n"
        "/help - Справка\n"
        "/web - Веб-интерфейс"
    )

async def main():
    """Главная функция запуска бота"""
    # Инициализация базы данных
    await init_db()
    
    # Запуск бота с очисткой старых обновлений
    print("Бот запущен...")
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot, drop_pending_updates=True)

if __name__ == "__main__":
    asyncio.run(main())

