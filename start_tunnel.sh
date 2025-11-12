#!/bin/bash

cd "$(dirname "$0")"

# Убиваем старые процессы cloudflared
pkill -f cloudflared 2>/dev/null
sleep 2

echo "🚀 Запускаю Cloudflare Tunnel..."
echo "⏳ Ожидайте получения HTTPS URL..."

# Запускаем cloudflared в фоне и перенаправляем вывод
cloudflared tunnel --url http://localhost:3000 > /tmp/cloudflared_tunnel.log 2>&1 &
TUNNEL_PID=$!

# Ждем появления URL в логе
for i in {1..30}; do
    sleep 1
    HTTPS_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared_tunnel.log 2>/dev/null | head -1)
    if [ -n "$HTTPS_URL" ]; then
        echo ""
        echo "✅ HTTPS URL получен: $HTTPS_URL"
        echo ""
        
        # Обновляем .env
        if [ -f .env ]; then
            # Удаляем старую строку WEB_APP_URL
            sed -i '' '/^WEB_APP_URL=/d' .env
            # Добавляем новую
            echo "WEB_APP_URL=$HTTPS_URL" >> .env
            echo "✅ .env обновлен"
        else
            echo "WEB_APP_URL=$HTTPS_URL" > .env
            echo "✅ .env создан"
        fi
        
        echo ""
        echo "🔄 Перезапускаю бота..."
        pkill -f "python.*bot.py" 2>/dev/null
        sleep 2
        
        if [ -d venv ]; then
            source venv/bin/activate
            python bot.py > bot.log 2>&1 &
            echo "✅ Бот перезапущен"
        else
            echo "⚠️ Виртуальное окружение не найдено"
        fi
        
        echo ""
        echo "╔══════════════════════════════════════════════════════╗"
        echo "║  ✅ МИНИ-ПРИЛОЖЕНИЕ НАСТРОЕНО!                       ║"
        echo "╠══════════════════════════════════════════════════════╣"
        echo "║                                                      ║"
        echo "║  🌐 HTTPS URL: $HTTPS_URL"
        echo "║                                                      ║"
        echo "║  📱 Теперь в Telegram:                               ║"
        echo "║     1. Откройте бота                                 ║"
        echo "║     2. Отправьте команду /web                        ║"
        echo "║     3. Нажмите на кнопку - откроется мини-приложение ║"
        echo "║                                                      ║"
        echo "║  ⚠️  Туннель работает в фоне                       ║"
        echo "║     Для остановки: pkill cloudflared                 ║"
        echo "║                                                      ║"
        echo "╚══════════════════════════════════════════════════════╝"
        echo ""
        echo "PID туннеля: $TUNNEL_PID"
        echo "$TUNNEL_PID" > /tmp/cloudflared.pid
        
        exit 0
    fi
done

echo "❌ Не удалось получить HTTPS URL за 30 секунд"
echo "Проверьте логи: cat /tmp/cloudflared_tunnel.log"
kill $TUNNEL_PID 2>/dev/null
exit 1
