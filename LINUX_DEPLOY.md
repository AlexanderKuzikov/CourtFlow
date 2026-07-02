# Linux Deploy — CourtFlow

> Инструкция по развёртыванию на офисном Linux-сервере.
> ОС: **Ubuntu**. Менеджер процессов: **pm2**.

---

## Чеклист (быстрый старт)

```bash
# 1. Node.js 24 (eсли ещё не установлен)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # должно быть v24.x.x

# 2. Системные зависимости Chromium для Puppeteer
sudo apt-get install -y \
  ca-certificates fonts-liberation libappindicator3-1 libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 wget xdg-utils

# 3. Проект
 sudo mkdir -p /opt/courtflow
sudo chown $USER:$USER /opt/courtflow
git clone https://github.com/AlexanderKuzikov/CourtFlow.git /opt/courtflow
cd /opt/courtflow
npm install          # ~2-3 мин, скачивает Chromium (~170 MB)

# 4. .env
cat > /opt/courtflow/.env << 'EOF'
RUCAPTCHA_API_KEY=ВАШ_КЛЮЧ_ЗДЕСЬ
EOF

# 5. Проверка
npm run test:smoke
npm run parse
# Ожидаем: [orchestrator] Готово. OK: 26, FAIL: 0, CAPTCHA: 0

# 6. pm2
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 startup               # выдаст команду — скопировать и выполнить
pm2 save

# 7. Быстрая проверка
pm2 status
curl http://localhost:3000    # или другой порт из config.json
```

---

## Подробнее

### Node.js — если уже установлен, но старая версия

```bash
# Удалить старый Node.js и установить v24 через nvm (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
nvm alias default 24
```

### Puppeteer на Linux — headless без дисплея

Na Linux Puppeteer работает в headless-режиме **штатно** — в отличие от Windows, никаких `ERR_NETWORK_ACCESS_DENIED` не будет.

Флаги в `session.ts` уже настроены:
- `--no-sandbox` — необходим если запуск от root или в контейнере
- `--ignore-certificate-errors` — wildcard SSL msudrf.ru
- `--disable-features=NetworkServiceInProcess`

> Если запускаете **не от root** — `--no-sandbox` фактически не нужен, но вреда не приносит.

### pm2 — управление

```bash
pm2 status                        # статус всех процессов
pm2 logs courtflow-viewer         # логи viewer
pm2 logs courtflow-parser         # логи парсера
pm2 restart courtflow-viewer      # перезапустить viewer
pm2 restart courtflow-parser      # запустить парсер вручную
pm2 stop courtflow-parser         # остановить
pm2 monit                         # интерактивный дашборд
```

### Обновление проекта

```bash
cd /opt/courtflow
git pull
npm install
pm2 restart all
pm2 save
```

### Расписание парсера

В `ecosystem.config.cjs`: `cron_restart: '0 */6 * * *'` — 00:00, 06:00, 12:00, 18:00.

Чтобы изменить:
```bash
# Отредактируйте ecosystem.config.cjs, затем:
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

---

## Известные особенности

| Особенность | Решение |
|---|---|
| Puppeteer headless без дисплея | Работает штатно на Ubuntu |
| `--no-sandbox` | Уже в `session.ts` |
| `--ignore-certificate-errors` | Уже в `session.ts` |
| Права на `/opt/courtflow` | `sudo chown $USER:$USER /opt/courtflow` |
| Port въю viewer | Узнать из `config.json`, открыть в firewall (`ufw allow PORT`) |
| libasound2 нет (Ubuntu 24.04+) | Заменить на `libasound2t64` |
