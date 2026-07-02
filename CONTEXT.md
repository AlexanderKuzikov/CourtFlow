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
    │   └── magistrate.ts        # ✅ парсинг msudrf HTML (.tab-content, table.tablcont)
    ├── captcha/
    │   ├── rucaptcha.ts         # ✅ RuCaptcha API v2 (createTask/getTaskResult)
    │   ├── session.ts           # ✅ Puppeteer session + --ignore-certificate-errors
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

### ✅ Работает
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- `npm run parse` — district / appeal / cassation / **magistrate** — все OK
- UI: названия судов, адрес, телефоны, email
- RuCaptcha API v2 реализован (`createTask`/`getTaskResult`, `api.rucaptcha.com`)
- Captcha image через `page.evaluate(fetch)` — без навигации (BUG-018 закрыт)
- **BUG-020 закрыт:** magistrate парсится через Puppeteer с `--ignore-certificate-errors`
- **BUG-016 закрыт:** magistrate end-to-end подтверждён логами (108.perm, 57.perm — success)

### 🟡 В работе
- BUG-017: MagistrateAdapter проверен на 2 участках, нужно проверить остальные

### ⏳ Требуется
- Проверка MagistrateAdapter на других делах/участках (BUG-017)
- BUG-019: решить судьбу `solver.ts` (удалить или реализовать)
- XLSX экспорт
- systemd/pm2 деплой на Linux

## Важные особенности

### msudrf.ru — SSL-сертификат
Сайты мировых судей используют wildcard `*.msudrf.ru`, который **не покрывает** домены вида `35.perm.msudrf.ru` (два уровня). Puppeteer падает с `ERR_CERT_COMMON_NAME_INVALID`. Фикс: `--ignore-certificate-errors` в args Puppeteer launch.

### npm run parse — аргументы
Оркестратор **не принимает** `--type` как аргумент — тип суда определяется автоматически из `urls.txt` через `loadUrls()`. Правильный запуск: просто `npm run parse`. Вызов `npm run parse -- --type magistrate` вызывает npm warning и игнорируется.

### PUPPETEER_HEADLESS
Для диагностики: `PUPPETEER_HEADLESS=false npm run parse` — запустит с видимым окном. Не пушить `.env` с этим флагом.

## Команды

```powershell
npm run test:smoke
npm run parse
npm start
npm run enrich:courts
```

## Что сделано в текущей сессии (2026-07-02)

### Исправлено
- BUG-018: `response.buffer()` → `page.evaluate(fetch)` в `session.ts`
- BUG-020: `--ignore-certificate-errors` в Puppeteer args — закрыт
- BUG-022: `Locator.getAttribute` → `page.$eval` — закрыт
- BUG-016: magistrate end-to-end подтверждён — закрыт
- RuCaptcha переведён на API v2 (`api.rucaptcha.com`, JSON)
- `ImageToTextTask` параметры: `numeric=4`, `minLength=4`, `maxLength=6`, `languagePool=rn`
- `PUPPETEER_HEADLESS` env-флаг добавлен в `session.ts`
- `--disable-features=NetworkServiceInProcess` добавлен
- TS2503 исправлен: `puppeteer.Page` → `import { type Page } from 'puppeteer'`
- `.gitignore`: убран `logs/` blanket ignore, `logs/orchestrator.lock` игнорируется

### Открыто
- BUG-019: `solver.ts` — заглушка, не блокер
- BUG-017: MagistrateAdapter нужно проверить на всех участках

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.
