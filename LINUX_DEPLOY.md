# Linux Deploy — CourtFlow

> Инструкция по развёртыванию на офисном Linux-сервере.
> ОС: **Ubuntu**. Менеджер процессов: **pm2**.

---

## Чеклист (быстрый старт)

```bash
# 1. Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v24.x.x

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

# 5. watch/ — папка для ссылок на мониторинг
mkdir -p /opt/courtflow/watch
# Помести файлы со ссылками. Пример:
# echo 'https://sverdlov--perm.sudrf.ru/modules.php?...' > /opt/courtflow/watch/cases.txt
# Любой формат: .txt, .json, .csv, без расширения.
# Fallback: urls.txt в корне проекта (если watch/ пуста).

# 6. Проверка
npm run test:smoke
npm run parse
# Ожидаем: [orchestrator] Готово. OK: 26, FAIL: 0, CAPTCHA: 0

# 7. pm2
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 startup               # выдаст команду — скопировать и выполнить
pm2 save

# 8. Быстрая проверка
pm2 status
curl http://localhost:3000
```

---

## pm2 — управление

```bash
pm2 status                             # статус всех процессов
pm2 logs courtflow-viewer              # логи viewer
pm2 logs courtflow-parser              # логи парсера
pm2 logs courtflow-parser-retry        # логи retry-парсера
pm2 restart courtflow-parser           # ручной основной прогон
pm2 restart courtflow-parser-retry     # ручной retry-прогон
pm2 monit                              # интерактивный дашборд
```

## Расписание (ecosystem.config.cjs)

| Процесс | Cron | Описание |
|---|---|---|
| courtflow-viewer | постоянный | Web-вьюер |
| courtflow-parser | `0 8 * * 1,3,5` | Основной прогон, все URL |
| courtflow-parser-retry | `0 11,14 * * 1,3,5` | Retry, только stale URL |

Чтобы изменить расписание — отредактировать `config.json` (поля `schedule`, `scheduleRetry`, `staleThresholdH`) и `ecosystem.config.cjs`, затем:
```bash
pm2 restart ecosystem.config.cjs --update-env
pm2 save
```

## watch/ — добавление/удаление дел

```bash
# Добавить дело — просто скинуть файл в watch/
echo 'https://sverdlov--perm.sudrf.ru/modules.php?...' >> /opt/courtflow/watch/cases.txt

# Удалить дело — удалить строку или весь файл
# Старые данные остаются в data/ как архив, в UI больше не отображаются

# Принимается любой формат (текст, JSON, CSV):
# {"url": "https://..."}    — JSON
# url,name\nhttps://...     — CSV
# https://...               — plain text
```

## Обновление проекта

```bash
cd /opt/courtflow
git pull
npm install
pm2 restart all
pm2 save
```

## Известные особенности

| Особенность | Решение |
|---|---|
| Puppeteer headless без дисплея | Работает штатно на Ubuntu |
| `--no-sandbox` | Уже в `session.ts` |
| `--ignore-certificate-errors` | Уже в `session.ts` |
| Права на `/opt/courtflow` | `sudo chown $USER:$USER /opt/courtflow` |
| Port viewer | Из `config.json`, открыть: `ufw allow PORT` |
| libasound2 нет (Ubuntu 24.04+) | Заменить на `libasound2t64` |
