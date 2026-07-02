# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, показывает через web-viewer.

- Офисный сервер: **Linux** (дистрибутив уточнить перед деплоем), доступ через браузер из офисной сети
- Разработка сейчас: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймвоворков)
- Запуск: `npx tsx` без сборки
- Менеджер процессов на Linux: **pm2**

## Архитектура

```
courtflow/
├── config.json
├── courts.json              # ✅ Справочник судов
├── urls.txt                 # Список дел (вручную)
├── .env                     # RUCAPTCHA_API_KEY (не коммитить)
├── ecosystem.config.cjs    # ✅ pm2 конфиг
├── LINUX_DEPLOY.md         # ✅ Инструкция по деплою
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── logs/                    # run-log-YYYY-MM-DD.json, magistrate-last.html — пушатся
├── data/                    # результаты парсинга — не пушатся
└── packages/
    ├── core/
    │   ├── config.ts            # loadConfig() — config.json + .env
    │   ├── urls.ts              # loadUrls() — читает urls.txt, автоопределяет courtType
    │   ├── courts.ts            # ✅ Справочник + fetch с главной страницы суда
    │   ├── errors.ts            # ✅ CaptchaRequiredError + isCaptchaPage
    │   ├── types.ts             # Case, CaseEvent, CaseParty, CourtAdapter, RunResult
    │   └── retry.ts             # withRetry(fn, options, label)
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts        # ✅ BUG-017 закрыт: uid=caseNumber, 5 колонок, filingDate/hearingDate/result
    ├── captcha/
    │   ├── rucaptcha.ts         # ✅ RuCaptcha API v2 (createTask/getTaskResult)
    │   ├── session.ts           # ✅ Puppeteer + --ignore-certificate-errors + --no-sandbox
    │   └── solver.ts            # ⚠️ заглушка (BUG-019), не используется
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ основной раннер, magistrate через Puppeteer
    │   ├── smoke.ts
    │   └── enrich-courts.ts     # ✅ npm run enrich:courts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳ не реализовано
    └── viewer/
        ├── server.ts
        └── public/
            └── index.html
```

## Текущее состояние (2026-07-02)

### ✅ Всё работает на Windows
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- `npm run parse` — **district / appeal / cassation / magistrate — все OK**
- UI: названия судов, адрес, телефоны, email
- RuCaptcha API v2 (`createTask`/`getTaskResult`, `api.rucaptcha.com`)
- MagistrateAdapter: uid = судебный номер, 5 колонок, filingDate/hearingDate/result
- Прогон 26/26 дел, 8 magistrate-участков (100% success)

### ⏳ Следующие шаги (очередь)
1. **Linux-деплой** — см. `LINUX_DEPLOY.md`
2. **BUG-019** — удалить `solver.ts`
3. **XLSX** — экспорт данных

## Важные особенности

### msudrf.ru — SSL-сертификат
Wildcard `*.msudrf.ru` не покрывает домены вида `35.perm.msudrf.ru`. Фикс: `--ignore-certificate-errors` в Puppeteer launch args (`session.ts`).

### npm run parse
Оркестратор не принимает `--type` — тип суда читается автоматически из `urls.txt`. Правильный запуск: `npm run parse`.

### PUPPETEER_HEADLESS
`PUPPETEER_HEADLESS=false npm run parse` — запуск с видимым окном (Windows диагностика). Не пушить в `.env`.

### MagistrateAdapter — структура HTML msudrf.ru
- `<h2>ДЕЛО № X-XXXX/YYYY</h2>` → uid
- tab-content[0]: основные сведения (категория, судья)
- tab-content[1]: 5 колонок — событие, дата, время, результат, судья
- tab-content[2]: строка 1 — роли, строка 2 — имена

### pm2 (Linux)
- viewer: `courtflow-viewer` — постоянный процесс
- parser: `courtflow-parser` — `cron_restart: '0 */6 * * *'` (каждые 6 часов)
- Конфиг: `ecosystem.config.cjs`
- Полная инструкция: `LINUX_DEPLOY.md`

## Команды

```bash
# Windows (разработка)
npm run test:smoke
npm run parse
npm start
npm run enrich:courts

# Linux (production)
pm2 start ecosystem.config.cjs
pm2 restart courtflow-parser   # ручной запуск парсера
pm2 logs courtflow-viewer
pm2 status
```

## Что сделано в текущей сессии (2026-07-02)

### Исправлено
- BUG-017, 018, 019(open), 020, 021, 022 — закрыты
- BUG-016: magistrate end-to-end — закрыт
- MagistrateAdapter: uid, events 5 колонок, filingDate/hearingDate/result
- RuCaptcha API v2
- pm2 ecosystem.config.cjs + LINUX_DEPLOY.md

### Открыто
- BUG-019: `solver.ts` — не блокер

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.
