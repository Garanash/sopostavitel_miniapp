# Быстрый старт

## 1. Установка зависимостей

### Python
```bash
pip install -r requirements.txt
```

### Node.js (для веб-приложения)
```bash
cd web-app
npm install
cd ..
```

### Tesseract OCR
**macOS:**
```bash
brew install tesseract tesseract-lang
```

**Linux:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-rus
```

## 2. Настройка

Создайте файл `.env`:
```bash
cp .env.example .env
```

Отредактируйте `.env` и укажите токен бота:
```
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
```

## 3. Инициализация базы данных

```bash
python init_sample_data.py
```

## 4. Запуск

### Вариант 1: Все сервисы сразу
```bash
./start_all.sh
```

Затем в отдельном терминале:
```bash
cd web-app
npm run dev
```

### Вариант 2: По отдельности

**Терминал 1 - API:**
```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

**Терминал 2 - Бот:**
```bash
python bot.py
```

**Терминал 3 - Веб-приложение:**
```bash
cd web-app
npm run dev
```

## 5. Использование

1. Найдите вашего бота в Telegram
2. Отправьте `/start`
3. Отправьте файл (PDF, изображение, Excel, Word)
4. Бот найдет артикулы из базы данных
5. Используйте `/web` для открытия веб-интерфейса

## Полезные команды

- `/start` - Начать работу с ботом
- `/help` - Справка
- `/web` - Открыть веб-интерфейс

## Проверка работы

1. API должен быть доступен: http://localhost:8000
2. Веб-приложение: http://localhost:3000
3. Бот должен отвечать на команды в Telegram

## Добавление артикулов

Через веб-интерфейс:
1. Откройте веб-интерфейс
2. Перейдите на вкладку "Артикулы"
3. Нажмите "Добавить артикул"
4. Заполните форму

Через API:
```bash
curl -X POST http://localhost:8000/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "article_number": "TEST-001",
    "name": "Тестовый товар",
    "price": 1000.00
  }'
```

