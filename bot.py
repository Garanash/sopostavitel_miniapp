import asyncio
import os
import aiohttp
import io
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
👋 <b>Добро пожаловать в бот для сопоставления артикулов!</b>

Я помогу вам автоматически находить артикулы из вашей базы данных в различных документах.

<b>📋 Что я умею:</b>
• 📄 <b>Обрабатывать файлы</b> - счета, коммерческие предложения, накладные
• 🔍 <b>Находить артикулы</b> - автоматический поиск в присланных документах
• 📊 <b>Показывать результаты</b> - детальное сопоставление с процентами совпадения
• 🤖 <b>Использовать AI</b> - интеллектуальный поиск и распознавание

<b>🚀 Как начать работу:</b>
1️⃣ <b>Отправьте файл</b> боту (PDF, изображение, Excel, Word)
2️⃣ <b>Используйте команду /web</b> для открытия веб-интерфейса
3️⃣ <b>Просмотрите результаты</b> в удобном табличном формате

<b>📱 Команды:</b>
/start - Начать работу
/help - Подробная инструкция
/web - Открыть веб-интерфейс

<b>💡 Совет:</b> Для лучших результатов используйте веб-интерфейс - там доступны все функции!
"""
    await message.answer(welcome_text, parse_mode='HTML')

@dp.message(Command("help"))
async def cmd_help(message: Message):
    """Обработка команды /help"""
    help_text = """
📖 <b>Инструкция по использованию веб-приложения</b>

<b>🌐 Открытие веб-интерфейса:</b>
Используйте команду <b>/web</b> для открытия мини-приложения в Telegram.

<b>📑 Вкладки в веб-приложении:</b>

<b>1️⃣ Вкладка "Файл"</b>
• <b>Загрузите файл</b> - перетащите или выберите файл для обработки
• Поддерживаются: PDF, изображения (JPG, PNG), Excel (XLSX, XLS), Word (DOCX)
• <b>Автоматическое распознавание</b> - система извлечет текст и найдет артикулы
• <b>Результаты в таблице</b> - увидите что искалось и что найдено
• <b>Подтверждение совпадений</b> - кнопка "✓ Подтвердить" для сохранения

<b>2️⃣ Вкладка "Артикул"</b>
• <b>Поиск по артикулу</b> - введите артикул или номенклатуру в поисковую строку
• <b>Результаты с процентом</b> - увидите все совпадения с процентом схожести
• <b>Кнопка "Подробнее"</b> - откроет полную информацию о найденной записи

<b>3️⃣ Вкладка "Таблица"</b>
• <b>Просмотр базы данных</b> - все записи с артикулом АГБ
• <b>Добавление строк</b> - кнопка "➕ Добавить строку"
• <b>Редактирование</b> - кнопка "✏️ Редактировать" в модальном окне
• <b>Удаление</b> - кнопка "🗑️ Удалить" в модальном окне
• <b>Пагинация</b> - по 20 записей на странице

<b>🔍 Особенности поиска:</b>
• <b>Интеллектуальный поиск</b> - AI автоматически определяет структуру Excel файлов
• <b>Поиск по словам</b> - система ищет точные совпадения слов
• <b>Подтвержденные сопоставления</b> - подтвержденные результаты сохраняются на 100%

<b>📊 Результаты обработки файла:</b>
• <b>Таблица результатов</b> - все обработанные строки
• <b>Колонка "Что искалось"</b> - распознанный текст из файла
• <b>Колонка "Что найдено"</b> - найденный артикул АГБ / номенклатура или "Не найдено"
• <b>Колонка "Совпадение"</b> - процент совпадения
• <b>Экспорт в Excel</b> - кнопка "📥 Выгрузить в Excel"

<b>📁 Поддерживаемые форматы файлов:</b>
📷 Изображения: JPG, JPEG, PNG
📄 Документы: PDF, DOCX
📊 Таблицы: XLSX, XLS, CSV

<b>💡 Полезные советы:</b>
• Для Excel файлов система автоматически определит столбец с артикулами
• Если ничего не найдено, проверьте правильность написания в базе данных
• Используйте подтверждение совпадений для улучшения точности поиска
• Все поля при добавлении/редактировании опциональны (по умолчанию "-")

