#!/usr/bin/env python3
"""
Скрипт для проверки URL мини-приложения
"""
import os
import sys
import ssl
import socket
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from dotenv import load_dotenv

load_dotenv()

def check_ssl_certificate(hostname, port=443):
    """Проверка SSL сертификата"""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                return {
                    'valid': True,
                    'subject': dict(x[0] for x in cert['subject']),
                    'issuer': dict(x[0] for x in cert['issuer']),
                    'version': cert['version']
                }
    except Exception as e:
        return {'valid': False, 'error': str(e)}

def check_url_accessibility(url):
    """Проверка доступности URL"""
    try:
        req = Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        with urlopen(req, timeout=10) as response:
            content = response.read()
            return {
                'accessible': True,
                'status_code': response.getcode(),
                'headers': dict(response.headers),
                'content_length': len(content),
                'final_url': response.geturl()
            }
    except HTTPError as e:
        return {
            'accessible': True,  # URL доступен, но с ошибкой HTTP
            'status_code': e.code,
            'error': f'HTTP Error: {e.code}'
        }
    except URLError as e:
        return {'accessible': False, 'error': f'URL Error: {str(e)}'}
    except Exception as e:
        return {'accessible': False, 'error': str(e)}

def main():
    print("=" * 60)
    print("ПРОВЕРКА URL МИНИ-ПРИЛОЖЕНИЯ")
    print("=" * 60)
    
    # Получаем URL из переменных окружения
    web_app_url = os.getenv("WEB_APP_URL", "https://sopostavitel.ru")
    
    print(f"\n1. URL из .env: {web_app_url}")
    
    # Парсим URL
    parsed = urlparse(web_app_url)
    hostname = parsed.hostname
    scheme = parsed.scheme
    path = parsed.path
    
    print(f"   - Схема: {scheme}")
    print(f"   - Хост: {hostname}")
    print(f"   - Путь: {path}")
    
    # Проверяем схему
    if scheme != 'https':
        print(f"\n❌ ОШИБКА: URL должен начинаться с https://")
        print(f"   Текущий URL: {web_app_url}")
        return False
    
    print(f"\n✅ Схема корректна (HTTPS)")
    
    # Проверяем SSL сертификат
    print(f"\n2. Проверка SSL сертификата для {hostname}...")
    ssl_info = check_ssl_certificate(hostname)
    
    if ssl_info.get('valid'):
        print(f"   ✅ SSL сертификат валиден")
        print(f"   - Subject: {ssl_info.get('subject', {}).get('commonName', 'N/A')}")
        print(f"   - Issuer: {ssl_info.get('issuer', {}).get('organizationName', 'N/A')}")
    else:
        print(f"   ❌ ОШИБКА SSL: {ssl_info.get('error', 'Unknown error')}")
        return False
    
    # Проверяем доступность URL
    print(f"\n3. Проверка доступности URL: {web_app_url}...")
    access_info = check_url_accessibility(web_app_url)
    
    if access_info.get('accessible'):
        print(f"   ✅ URL доступен")
        print(f"   - HTTP Status: {access_info.get('status_code')}")
        print(f"   - Размер контента: {access_info.get('content_length')} байт")
        print(f"   - Финальный URL: {access_info.get('final_url')}")
        
        # Проверяем, что это HTML
        content_type = access_info.get('headers', {}).get('Content-Type', '')
        if 'text/html' in content_type:
            print(f"   ✅ Контент-тип корректный: {content_type}")
        else:
            print(f"   ⚠️  Неожиданный контент-тип: {content_type}")
    else:
        print(f"   ❌ URL недоступен: {access_info.get('error', 'Unknown error')}")
        return False
    
    # Проверяем, что URL подходит для Telegram Mini App
    print(f"\n4. Проверка требований Telegram Mini App...")
    
    requirements = {
        'HTTPS': scheme == 'https',
        'Valid SSL': ssl_info.get('valid', False),
        'Accessible': access_info.get('accessible', False),
        'Status 200': access_info.get('status_code') == 200
    }
    
    all_ok = all(requirements.values())
    
    for req, status in requirements.items():
        status_icon = "✅" if status else "❌"
        print(f"   {status_icon} {req}: {status}")
    
    print("\n" + "=" * 60)
    if all_ok:
        print("✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
        print(f"✅ URL готов для использования в Telegram Mini App: {web_app_url}")
        print("\nПример URL с параметрами:")
        print(f"   {web_app_url}?user_id=123456789")
    else:
        print("❌ НЕКОТОРЫЕ ПРОВЕРКИ НЕ ПРОЙДЕНЫ")
        print("   Исправьте ошибки выше")
    print("=" * 60)
    
    return all_ok

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

