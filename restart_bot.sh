#!/bin/bash
# Скрипт для перезапуска бота

cd /root/sopostavitel

# Останавливаем все процессы бота
pkill -9 -f "python.*bot.py"
sleep 2

# Активируем виртуальное окружение
source venv/bin/activate

# Запускаем бота в фоне
nohup python bot.py > /var/log/sopostavitel_bot.log 2>&1 &

sleep 3

# Проверяем, что бот запустился
if ps aux | grep -q "[p]ython.*bot.py"; then
    echo "✅ Бот успешно запущен"
    tail -5 /var/log/sopostavitel_bot.log
else
    echo "❌ Ошибка запуска бота"
    tail -20 /var/log/sopostavitel_bot.log
fi