<b>❓ Нужна помощь?</b>
Если возникли вопросы, используйте команду /start для возврата в главное меню.
"""
    await message.answer(help_text, parse_mode='HTML')

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
    """Обработка файлов от пользователя через API"""
    processing_msg = await message.answer("⏳ Обрабатываю файл...")
    
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
                await processing_msg.edit_text(
                    f"❌ Неподдерживаемый тип файла: {file_type}\n"
                    f"Поддерживаются: изображения (JPG, PNG), PDF, Excel, Word"
                )
                return
        else:
            await processing_msg.edit_text("❌ Не удалось определить тип файла")
            return
        
        # Скачиваем файл
        file_info = await bot.get_file(file.file_id)
        file_data = await bot.download_file(file_info.file_path)
        file_bytes = await file_data.read()
        
        # Отправляем файл в API для обработки
        await processing_msg.edit_text("🔍 Отправляю файл на обработку...")
        
        api_url = f"{Config.API_URL}/api/mappings/upload"
        form_data = aiohttp.FormData()
        form_data.add_field('file', 
                          io.BytesIO(file_bytes),
                          filename=file_name,
                          content_type=file_type)
        
        async with aiohttp.ClientSession() as session:
            async with session.post(api_url, data=form_data, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    await processing_msg.edit_text(f"❌ Ошибка API: {error_text}")
                    return
                
                result = await resp.json()
        
        # Формируем ответ с результатами
        all_results = result.get('results', [])
        matches_count = result.get('matches_count', 0)
        recognized_count = result.get('recognized_count', 0)
        
        if not all_results:
            await processing_msg.edit_text(
                f"✅ Обработано строк: {recognized_count}\n"
                f"❌ Совпадений не найдено"
            )
            return
        
        # Формируем таблицу результатов
        response_text = f"<b>📊 Результаты обработки файла</b>\n\n"
        response_text += f"Обработано строк: <b>{recognized_count}</b>\n"
        response_text += f"Найдено совпадений: <b>{matches_count}</b>\n\n"
        response_text += f"<b>📋 Таблица результатов:</b>\n"
        response_text += f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        
        # Показываем первые 20 результатов
        shown_count = min(20, len(all_results))
        for i, item in enumerate(all_results[:shown_count], 1):
            recognized = item.get('recognized_text', '-')
            has_match = item.get('mapping') and item.get('match_score') is not None
            
            if has_match:
                mapping = item.get('mapping', {})
                article_agb = mapping.get('article_agb') or '-'
                nomenclature_agb = mapping.get('nomenclature_agb') or '-'
                match_score = item.get('match_score', 0)
                
                response_text += f"<b>{i}.</b> <code>{recognized[:30]}</code>\n"
                response_text += f"   ➜ <b>Найдено:</b> {article_agb} / {nomenclature_agb[:30]}\n"
                response_text += f"   ➜ <b>Совпадение:</b> {match_score:.1f}%\n\n"
            else:
                response_text += f"<b>{i}.</b> <code>{recognized[:30]}</code>\n"
                response_text += f"   ➜ <b>Не найдено</b>\n\n"
        
        if len(all_results) > shown_count:
            response_text += f"\n... и еще {len(all_results) - shown_count} строк\n"
        
        # Отправляем результаты частями (Telegram ограничение 4096 символов)
        max_length = 4000
        if len(response_text) > max_length:
            # Отправляем первую часть
            await processing_msg.edit_text(response_text[:max_length] + "...", parse_mode='HTML')
            # Отправляем остальное
            remaining = response_text[max_length:]
            chunks = [remaining[i:i+max_length] for i in range(0, len(remaining), max_length)]
            for chunk in chunks:
                await message.answer(chunk, parse_mode='HTML')
        else:
            await processing_msg.edit_text(response_text, parse_mode='HTML')
        
        # Предлагаем открыть веб-интерфейс
        webapp_url = f"{Config.WEB_APP_URL}?user_id={message.from_user.id}"
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=[[
            types.InlineKeyboardButton(text="🌐 Открыть веб-интерфейс", web_app=types.WebAppInfo(url=webapp_url))
        ]])
        await message.answer("💡 Для просмотра всех результатов используйте веб-интерфейс:", reply_markup=keyboard)
        
    except Exception as e:
        await processing_msg.edit_text(f"❌ Ошибка при обработке файла: {str(e)}")
        print(f"Ошибка обработки файла: {e}")
        import traceback
        traceback.print_exc()

@dp.message()
async def handle_other_messages(message: Message):
    """Обработка текстовых сообщений - поиск артикула"""
    search_query = message.text.strip()
    
    if not search_query or len(search_query) < 2:
        await message.answer(
            "Отправьте мне файл для обработки или используйте команды:\n\n"
            "<b>/start</b> - Начать работу\n"
            "<b>/help</b> - Подробная инструкция\n"
            "<b>/web</b> - Открыть веб-интерфейс\n\n"
            "Или введите артикул для поиска в базе данных.",
            parse_mode='HTML'
        )
        return
    
    # Ищем артикул в базе данных через API
    search_msg = await message.answer(f"🔍 Ищу артикул: <code>{search_query}</code>...", parse_mode='HTML')
    
    try:
        api_url = f"{Config.API_URL}/api/mappings/search"
        params = {
            'query': search_query,
            'min_score': 0,
            'limit': 20
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    await search_msg.edit_text(f"❌ Ошибка API: {error_text}")
                    return
                
                results = await resp.json()
        
        # Фильтруем только записи с артикулом АГБ
        filtered_results = [r for r in results if r.get('mapping', {}).get('article_agb')]
        
        if not filtered_results:
            await search_msg.edit_text(
                f"❌ <b>Артикул не найден</b>\n\n"
                f"По запросу <code>{search_query}</code> ничего не найдено в базе данных.\n\n"
                f"Попробуйте:\n"
                f"• Проверить правильность написания\n"
                f"• Использовать веб-интерфейс для детального поиска",
                parse_mode='HTML'
            )
            return
        
        # Формируем ответ с результатами
        response_text = f"<b>🔍 Результаты поиска:</b> <code>{search_query}</code>\n\n"
        response_text += f"Найдено совпадений: <b>{len(filtered_results)}</b>\n\n"
        
        # Показываем первые 10 результатов
        for i, item in enumerate(filtered_results[:10], 1):
            mapping = item.get('mapping', {})
            match_score = item.get('match_score', 0)
            article_agb = mapping.get('article_agb') or '-'
            nomenclature_agb = mapping.get('nomenclature_agb') or '-'
            
            response_text += f"<b>{i}.</b> <code>{article_agb}</code>\n"
            response_text += f"   {nomenclature_agb[:50]}\n"
            response_text += f"   ➜ <b>Совпадение:</b> {match_score:.1f}%\n\n"
        
        if len(filtered_results) > 10:
            response_text += f"\n... и еще {len(filtered_results) - 10} совпадений\n"
        
        # Отправляем результаты
        max_length = 4000
        if len(response_text) > max_length:
            await search_msg.edit_text(response_text[:max_length] + "...", parse_mode='HTML')
            remaining = response_text[max_length:]
            chunks = [remaining[i:i+max_length] for i in range(0, len(remaining), max_length)]
            for chunk in chunks:
                await message.answer(chunk, parse_mode='HTML')
        else:
            await search_msg.edit_text(response_text, parse_mode='HTML')
        
        # Предлагаем открыть веб-интерфейс для детального просмотра
        webapp_url = f"{Config.WEB_APP_URL}?user_id={message.from_user.id}"
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=[[
            types.InlineKeyboardButton(text="🌐 Открыть веб-интерфейс", web_app=types.WebAppInfo(url=webapp_url))
        ]])
        await message.answer("💡 Для просмотра подробной информации используйте веб-интерфейс:", reply_markup=keyboard)
        
    except Exception as e:
        await search_msg.edit_text(f"❌ Ошибка при поиске: {str(e)}")
        print(f"Ошибка поиска артикула: {e}")
        import traceback
        traceback.print_exc()

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

