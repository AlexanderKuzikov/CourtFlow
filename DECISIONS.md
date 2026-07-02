# DECISIONS — CourtFlow

> Архитектурные решения, стратегия и планы. Обновляется по мере принятия решений.

---

## Технологические решения

### Язык и рантайм
TypeScript + Node.js 24 (ESM). Без сборки — запуск через `tsx`. Native `fetch`, без `node-fetch`.

### Хранение URL дел
`urls.txt` — плоский файл, одна строка — одно дело. `config.json` не содержит URL.

### Один адаптер — один тип суда
Изоляция логики. Изменения HTML на сайтах происходят по типам судов, не глобально.

### Справочник судов
`courts.json` в корне репозитория. Хранит:
- полное наименование суда
- shortName
- адрес
- телефоны
- email
- тип суда
- vnkod
- sourceUrl
- fetchedAt

Пополняется отдельной командой `npm run enrich:courts`, а не во время каждого парсинга дел.

### UI
Vanilla HTML/JS + Express. Без фреймворков. Название суда в UI должно идти из справочника, а не из поддомена.

### Magistrate captcha flow
Для `*.msudrf.ru` используется **Puppeteer + RuCaptcha**.

Пайплайн:
1. Открываем URL дела в браузерном контексте
2. Если видим `form#kcaptchaForm`, забираем `/captcha.php` через `page.evaluate(fetch)` — без навигации, куки сохраняются
3. Отправляем изображение в RuCaptcha API v2 (`api.rucaptcha.com`)
4. Polling до `status: ready`
5. Подставляем `solution.text` в `input[name="captcha-response"]`
6. Сабмитим форму
7. Получаем HTML карточки дела
8. Отдаём HTML в `MagistrateAdapter.parse()`

Ручной ввод капчи допускается только для локальной диагностики, не как продуктовый режим.

### RuCaptcha API
**Всегда использовать API v2** (`api.rucaptcha.com`, JSON, `createTask`/`getTaskResult`).

Legacy API v1 (`rucaptcha.com/in.php`, `rucaptcha.com/res.php`, `URLSearchParams`) **не использовать** — может быть отключён без предупреждения.

Параметры `ImageToTextTask` для msudrf капчи:
- `type: "ImageToTextTask"` — текстовая капча по изображению
- `numeric: 4` — любые символы (цифры + буквы); 0=любые, 1=только цифры, 2=только буквы, 4=любые
- `minLength: 4`, `maxLength: 6` — снижает вероятность неверного ответа
- `case: false` — регистронезависимо (msudrf не чувствителен к регистру)
- `languagePool: "rn"` — русский + английский алфавит
- `softId: "3898"` — идентификатор клиента

Обработка ошибок: проверять `errorId !== 0` → бросать с `errorCode`. `status: 'processing'` → продолжать polling. `status: 'ready'` → брать `solution.text`.

---

## Стратегия развития

### Фаза 1 — Базовый парсинг (✅)
- district, appeal, cassation
- viewer UI
- orchestrator/loadUrls
- merge по uid

### Фаза 2 — Справочник судов (в работе)
- `courts.json`
- `core/courts.ts`
- `enrich:courts`
- `GET /api/courts`
- адреса/телефоны/email в UI
- далее: автоматическое заполнение `vnkod`

### Фаза 3 — Magistrate (в работе)
- Puppeteer
- captcha flow
- BUG-010
- RuCaptcha API v2 integration
- MagistrateAdapter

### Фаза 4 — Инфраструктура
- XLSX
- systemd/pm2
- уведомления

---

## Журнал решений

| Дата | Решение |
|---|---|
| 2026-07-01 | `urls.txt` — единственный источник URL |
| 2026-07-01 | Smoke-лог через `smokeSaveLog` |
| 2026-07-01 | Merge по uid |
| 2026-07-01 | UI без фреймворков |
| 2026-07-01 | `fileURLToPath` для static-path на Windows |
| 2026-07-01 | Справочник судов вынесен в отдельную команду `enrich:courts` |
| 2026-07-01 | Адрес, телефоны и email обязательны в справочнике судов |
| 2026-07-01 | BUG-010 решаем через отдельный тип ошибки `CaptchaRequiredError` |
| 2026-07-01 | Для мировых судов выбран RuCaptcha вместо 2captcha / ручного ввода |
| 2026-07-01 | Получение HTML magistrate идёт через Puppeteer-сессию, не через plain fetch |
| 2026-07-01 | BUG-018: получение captcha image через `page.evaluate(fetch)` — без навигации |
| 2026-07-02 | RuCaptcha: использовать только API v2 (createTask/getTaskResult, api.rucaptcha.com) |
| 2026-07-02 | ImageToTextTask params: numeric=4, minLength=4, maxLength=6, case=false, languagePool=rn |
