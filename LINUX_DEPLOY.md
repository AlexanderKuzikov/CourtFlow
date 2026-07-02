# Linux Deploy — CourtFlow

> Инструкция по развёртыванию на офисном Linux-сервере.
> Менеджер процессов: **pm2**. Запуск без root после первичной настройки.

---

## Требования

- Node.js >= 20 (рекомендуется v24, как на Windows)
- npm >= 10
- git
- Puppeteer: системные зависимости Chromium
- pm2 (устанавливается через npm)

---

## 1. Системные зависимости Puppeteer

Puppeteer скачивает bundled Chromium, но ему нужны системные библиотеки.

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y \
  ca-certificates fonts-liberation \
  libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 \
  libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
  libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils
```

> **Важно:** Puppeteer в headless-режиме на Linux работает без `--no-sandbox` если запускается не от root.
> Если запускаете от root — добавьте `--no-sandbox` в `session.ts` (уже добавлен).

---

## 2. Установка проекта

```bash
# Клонируем в /opt/courtflow
sudo mkdir -p /opt/courtflow
sudo chown $USER:$USER /opt/courtflow
git clone https://github.com/AlexanderKuzikov/CourtFlow.git /opt/courtflow
cd /opt/courtflow

# Устанавливаем зависимости (включая Puppeteer — скачает Chromium ~170MB)
npm install

# Создаём .env
cat > .env << 'EOF'
RUCAPTCHA_API_KEY=ВАШ_КЛЮЧ_ЗДЕСЬ
EOF
```

---

## 3. Проверка перед запуском

```bash
# Smoke-тест (без браузера)
npm run test:smoke

# Тестовый прогон парсера (убедиться что magistrate работает)
npm run parse
```

Ожидаемый вывод последней строки:
```
[orchestrator] Готово. OK: 26, FAIL: 0, CAPTCHA: 0
```

---

## 4. Установка и запуск pm2

```bash
# Установка pm2 глобально
npm install -g pm2

# Запуск обоих процессов по ecosystem-конфигу
pm2 start ecosystem.config.cjs

# Проверка статуса
pm2 status
pm2 logs courtflow-viewer --lines 20
pm2 logs courtflow-parser --lines 20
```

---

## 5. Автозапуск при ребуте

```bash
# pm2 выдаст команду — её нужно выполнить с sudo
pm2 startup
# Скопировать и выполнить предложенную команду, например:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u user --hp /home/user

# Сохранить текущий список процессов
pm2 save
```

---

## 6. Управление

```bash
pm2 status                        # статус всех процессов
pm2 restart courtflow-viewer      # перезапустить viewer
pm2 restart courtflow-parser      # запустить парсер вручную (вне расписания)
pm2 stop courtflow-parser         # остановить
pm2 logs courtflow-viewer         # логи viewer в реальном времени
pm2 logs courtflow-parser         # логи парсера
pm2 monit                         # интерактивный дашборд
```

---

## 7. Расписание парсера

В `ecosystem.config.cjs` задано:
```
cron_restart: '0 */6 * * *'   // каждые 6 часов: 00:00, 06:00, 12:00, 18:00
```

Чтобы изменить расписание — отредактируйте `ecosystem.config.cjs` и выполните:
```bash
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

---

## 8. Обновление проекта

```bash
cd /opt/courtflow
git pull
npm install           # если изменились зависимости
pm2 restart all
pm2 save
```

---

## Известные особенности Linux

| Особенность | Решение |
|---|---|
| Puppeteer headless без дисплея | Работает штатно на Linux (в отличие от Windows) |
| `--no-sandbox` | Уже добавлен в `session.ts` (нужен при запуске от root) |
| `--ignore-certificate-errors` | Уже добавлен (wildcard SSL msudrf.ru) |
| Права на `/opt/courtflow` | `chown $USER:$USER` при установке |
| Порт viewer | По умолчанию из `config.json`, убедитесь что открыт в firewall |

---

## Быстрая проверка после деплоя

```bash
pm2 status                   # оба процесса online
curl http://localhost:PORT    # viewer отвечает
cat logs/run-log-$(date +%F).json | tail -5   # последние результаты парсера
```
