# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON, показывает через web-viewer.

- Целевой сервер: **Linux (Ubuntu)**. Доступ через браузер из офисной сети.
- Разработка: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков)
- Запуск: `npx tsx` без сборки
- Менеджер процессов на Linux: **pm2**

## Архитектура

```
courtflow/
├── config.json              # scheduleRetry, staleThresholdH добавлены
├── courts.json              # ✅ Справочник судов
├── watch/                   # ✅ Папка для ссылок на мониторинг (любые файлы, любой формат)
├── urls.txt                 # Fallback если watch/ пуста
├── .env                     # RUCAPTCHA_API_KEY (не коммитить)
├── ecosystem.config.cjs    # ✅ pm2: viewer + parser + parser-retry
├── LINUX_DEPLOY.md         # ✅ Инструкция по деплою
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── logs/
└── packages/
    ├── core/
    │   ├── config.ts            # scheduleRetry, staleThresholdH в интерфейсе
    │   ├── urls.ts              # ✅ watch/ + fuzzy нормализатор + fallback urls.txt
    │   ├── courts.ts
    │   ├── errors.ts
    │   ├── types.ts
    │   └── retry.ts
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts
    ├── captcha/
    │   ├── rucaptcha.ts
    │   └── session.ts           # ✅ BUG-019 закрыт: solver.ts удалён
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ --retry режим (stale URL фильтр по run-log)
    │   ├── smoke.ts
    │   └── enrich-courts.ts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳ не реализовано (низкий приоритет)
    └── viewer/
        ├── server.ts            # ✅ reconciliation: /api/cases только активные courtId
        │                        # ✅ /api/active-courts — список из watch/
        └── public/
            └── index.html
```

## Текущее состояние (2026-07-06)

### ✅ Всё работает
- `npm run parse` — 26/26 дел, 100% success (Windows + Linux)
- `npm run parse -- --retry` — только stale URL (lastSuccess > staleThresholdH часов)
- Linux-деплой прошёл, демонстрация успешна
- UI: количество судов = точное (reconciliation с watch/)

### ⏳ Следующие шаги (очередь)
1. **XLSX** — `packages/exporter/xlsx.ts` (exceljs в зависимостях, низкий приоритет)
2. **LINUX_DEPLOY.md** — обновить: добавить `courtflow-parser-retry` процесс, watch/ папку

## watch/ — источник URL

- Любые файлы, любые расширения, любые разделители
- Нормализатор: снимает кавычки, добавляет https://, валидирует через `new URL()`
- Фильтр: только домены `*.sudrf.ru` и `*.msudrf.ru`
- Удаление файла = прекращение мониторинга URL из него
- Если `watch/` пуста или отсутствует — fallback на `urls.txt`
- Дубликаты URL (из разных файлов) — дедуплицируются

## Two-tier scheduling

```json
"schedule":       "0 8 * * 1,3,5"   // основной прогон, все URL
"scheduleRetry":  "0 11,14 * * 1,3,5" // retry, только stale
"staleThresholdH": 24                // порог в часах
```

- `courtflow-parser` — основной прогон (pm2 cron)
- `courtflow-parser-retry` — retry-прогон с `--retry` флагом (pm2 cron)
- Оркестратор в `--retry` режиме читает run-log историю, фильтрует URL где `lastSuccess > staleThresholdH`

## Важные особенности

### msudrf.ru — SSL-сертификат
Wildcard `*.msudrf.ru` не покрывает `35.perm.msudrf.ru`. Фикс: `--ignore-certificate-errors`.

### npm run parse
Тип суда читается автоматически из URL. Правильный запуск: `npm run parse`.

### PUPPETEER_HEADLESS
`PUPPETEER_HEADLESS=false npm run parse` — только Windows диагностика. Не пушить в `.env`.

## Команды

```bash
# Windows / Linux (разработка)
npm run test:smoke
npm run parse
npm run parse -- --retry
npm start
npm run enrich:courts

# Linux (production, pm2)
pm2 start ecosystem.config.cjs
pm2 restart courtflow-parser         # ручной основной прогон
pm2 restart courtflow-parser-retry   # ручной retry
pm2 logs courtflow-viewer
pm2 status
```

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.
