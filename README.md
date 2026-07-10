# CourtFlow

Система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON, показывает через web-viewer.

## Быстрый старт

```bash
# 1. Скопировать и заполнить .env (если ещё не создан)
cp .env.example .env
# Прописать RUCAPTCHA_API_KEY в .env (нужен для msudrf.ru)

# 2. Установить зависимости
npm install

# 3. Проверка адаптеров
npm run test:smoke

# 4. Заполнить справочник судов (один раз при настройке)
npm run enrich:courts

# 5. Запустить парсинг
npm run parse

# 6. Retry-прогон (только stale URL)
npm run parse -- --retry

# 7. Web-viewer
npm start
```

## Источник URL

Основной источник — папка `watch/`. Поместите туда любые текстовые файлы со ссылками на дела. Поддерживаются любые форматы: `.txt`, `.json`, `.csv`, без расширения. Разделители: пробелы, табы, переносы, `;`, `|`. Кавычки и JSON-синтаксис игнорируются.

Если `watch/` отсутствует или пуста — используется `urls.txt` в корне проекта (одна ссылка на строку, строки с `#` — комментарии).

Удаление файла из `watch/` = прекращение мониторинга URL из него. Старые данные остаются в `data/` как архив и больше не отображаются в UI.

## Типы судов

| Тип | Домен | Captcha | Статус |
|---|---|---|---|
| district | `*.sudrf.ru` | нет | ✅ |
| appeal | `oblsud--*.sudrf.ru` | нет | ✅ |
| cassation | `*kas.sudrf.ru` | нет | ✅ |
| magistrate | `*.msudrf.ru` | image captcha → RuCaptcha | ✅ |

## Что нужно для magistrate (msudrf.ru)

1. Зарегистрироваться на [rucaptcha.com](https://rucaptcha.com), получить API-ключ
2. Прописать `RUCAPTCHA_API_KEY=...` в `.env`
3. Пополнить баланс на rucaptcha.com (оплата в RUB, ~1руб/100 капч)
4. На **Linux**-сервере: установить зависимости Chromium

```bash
sudo apt-get install -y \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
  libgbm1 libgtk-3-0 libnss3 libxcomposite1 \
  libxdamage1 libxfixes3 libxkbcommon0 libxrandr2
```

## Настройка

| Файл | Назначение |
|---|---|
| `config.json` | Расписание, staleThresholdH, retry, порт viewer |
| `watch/` или `urls.txt` | Список дел для мониторинга |
| `.env` | API-ключи (`RUCAPTCHA_API_KEY`) |

## Команды

| Команда | Описание |
|---|---|
| `npm run parse` | Полный прогон всех URL |
| `npm run parse -- --retry` | Retry-прогон (только stale URL) |
| `npm run test:smoke` | Проверка адаптеров (по 1 URL каждого типа) |
| `npm run enrich:courts` | Заполнить справочник судов |
| `npm test` | Unit-тесты |
| `npm start` | Web-viewer (http://localhost:3000) |

## Linux / pm2

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs courtflow-viewer
```

Три процесса:
- `courtflow-viewer` — web-viewer (постоянно)
- `courtflow-parser` — основной прогон (cron: `0 8 * * 1,3,5`)
- `courtflow-parser-retry` — retry-прогон (cron: `0 11,14 * * 1,3,5`)

Расписание и retry настройки — в `config.json` и `ecosystem.config.cjs`.

## Документация для AI

- `CONTEXT.md` — текущее состояние и архитектура
- `DECISIONS.md` — принятые архитектурные решения
- `BUG_REPORT.md` — журнал ошибок
- `CODE_REVIEW.md` — журнал code review
- `PROMPT_FOR_NEW_SESSION.md` — инструкция для новой AI-сессии
