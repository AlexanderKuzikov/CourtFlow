# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, показывает через web-viewer.

- Офисный сервер: **Linux**, доступ через браузер из офисной сети
- Разработка сейчас: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков)
- Запуск: `npx tsx` без сборки

## Архитектура

```
courtflow/
├── config.json
├── courts.json              # ✅ Справочник судов
├── urls.txt                 # Список дел (вручную)
├── .env                     # RUCAPTCHA_API_KEY (не коммитить)
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
    │   └── magistrate.ts        # ✅ BUG-017 закрыт: uid=caseNumber, 5 колонок событий, filingDate/hearingDate/result
    ├── captcha/
    │   ├── rucaptcha.ts         # ✅ RuCaptcha API v2 (createTask/getTaskResult)
    │   ├── session.ts           # ✅ Puppeteer + --ignore-certificate-errors
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

### ✅ Всё работает
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- `npm run parse` — **district / appeal / cassation / magistrate — все OK**
- UI: названия судов, адрес, телефоны, email
- RuCaptcha API v2 (`createTask`/`getTaskResult`, `api.rucaptcha.com`)
- MagistrateAdapter: uid = судебный номер дела, 5 колонок событий, filingDate/hearingDate/result
- Прогон 26/26 дел, 8 magistrate-участков — 100% success (лог 2026-07-02 09:57–10:03)

### ⏳ Требуется (очередь)
1. **Linux-деплой** — systemd или pm2, переменные окружения, Puppeteer зависимости
2. **BUG-019** — удалить `solver.ts` или реализовать
3. **XLSX** — экспорт данных

## Важные особенности

### msudrf.ru — SSL-сертификат
Сайты мировых судей используют wildcard `*.msudrf.ru`, который **не покрывает** домены вида `35.perm.msudrf.ru` (два уровня). Puppeteer падает с `ERR_CERT_COMMON_NAME_INVALID`. Фикс: `--ignore-certificate-errors` в args Puppeteer launch.

### npm run parse — аргументы
Оркестратор **не принимает** `--type` как аргумент — тип суда определяется автоматически из `urls.txt` через `loadUrls()`. Правильный запуск: просто `npm run parse`. Вызов `npm run parse -- --type magistrate` вызывает npm warning и игнорируется.

### PUPPETEER_HEADLESS
Для диагностики: `PUPPETEER_HEADLESS=false npm run parse` — запустит с видимым окном. Не пушить `.env` с этим флагом.

### MagistrateAdapter — структура HTML msudrf.ru
- `<h2>ДЕЛО № X-XXXX/YYYY</h2>` — номер дела (→ uid)
- Таб 0 (`tab-content[0]`): `table.tablcont` — основные сведения (категория, судья)
- Таб 1 (`tab-content[1]`): **5 колонок** — событие, дата, время, результат, судья
- Таб 2 (`tab-content[2]`): стороны — строка 0: h2, строка 1: роли, строка 2: имена

## Команды

```powershell
npm run test:smoke
npm run parse
npm start
npm run enrich:courts
```

## Что сделано в текущей сессии (2026-07-02)

### Исправлено
- BUG-018: `response.buffer()` → `page.evaluate(fetch)`
- BUG-020: `--ignore-certificate-errors` в Puppeteer args
- BUG-021: `puppeteer.Page` → `import { type Page } from 'puppeteer'`
- BUG-022: `Locator.getAttribute` → `page.$eval`
- BUG-016: magistrate end-to-end подтверждён — закрыт
- BUG-017: MagistrateAdapter — uid, events 5 колонок, filingDate/hearingDate/result, индексы строк сторон
- RuCaptcha переведён на API v2
- `.gitignore`: logs/ пушатся, только lock игнорируется

### Открыто
- BUG-019: `solver.ts` — заглушка, не блокер

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.
