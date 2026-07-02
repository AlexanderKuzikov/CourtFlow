# BUG_REPORT — CourtFlow

> Файл для фиксации ошибок, уязвимостей и проблемных мест. Обновляется по мере обнаружения.
> Статусы: 🔴 Открыто | 🟡 В работе | 🟢 Исправлено

---

## Сводная таблица

| ID | Описание | Статус | Приоритет |
|---|---|---|---|
| BUG-001 | .env не загружался автоматически | 🟢 | Высокий |
| BUG-002 | Нет валидации ключей | 🟢 | Средний |
| BUG-003 | API ключи в GET /api/config | 🟢 | Высокий |
| BUG-004 | Нет timeout на parse() | 🟢 | Средний |
| BUG-005 | run-log без истории | 🟢 | Низкий |
| BUG-006 | Повторный парсинг стирает данные | 🟢 | Средний |
| BUG-007 | Нет lock от параллельного запуска | 🟢 | Средний |
| BUG-008 | CSS-селекторы не проверены | 🟢 | Высокий |
| BUG-009 | UID fallback отсутствовал | 🟢 | Высокий |
| BUG-010 | Нет различения капча/503 | 🟢 | Средний |
| BUG-011 | node-fetch ESM + Windows | 🟢 | Средний |
| BUG-012 | charset автоопределение | 🟢 | Средний |
| BUG-013 | Кодировка smoke-лога на Windows | 🟢 | Низкий |
| BUG-014 | `Cannot GET /` — неверный путь к static на Windows | 🟢 | Высокий |
| BUG-015 | Нет справочника судов с контактами | 🟢 | Средний |
| BUG-016 | Нет автоматического прохождения капчи для msudrf.ru | 🟡 | Высокий |
| BUG-017 | MagistrateAdapter проверен только на одном HTML-примере | 🟡 | Средний |
| BUG-018 | `response.buffer()` удалён в Puppeteer v22+ | 🟢 | Высокий |
| BUG-019 | `solver.ts` — нереализованная заглушка | 🔴 | Низкий |
| BUG-020 | `ERR_NETWORK_ACCESS_DENIED` в Puppeteer headless на Windows 11 | 🟡 | Высокий |
| BUG-021 | TS2503 `Cannot find namespace 'puppeteer'` в session.ts | 🟢 | Средний |

---

### BUG-021 🟢 TS2503 `Cannot find namespace 'puppeteer'`
**Причина:** в `session.ts` тип `puppeteer.Page` использовался как namespace-тип, что не работает в Puppeteer v24.

**Исправлено:** `import puppeteer, { type Page } from 'puppeteer'`, тип функции `readCaptchaImageAsBase64(page: Page)`.

### BUG-020 🟡 `ERR_NETWORK_ACCESS_DENIED` в Puppeteer headless на Windows 11
**Симптомы:**
- Puppeteer запускается, но `page.goto(msudrf_url)` падает с `net::ERR_NETWORK_ACCESS_DENIED`
- Сайт открывается в браузере вручную
- Smart App Control отключён, AppLocker пуст, Firewall не блокирует
- `--no-sandbox` не помогл

**Гипотеза:** Windows Network Isolation / WinSock блокирует headless Chromium как дочерний процесс без UI.

**Следующий шаг:** запустить с `headless: false` локально (не пушить). Если в видимом окне грузится — причина в headless, попробовать:
```ts
'--disable-features=NetworkServiceInProcess'
// или executablePath: системный Chrome вместо bundled Chromium
```

### BUG-019 🔴 `solver.ts` — нереализованная заглушка
**Проблема:** `packages/captcha/solver.ts` содержит `throw new Error('solveCaptcha: не реализован')`. Не используется оркестратором. Не блокер.

**Решение:** удалить или реализовать как fallback-обёртку.

### BUG-018 🟢 `response.buffer()` удалён в Puppeteer v22+
**Исправлено:** `page.evaluate(fetch, { credentials: 'include' })` — навигация не трогается.
Commit: `0509094285860c738a36e571f633314121854863`

### BUG-017 🟡 MagistrateAdapter проверен только на одном HTML-примере
**В работе:** парсинг по `h2`, `div.tab-content`, `table.tablcont`. Нужно проверить другие участки. Блокирован до BUG-020.

### BUG-016 🟡 Magistrate end-to-end
**В работе:** все компоненты реализованы, заблокирован BUG-020.

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:** `CaptchaRequiredError`, `isCaptchaPage`, `[CAPTCHA]` в оркестраторе.
