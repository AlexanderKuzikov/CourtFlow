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
    │   ├── rucaptcha.ts         # ✅ RuCaptcha client
    │   └── session.ts           # ✅ Puppeteer session for msudrf
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

## Текущее состояние (2026-07-01)

### ✅ Работает
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- UI показывает человекочитаемые названия судов
- В деталях дела: адрес, телефоны, email суда
- BUG-010 закрыт: sudrf/msudrf captcha различается отдельно от FAIL
- Для `magistrate` реализован flow: Puppeteer → `/captcha.php` → RuCaptcha → submit `#kcaptchaForm`
- Базовый `MagistrateAdapter` реализован по живому HTML карточки (`.tab-content`, `table.tablcont`)

### ⚠️ Текущее внимание
1. Проверить end-to-end `magistrate` на живом запуске
2. Убедиться, что `packages/captcha/session.ts` корректно получает картинку капчи и возвращается назад на страницу дела
3. Уточнить структуру magistrate для других карточек/типов дел (сейчас парсинг построен по одному живому примеру)
4. Автозаполнение `vnkod` в `courts.json`
5. XLSX
6. systemd/pm2

## Команды

```powershell
npm run test:smoke
npm run parse
npm start
npm run enrich:courts
```

## Что сделано в последней сессии

### BUG-010
- Добавлен `packages/core/errors.ts`
- `CaptchaRequiredError`
- `isCaptchaPage(html)` детектирует `id="kcaptchaForm"`
- `district`, `appeal`, `cassation` бросают `CaptchaRequiredError` до парсинга
- `orchestrator` логирует `[CAPTCHA]` отдельно, считает `OK / FAIL / CAPTCHA`

### Magistrate + RuCaptcha
- Подтверждён живой HTML капчи msudrf:
  - `form#kcaptchaForm`
  - `img src="/captcha.php"`
  - `input[name="captcha-response"]`
  - submit button `Продолжить`
- Подтверждён живой HTML карточки msudrf:
  - номер дела: `h2` с текстом `ДЕЛО № ...`
  - вкладки: `ul#tabs.bookmarks.lawcase`
  - контент вкладок: `div.tab-content`
  - таблицы: `table.tablcont`
- Реализован `packages/captcha/rucaptcha.ts`
- Реализован `packages/captcha/session.ts`
- `orchestrator` больше не пропускает `magistrate`, а грузит HTML через Puppeteer + RuCaptcha
- Реализован базовый `packages/adapters/magistrate.ts`

## Что проверить в новой сессии

1. Есть ли `puppeteer` в `package.json`; если нет — добавить
2. Проверить, что `page.goto(imageUrl)` + `page.goBack()` стабильно работают на msudrf
3. При необходимости переделать получение captcha image через `page.evaluate(fetch(...).arrayBuffer())`
4. Прогнать `npm run parse` на одной ссылке из `urls.txt`
5. Если всплывёт несовместимость типов Puppeteer/TS — править минимально, без рефакторинга
6. Если HTML magistrate отличается на других судах — обновить `HTML_STRUCTURE.md`
