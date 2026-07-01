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
| BUG-017 | MagistrateAdapter проверен только на одном живом HTML-примере | 🟡 | Средний |

---

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:**
- `packages/core/errors.ts` — новый файл, `CaptchaRequiredError extends Error` + `isCaptchaPage(html)`
- Детектор: `html.includes('id="kcaptchaForm"')`
- `district`, `appeal`, `cassation` — проверка в начале `parse()` до любого парсинга
- `orchestrator` — отдельная ветка `[CAPTCHA]`, счётчик в финальном логе: `OK / FAIL / CAPTCHA`
- `error: 'CAPTCHA'` в run-log фильтруется отдельно от обычных ошибок

### BUG-016 🟡 Нет автоматического прохождения капчи для msudrf.ru
**В работе:**
- добавлены `packages/captcha/rucaptcha.ts` и `packages/captcha/session.ts`
- `orchestrator` переключён на Puppeteer + RuCaptcha для `magistrate`
- требуется живой end-to-end прогон

### BUG-017 🟡 MagistrateAdapter проверен только на одном HTML-примере
**В работе:**
- текущая реализация основана на живом примере:
  - `h2` с `ДЕЛО № ...`
  - `div.tab-content`
  - `table.tablcont`
- нужно проверить другие дела / другие участки

### BUG-015 🟢 Справочник судов отсутствовал
**Исправлено:** добавлены `courts.json`, `core/courts.ts`, команда `npm run enrich:courts`, API `/api/courts`, вывод названия суда, адреса, телефонов и email в UI.
