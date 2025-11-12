#!/bin/bash

# Скрипт для настройки ngrok и обновления URL в боте

echo "🔧 Настройка ngrok для мини-приложения..."

# Останавливаем старый ngrok
pkill ngrok 2>/dev/null
sleep 2

# Запускаем ngrok
echo "🚀 Запуск ngrok туннеля на порт 3000..."
ngrok http 3000 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

echo "⏳ Ожидание запуска ngrok..."
sleep 5

# Получаем HTTPS URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('tunnels'):
        for tunnel in data['tunnels']:
            if tunnel.get('proto') == 'https':
                print(tunnel['public_url'])
                break
except:
    pass
" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Не удалось получить ngrok URL"
    echo "Проверьте логи: tail -f /tmp/ngrok.log"
    exit 1
fi

echo "✅ Ngrok URL: $NGROK_URL"

# Обновляем .env файл
if [ -f .env ]; then
    # Удаляем старый WEB_APP_URL если есть
    sed -i '' '/^WEB_APP_URL=/d' .env
    # Добавляем новый
    echo "WEB_APP_URL=$NGROK_URL" >> .env
    echo "✅ Обновлен .env файл"
else
    echo "WEB_APP_URL=$NGROK_URL" > .env
    echo "✅ Создан .env файл"
fi

echo ""
echo "📝 Следующие шаги:"
echo "1. Перезапустите бота: pkill -f 'python bot.py' && source venv/bin/activate && python bot.py &"
echo "2. Отправьте /web боту"
echo "3. Мини-приложение должно открыться!"
echo ""
echo "🌐 Ngrok веб-интерфейс: http://localhost:4040"
echo "🔗 HTTPS URL: $NGROK_URL"

