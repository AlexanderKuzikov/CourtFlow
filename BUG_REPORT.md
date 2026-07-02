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
| BUG-005 | run-log без истории | 🟢 | Средний |
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
| BUG-016 | Нет автоматического прохождения капчи для msudrf.ru | 🟢 | Высокий |
| BUG-017 | MagistrateAdapter проверен только на одном HTML-примере | 🟡 | Средний |
| BUG-018 | `response.buffer()` удалён в Puppeteer v22+ | 🟢 | Высокий |
| BUG-019 | `solver.ts` — нереализованная заглушка | 🔴 | Низкий |
| BUG-020 | `ERR_CERT_COMMON_NAME_INVALID` / `ERR_NETWORK_ACCESS_DENIED` в Puppeteer headless | 🟢 | Высокий |
| BUG-021 | TS2503 `Cannot find namespace 'puppeteer'` в session.ts | 🟢 | Средний |
| BUG-022 | TS2339 `Property 'getAttribute' does not exist on type 'Locator'` | 🟢 | Средний |

---

### BUG-022 🟢 TS2339 `Locator.getAttribute` не существует
**Причина:** `page.locator('form#kcaptchaForm img').getAttribute('src')` — у Puppeteer `Locator` нет метода `getAttribute`.

**Исправлено:** заменено на `page.$eval('form#kcaptchaForm img', (img: HTMLImageElement) => img.getAttribute('src'))`.

### BUG-021 🟢 TS2503 `Cannot find namespace 'puppeteer'`
**Причина:** в `session.ts` тип `puppeteer.Page` использовался как namespace-тип, что не работает в Puppeteer v24.

**Исправлено:** `import puppeteer, { type Page } from 'puppeteer'`, тип функции `readCaptchaImageAsBase64(page: Page)`.

### BUG-020 🟢 `ERR_CERT_COMMON_NAME_INVALID` в Puppeteer headless
**Симптомы:**
- `page.goto(msudrf_url)` падал с `net::ERR_NETWORK_ACCESS_DENIED` (ранняя гипотеза), затем с `net::ERR_CERT_COMMON_NAME_INVALID`
- Реальная причина: wildcard-сертификат `*.msudrf.ru` не покрывает домены вида `35.perm.msudrf.ru` (два уровня вложенности)
- Chromium (в отличие от IE/Edge legacy) строго отклоняет такой сертификат

**Исправлено:** добавлен флаг `--ignore-certificate-errors` в `args` Puppeteer launch в `session.ts`.

**Попутно добавлено:**
- `PUPPETEER_HEADLESS=false` env-флаг для диагностики (не пушить в .env)
- `--disable-features=NetworkServiceInProcess`

**Результат:** magistrate `success: true` для 108.perm и 57.perm. Commit: `68e59450c94634473effbc04bfe911e7938b90ba`

### BUG-019 🔴 `solver.ts` — нереализованная заглушка
**Проблема:** `packages/captcha/solver.ts` содержит `throw new Error('solveCaptcha: не реализован')`. Не используется оркестратором. Не блокер.

**Решение:** удалить или реализовать как fallback-обёртку.

### BUG-018 🟢 `response.buffer()` удалён в Puppeteer v22+
**Исправлено:** `page.evaluate(fetch, { credentials: 'include' })` — навигация не трогается.

### BUG-017 🟡 MagistrateAdapter проверен только на одном HTML-примере
**В работе:** парсинг по `h2`, `div.tab-content`, `table.tablcont`. Нужно проверить другие участки мировых судей.

### BUG-016 🟢 Magistrate end-to-end
**Закрыт:** `npm run parse` парсит magistrate-суда через Puppeteer + RuCaptcha API v2. Подтверждено логами: 108.perm и 57.perm — `success: true`. Заблокированный BUG-020 устранён.

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:** `CaptchaRequiredError`, `isCaptchaPage`, `[CAPTCHA]` в оркестраторе.
