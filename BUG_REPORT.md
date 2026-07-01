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
| BUG-010 | Нет различения капча/503 | 🔴 | Средний |
| BUG-011 | node-fetch ESM + Windows | 🟢 | Средний |
| BUG-012 | charset автоопределение | 🟢 | Средний |
| BUG-013 | Кодировка smoke-лога на Windows | 🟢 | Низкий |
| BUG-014 | `Cannot GET /` — неверный путь к static на Windows | 🟢 | Высокий |

---

## 🔐 Безопасность

### BUG-001 🟢
**Исправлено:** `dotenv` загружается в `loadConfig()` автоматически.

### BUG-002 🟢
**Исправлено:** `loadConfig()` пишет `warn` если magistrate enabled без ключей.

### BUG-003 🟢
**Исправлено:** `GET /api/config` возвращает `SafeAppConfig` — без `apiKey`/`fallbackApiKey`.

### BUG-004 🟢
**Исправлено:** `Promise.race([parse(), timeout(10s)])` в orchestrator.

### BUG-005 🟢
**Исправлено:** Лог в `run-log-YYYY-MM-DD.json`, добавляется к существующим записям.

### BUG-006 🟢 Повторный парсинг стирает данные
**Исправлено:** `exportJson` читает существующий файл и мержит по `uid`. Новые данные обновляют существующие записи, новые — добавляются.

### BUG-007 🟢
**Исправлено:** `logs/orchestrator.lock` + `finally`.

### BUG-008 🟢
**Исправлено:** smoke-тест 2026-07-01 подтвердил district/appeal/cassation.

### BUG-009 🟢
**Исправлено:** Fallback на `case_uid` → `case_id`. Все адаптеры.

### BUG-010 🔴 Нет различения капча/503
**Описание:** HTTP 200 + форма капчи — ошибка в логах вводит в заблуждение.
**Решение:** Проверять `<form` с полем капчи, бросать `CaptchaRequiredError`.
**Файл:** все адаптеры.

### BUG-011 🟢
**Исправлено:** `node-fetch` удалён, native fetch везде.

### BUG-012 🟢
**Исправлено:** charset из `Content-Type`. win1251 подтверждён smoke-тестом.

### BUG-013 🟢
**Исправлено:** `smoke.ts` сам пишет лог в UTF-8 через `fs.createWriteStream`. Управляется флагом `smokeSaveLog` в `config.json`.

### BUG-014 🟢 `Cannot GET /` на Windows
**Описание:** `new URL('public', import.meta.url).pathname` на Windows возвращал `/C:/...` — Express не находил файлы.
**Исправлено:** `fileURLToPath(import.meta.url)` + `dirname` + `join(__dirname, 'public')`.

---

## 📝 Что проверить дальше

1. BUG-010 — детекция капчи в HTML (все адаптеры)
2. Реализация MagistrateAdapter + captcha flow
3. `exporter/xlsx.ts` — не реализован
