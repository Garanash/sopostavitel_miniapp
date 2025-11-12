# Решение проблемы с мини-приложением

## Проблема
Telegram требует HTTPS для мини-приложений. Локальный HTTP (http://localhost:3000) не работает.

## Решение: Использовать ngrok

### Шаг 1: Запустить ngrok
```bash
ngrok http 3000
```

### Шаг 2: Скопировать HTTPS URL
После запуска ngrok вы увидите что-то вроде:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Скопируйте HTTPS URL (https://abc123.ngrok-free.app)

### Шаг 3: Обновить .env файл
```bash
# Отредактируйте .env файл
nano .env

# Или через команду:
sed -i '' 's|WEB_APP_URL=.*|WEB_APP_URL=https://ВАШ_NGROK_URL.ngrok-free.app|' .env
```

### Шаг 4: Перезапустить бота
```bash
pkill -f "python bot.py"
source venv/bin/activate
python bot.py &
```

### Шаг 5: Протестировать
1. Откройте бота в Telegram
2. Отправьте `/web`
3. Нажмите кнопку
4. Мини-приложение должно открыться!

## Альтернатива: Локальный HTTPS

Если хотите использовать локальный HTTPS без ngrok:

### Установить mkcert
```bash
brew install mkcert
mkcert -install
mkcert localhost 127.0.0.1
```

### Настроить Vite для HTTPS
Отредактируйте `web-app/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    https: {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem'),
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
```

Затем обновите `.env`:
```
WEB_APP_URL=https://localhost:3000
```

## Важно!
- Ngrok URL меняется при каждом перезапуске (если нет платного аккаунта)
- Для продакшена используйте постоянный HTTPS хостинг
- Убедитесь, что веб-приложение запущено на порту 3000

