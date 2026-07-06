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
| BUG-016 | Нет автоматического прохождения капчи для msudrf.ru | 🟢 | Высокий |
| BUG-017 | MagistrateAdapter: uid=case_id, events 4 колонки, нет filingDate/result | 🟢 | Средний |
| BUG-018 | `response.buffer()` удалён в Puppeteer v22+ | 🟢 | Высокий |
| BUG-019 | `solver.ts` — нереализованная заглушка | 🟢 | Низкий |
| BUG-020 | `ERR_CERT_COMMON_NAME_INVALID` в Puppeteer headless | 🟢 | Высокий |
| BUG-021 | TS2503 `Cannot find namespace 'puppeteer'` в session.ts | 🟢 | Средний |
| BUG-022 | TS2339 `Property 'getAttribute' does not exist on type 'Locator'` | 🟢 | Средний |

---

### BUG-019 🟢 `solver.ts` — нереализованная заглушка
**Исправлено:** файл удалён (2026-07-06). Реальная логика решения капчи — в `captcha/rucaptcha.ts` + `captcha/session.ts`.

### BUG-022 🟢 TS2339 `Locator.getAttribute` не существует
**Исправлено:** заменено на `page.$eval('form#kcaptchaForm img', (img: HTMLImageElement) => img.getAttribute('src'))`.

### BUG-021 🟢 TS2503 `Cannot find namespace 'puppeteer'`
**Исправлено:** `import puppeteer, { type Page } from 'puppeteer'`.

### BUG-020 🟢 `ERR_CERT_COMMON_NAME_INVALID` в Puppeteer headless
**Причина:** wildcard `*.msudrf.ru` не покрывает домены вида `35.perm.msudrf.ru`. Chromium строго отклоняет такой сертификат.
**Исправлено:** добавлен флаг `--ignore-certificate-errors` в args Puppeteer launch в `session.ts`.

### BUG-018 🟢 `response.buffer()` удалён в Puppeteer v22+
**Исправлено:** `page.evaluate(fetch, { credentials: 'include' })`.

### BUG-017 🟢 MagistrateAdapter: некорректный uid, 4 колонки событий, нет дат
**Исправлено:** uid=caseNumber из `<h2>`, 5 колонок, filingDate/hearingDate/result.

### BUG-016 🟢 Magistrate end-to-end
**Закрыт:** 12/12 дел `success: true` на 8 участках.

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:** `CaptchaRequiredError`, `isCaptchaPage`, `[CAPTCHA]` в оркестраторе.
