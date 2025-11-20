#!/bin/bash
# Скрипт для остановки всех процессов бота и API

echo "🛑 Остановка всех процессов..."

# Останавливаем все процессы бота
echo "Останавливаю процессы бота..."
pkill -9 -f "python.*bot.py" 2>/dev/null
pkill -9 -f "bot.py" 2>/dev/null

# Останавливаем все процессы API
echo "Останавливаю процессы API..."
pkill -9 -f "uvicorn.*api" 2>/dev/null
pkill -9 -f "api:app" 2>/dev/null

# Останавливаем процессы на портах
echo "Освобождаю порты..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

sleep 2

# Проверяем, что все остановлено
BOT_PROCESSES=$(ps aux | grep -E "[p]ython.*bot.py|[b]ot.py" | wc -l)
API_PROCESSES=$(ps aux | grep -E "[u]vicorn.*api|[a]pi:app" | wc -l)

if [ "$BOT_PROCESSES" -eq 0 ] && [ "$API_PROCESSES" -eq 0 ]; then
    echo "✅ Все процессы остановлены"
else
    echo "⚠️  Остались процессы:"
    ps aux | grep -E "[p]ython.*bot.py|[b]ot.py|[u]vicorn.*api|[a]pi:app" || true
fi


