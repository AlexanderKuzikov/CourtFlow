# CourtFlow

Система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, отображает через web-viewer.

## Быстрый старт

```bash
cp .env.example .env
# заполни RUCAPTCHA_API_KEY и TWOCAPTCHA_API_KEY в .env (needed for magistrate)

npm install
npm install-scripts approve puppeteer
npm install-scripts approve esbuild
npm install

# Проверка адаптеров
npm run test:smoke

# Запуск парсинга
npm run parse

# Web-viewer
npm start
```

## Список дел

Редактируй `urls.txt` — одна ссылка на строку. Тип суда определяется автоматически. Строки с `#` — комментарии.

## Типы судов

| Тип | Домен | delo_id | Статус |
|---|---|---|---|
| district | `*.sudrf.ru` | 1540005 | ✅ |
| appeal | `oblsud--*.sudrf.ru` | 5 | ✅ |
| cassation | `*kas.sudrf.ru` | 2800001 | ⚠️ |
| magistrate | `*.msudrf.ru` | 1540005 | ⏳ |

## Настройка

| Файл | Назначение |
|---|---|
| `config.json` | Расписание, вывод, настройки retry/viewer |
| `urls.txt` | Список дел (human-friendly) |
| `.env` | API-ключи капчи |

## Контекст для AI

Читай `CONTEXT.md` — текущее состояние, приоритеты и архитектура.
