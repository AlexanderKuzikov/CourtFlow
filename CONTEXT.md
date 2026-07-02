# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, показывает через web-viewer.

- Офисный сервер: **Linux**, доступ через браузер из офисной сети
- Разработка: **Windows** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков)

## Архитектура

```
courtflow/
├── config.json
├── courts.json              # ✅ Справочник судов
├── urls.txt
├── .env
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── logs/
├── data/
└── packages/
    ├── core/
    │   ├── config.ts
    │   ├── urls.ts
    │   ├── courts.ts            # ✅ Справочник + fetch с главной страницы суда
    │   ├── errors.ts            # ✅ CaptchaRequiredError + isCaptchaPage
    │   ├── types.ts
    │   └── retry.ts
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts        # ✅ базовый парсинг msudrf HTML
    ├── captcha/
    │   ├── rucaptcha.ts         # ✅ RuCaptcha API v2 client (createTask/getTaskResult)
    │   ├── session.ts           # ✅ Puppeteer session, captcha image через page.evaluate
    │   └── solver.ts            # ⚠️ заглушка, не используется (BUG-019)
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ magistrate через Puppeteer + RuCaptcha
    │   ├── smoke.ts
    │   └── enrich-courts.ts     # ✅ npm run enrich:courts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳
    └── viewer/
        ├── server.ts            # ✅ /api/courts
        └── public/
            └── index.html       # ✅ показывает name/address/phones/email
```

## Текущее состояние (2026-07-02)

### ✅ Работает
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- UI показывает человекочитаемые названия судов, адрес, телефоны, email
- BUG-010: captcha отдельно от FAIL
- BUG-018: captcha image через `page.evaluate(fetch)` — без навигации
- RuCaptcha переведён на API v2 (`api.rucaptcha.com`, JSON, `createTask`/`getTaskResult`)
- `MagistrateAdapter` реализован по живому HTML карточки

### ⏳ Требуется для magistrate
- `RUCAPTCHA_API_KEY` заполнен в `.env` и баланс пополнен на rucaptcha.com
- На Linux: системные зависимости Chromium (libatk, libgbm, libnss3 и др.)

### ⚠️ Текущее внимание
1. **Живой end-to-end прогон** `npm run parse` на одном magistrate URL
2. Проверить `logs/magistrate-last.html` — наличие `.tab-content` / `table.tablcont`
3. Уточнить `numeric` параметр: если капча только цифры — поменять `numeric: 4` → `numeric: 1`
4. BUG-017: проверить MagistrateAdapter на других участках/типах дел
5. BUG-019: удалить или реализовать `solver.ts`
6. Автозаполнение `vnkod` в `courts.json`
7. XLSX
8. systemd/pm2

## Команды

```powershell
npm run test:smoke
npm run parse
npm start
npm run enrich:courts
```

## Что сделано в последних сессиях

### 2026-07-01 — Magistrate + RuCaptcha (BUG-010, BUG-016, BUG-018)
- `packages/core/errors.ts`: `CaptchaRequiredError`, `isCaptchaPage`
- `packages/captcha/rucaptcha.ts`: RuCaptcha client
- `packages/captcha/session.ts`: Puppeteer session, captcha image через `page.evaluate(fetch)` (не через `page.goto`+`goBack`)
- `orchestrator`: magistrate через Puppeteer + RuCaptcha
- `MagistrateAdapter`: базовый парсинг (`h2`, `.tab-content`, `table.tablcont`)

### 2026-07-02 — RuCaptcha API v2
- `rucaptcha.ts` переписан: `api.rucaptcha.com`, JSON, `createTask`/`getTaskResult`
- `ImageToTextTask`: `numeric=4`, `minLength=4`, `maxLength=6`, `case=false`, `languagePool=rn`
- `DECISIONS.md`: зафиксировано правило: всегда API v2, legacy v1 — не использовать
