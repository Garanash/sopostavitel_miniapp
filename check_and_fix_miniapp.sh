#!/bin/bash
# Скрипт для проверки и исправления настроек мини-приложения на сервере

SERVER="root@94.241.170.219"
PASSWORD="wkLxhzUGcc_gX6"
DOMAIN="sopostavitel.ru"

echo "=========================================="
echo "ПРОВЕРКА И ИСПРАВЛЕНИЕ МИНИ-ПРИЛОЖЕНИЯ"
echo "=========================================="
echo ""

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 "$SERVER" << 'REMOTE_SCRIPT'
set -e

echo "1. Проверяю текущий WEB_APP_URL в .env..."
cd /root/sopostavitel
if [ -f .env ]; then
    CURRENT_URL=$(grep "WEB_APP_URL" .env | cut -d'=' -f2 || echo "не найден")
    echo "   Текущий URL: $CURRENT_URL"
else
    echo "   ❌ Файл .env не найден!"
    exit 1
fi

echo ""
echo "2. Обновляю WEB_APP_URL на https://sopostavitel.ru..."
if grep -q "WEB_APP_URL" .env; then
    sed -i 's|WEB_APP_URL=.*|WEB_APP_URL=https://sopostavitel.ru|g' .env
else
    echo "WEB_APP_URL=https://sopostavitel.ru" >> .env
fi

echo "   ✅ URL обновлен"
echo ""
echo "3. Проверяю обновленный URL:"
grep "WEB_APP_URL" .env

echo ""
echo "4. Проверяю доступность сайта..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://sopostavitel.ru)
echo "   HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" != "200" ]; then
    echo "   ⚠️  Предупреждение: HTTP статус не 200"
fi

echo ""
echo "5. Проверяю SSL сертификат..."
SSL_CHECK=$(echo | openssl s_client -connect sopostavitel.ru:443 -servername sopostavitel.ru 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -o "CN=.*" || echo "ошибка")
echo "   SSL Subject: $SSL_CHECK"

echo ""
echo "6. Останавливаю бота..."
pkill -f 'python bot.py' || echo "   Бот не был запущен"
sleep 2

echo ""
echo "7. Запускаю бота с новым URL..."
cd /root/sopostavitel
source venv/bin/activate
nohup python bot.py > /var/log/sopostavitel_bot.log 2>&1 &
sleep 3

echo ""
echo "8. Проверяю, что бот запущен..."
if ps aux | grep -v grep | grep -q 'python bot.py'; then
    echo "   ✅ Бот запущен"
    ps aux | grep 'python bot.py' | grep -v grep | head -1
else
    echo "   ❌ Бот не запустился!"
    echo "   Проверьте логи: tail -50 /var/log/sopostavitel_bot.log"
    exit 1
fi

echo ""
echo "9. Проверяю последние логи бота на ошибки:"
tail -20 /var/log/sopostavitel_bot.log | grep -i "error\|exception\|traceback" || echo "   ✅ Нет ошибок в логах"

echo ""
echo "=========================================="
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА"
echo "=========================================="
echo ""
echo "Тестовый URL для проверки:"
echo "https://sopostavitel.ru?user_id=123456789"
echo ""
echo "Проверьте в Telegram:"
echo "1. Отправьте боту команду /web"
echo "2. Нажмите кнопку 'Открыть мини-приложение'"
echo "3. Если не открывается, проверьте логи бота"
REMOTE_SCRIPT

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Скрипт выполнен успешно"
    echo ""
    echo "Теперь попробуйте открыть мини-приложение в Telegram:"
    echo "1. Отправьте боту команду /web"
    echo "2. Нажмите кнопку '🌐 Открыть мини-приложение'"
else
    echo ""
    echo "❌ Ошибка при выполнении скрипта"
fi

