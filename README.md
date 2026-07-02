# CourtFlow

Система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, отображает через web-viewer.

## Быстрый старт

```bash
# 1. Скопировать и заполнить .env
cp .env.example .env
# Прописать RUCAPTCHA_API_KEY в .env

# 2. Установить зависимости
# При первом npm install Puppeteer автоматически загрузит Chromium (~170 MB).
npm install

# 3. Проверка адаптеров
npm run test:smoke

# 4. Заполнить справочник судов (один раз при настройке)
npm run enrich:courts

# 5. Запустить парсинг
npm run parse

# 6. Web-viewer
npm start
```

## Что нужно для magistrate (msudrf.ru)

| Шаг | Действие |
|---|---|
| 1 | Зарегистрироваться на [rucaptcha.com](https://rucaptcha.com), получить API-ключ |
| 2 | Пополнить `RUCAPTCHA_API_KEY=...` в `.env` |
| 3 | Пополнить баланс на rucaptcha.com (оплата в RUB, цена ~1₽/100 капч) |
| 4 | На **Linux**-сервере: установить зависимости Chromium |

```bash
# Linux: зависимости Chromium для Puppeteer (Debian/Ubuntu)
sudo apt-get install -y \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
  libgbm1 libgtk-3-0 libnss3 libxcomposite1 \
  libxdamage1 libxfixes3 libxkbcommon0 libxrandr2
```

> **Windows:** дополнительного не нужно, Puppeteer загружает свой Chromium.

## Список дел

Редактируй `urls.txt` — одна ссылка на строку. Тип суда определяется автоматически. Строки с `#` — комментарии.

## Типы судов

| Тип | Домен | Captcha | Статус |
|---|---|---|---|
| district | `*.sudrf.ru` | нет | ✅ |
| appeal | `oblsud--*.sudrf.ru` | нет | ✅ |
| cassation | `*kas.sudrf.ru` | нет | ⚠️ |
| magistrate | `*.msudrf.ru` | image captcha → RuCaptcha | 🟡 end-to-end проверка |

## Настройка

| Файл | Назначение |
|---|---|
| `config.json` | Расписание, вывод, настройки retry/viewer |
| `urls.txt` | Список дел |
| `.env` | API-ключи (`RUCAPTCHA_API_KEY`) |

## Контекст для AI

Читай `CONTEXT.md` — текущее состояние, приоритеты и архитектура.
