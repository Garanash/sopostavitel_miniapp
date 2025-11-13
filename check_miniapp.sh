#!/bin/bash
echo "=========================================="
echo "ПРОВЕРКА МИНИ-ПРИЛОЖЕНИЯ TELEGRAM"
echo "=========================================="
echo ""
echo "1. Проверяю доступность сайта..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://sopostavitel.ru

echo ""
echo "2. Проверяю SSL сертификат..."
echo | openssl s_client -connect sopostavitel.ru:443 -servername sopostavitel.ru 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null

echo ""
echo "3. Проверяю, что сайт возвращает HTML..."
curl -s https://sopostavitel.ru | head -5

echo ""
echo "4. Проверяю заголовки..."
curl -I https://sopostavitel.ru 2>&1 | head -10

echo ""
echo "=========================================="
echo "РЕКОМЕНДАЦИИ ДЛЯ TELEGRAM MINI APP:"
echo "=========================================="
echo "1. URL должен начинаться с https://"
echo "2. SSL сертификат должен быть валидным"
echo "3. Сайт должен возвращать HTTP 200"
echo "4. Сайт должен быть доступен публично"
echo ""
echo "Тестовый URL для бота:"
echo "https://sopostavitel.ru?user_id=123456789"
