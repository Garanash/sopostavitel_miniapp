#!/bin/bash

# Скрипт для настройки локального HTTPS

echo "🔧 Настройка локального HTTPS для мини-приложения..."

# Проверяем наличие mkcert
if ! command -v mkcert &> /dev/null; then
    echo "📦 Установка mkcert..."
    brew install mkcert
fi

# Устанавливаем локальный CA
echo "🔐 Установка локального CA..."
mkcert -install

# Переходим в директорию web-app
cd web-app

# Создаем сертификаты
echo "📜 Создание SSL сертификатов..."
mkcert localhost 127.0.0.1 ::1

# Переименовываем файлы
if [ -f "localhost+2.pem" ]; then
    mv localhost+2.pem localhost.pem
fi
if [ -f "localhost+2-key.pem" ]; then
    mv localhost+2-key.pem localhost-key.pem
fi

cd ..

# Обновляем .env
sed -i '' '/^WEB_APP_URL=/d' .env
echo "WEB_APP_URL=https://localhost:3000" >> .env

echo ""
echo "✅ HTTPS настроен!"
echo "📝 Следующие шаги:"
echo "1. Перезапустите веб-приложение:"
echo "   cd web-app && npm run dev"
echo "2. Перезапустите бота:"
echo "   pkill -f 'python bot.py' && source venv/bin/activate && python bot.py &"
echo "3. Отправьте /web боту"
echo ""
echo "⚠️ При первом открытии браузер может показать предупреждение о сертификате"
echo "   Нажмите 'Продолжить' или 'Advanced' -> 'Proceed to localhost'"

