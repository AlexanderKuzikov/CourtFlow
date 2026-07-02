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
    │   ├── session.ts           # ✅ Puppeteer session + page.evaluate fetch
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
- `npm run parse` — district / appeal / cassation — все OK
- UI: названия судов, адрес, телефоны, email
- RuCaptcha API v2 реализован (`createTask`/`getTaskResult`, `api.rucaptcha.com`)
- Captcha image через `page.evaluate(fetch)` — без навигации (BUG-018 закрыт)

### 🔴 Застряли — magistrate end-to-end не работает

**Ошибка:** `net::ERR_NETWORK_ACCESS_DENIED` при `page.goto()` в Puppeteer headless.

**Что проверено и исключено:**
- Сайт открывается в браузере вручную — сеть есть
- Smart App Control — отключён, не виноват
- AppLocker — пустой журнал, не виноват
- Windows Firewall — блокирующих правил для chrome.exe нет
- `--no-sandbox`, `--disable-setuid-sandbox` — добавлены, не помогли
- Security журнал (Event ID 5157) — недоступен (нужен admin)

**Следующий шаг диагностики:**
Запустить `headless: false` локально (не пушить!) с одной msudrf-ссылкой:
- Если в видимом окне сайт грузится — проблема в headless-режиме (антивирус, сетевая изоляция)
- Если и в видимом ERR_NETWORK_ACCESS_DENIED — проблема глубже (прокси, DNS)

Если headless: false загружает — добавить флаги:
```
'--disable-features=NetworkServiceInProcess',
'--disable-web-security',
```
Или перейти на `executablePath` системного Chrome (не bundled Chromium):
```ts
executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
```

### ✅ Сейчас работает в PRODUCTION-режиме
13 дел с 5 судов district/appeal/cassation — все OK. Магистрат заблокирован только на Windows.

### ⏳ Требуется
- Живой magistrate end-to-end прогон
- Проверка MagistrateAdapter на других делах/участках (BUG-017)
- BUG-019: решить судьбу `solver.ts`
- XLSX
- systemd/pm2

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
- BUG-019 зафиксирован в BUG_REPORT
- RuCaptcha переведён на API v2 (`api.rucaptcha.com`, JSON)
- `ImageToTextTask` параметры: `numeric=4`, `minLength=4`, `maxLength=6`, `languagePool=rn`
- `--no-sandbox` добавлен в `session.ts`
- TS2503 исправлен: `puppeteer.Page` → `import { type Page } from 'puppeteer'`
- `.gitignore`: убран `logs/` blanket ignore, `logs/orchestrator.lock` игнорируется, остальное в logs/ пушается
- README, DECISIONS, CONTEXT, BUG_REPORT — актуализированы

### Не решено
- `ERR_NETWORK_ACCESS_DENIED` в Puppeteer headless на Windows 11
- Причина не установлена — нужна диагностика `headless: false`

## Промпт для новой сессии

См. ниже — раздел **Промпт для AI**.
