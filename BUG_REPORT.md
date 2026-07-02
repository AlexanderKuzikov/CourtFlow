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
| BUG-018 | `response.buffer()` удалён в Puppeteer v22+, runtime error при решении капчи | 🟢 | Высокий |
| BUG-019 | `solver.ts` — нереализованная заглушка, вводит в заблуждение | 🔴 | Низкий |

---

### BUG-019 🔴 `solver.ts` — нереализованная заглушка
**Проблема:** `packages/captcha/solver.ts` содержит `throw new Error('solveCaptcha: не реализован')`. Никем не используется (оркестратор идёт напрямую в `session.ts`), но вводит в заблуждение.

**Решение:** удалить файл либо реализовать как fallback-обёртку через `RuCaptchaClient` (primary) и 2captcha (fallback). Не блокер для end-to-end прогона.

### BUG-018 🟢 `response.buffer()` удалён в Puppeteer v22+
**Обнаружено:** при анализе кода перед end-to-end прогоном.

**Причина:** `session.ts` использовал `response.buffer()` (удалён в Puppeteer v22+) + `page.goto(imageUrl)` + `page.goBack()` (хрупко: msudrf может не добавлять `/captcha.php` в history, `goBack()` сбрасывает токен).

**Исправлено:** `readCaptchaImageAsBase64` переписана: `page.evaluate(fetch, { credentials: 'include' })` — навигация не трогается, куки сохраняются.

**Commit:** `0509094285860c738a36e571f633314121854863`

### BUG-016 🟡 Нет автоматического прохождения капчи для msudrf.ru
**В работе:**
- `packages/captcha/rucaptcha.ts` и `packages/captcha/session.ts` реализованы и отпатчены
- `orchestrator` переключён на Puppeteer + RuCaptcha для `magistrate`
- BUG-018 исправлен
- RuCaptcha переведён на API v2
- Требуется: живой end-to-end прогон (заполнен `RUCAPTCHA_API_KEY` + баланс)

### BUG-017 🟡 MagistrateAdapter проверен только на одном HTML-примере
**В работе:**
- текущая реализация основана на живом примере: `h2`, `div.tab-content`, `table.tablcont`
- нужно проверить другие дела / другие участки

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:**
- `packages/core/errors.ts`: `CaptchaRequiredError extends Error` + `isCaptchaPage(html)`
- Детектор: `html.includes('id="kcaptchaForm"')`
- `district`, `appeal`, `cassation`: проверка до парсинга
- `orchestrator`: `[CAPTCHA]` отдельно, счётчик `OK / FAIL / CAPTCHA`

### BUG-015 🟢 Справочник судов отсутствовал
**Исправлено:** `courts.json`, `core/courts.ts`, `npm run enrich:courts`, API `/api/courts`, вывод названия, адреса, телефонов и email в UI.
