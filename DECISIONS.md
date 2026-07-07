# DECISIONS — CourtFlow

> Архитектурные решения, стратегия и планы. Обновляется по мере принятия решений.

---

## Технологические решения

### Язык и рантайм
TypeScript + Node.js 24 (ESM). Без сборки — запуск через `tsx`. Native `fetch`, без `node-fetch`.

### Хранение URL дел
Основной источник — папка `watch/`. Поддерживаются любые текстовые файлы: `.txt`, `.json`, `.csv`, без расширения и т.д. Система рекурсивно сканирует `watch/`, извлекает все `*.sudrf.ru` / `*.msudrf.ru` URL из произвольного текста, нормализует их и дедуплицирует. Если `watch/` отсутствует или пуста — fallback на `urls.txt`.

Принципы:
- входной источник может класть данные в любом удобном формате;
- одна ссылка в файле, несколько ссылок, JSON-поля, CSV-ячейки, пробелы/переносы/`;`/`|` — всё допустимо;
- отсутствие схемы (`https://`) автоматически исправляется;
- удаление файла из `watch/` означает прекращение мониторинга URL из него.

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

Дополнительно принято:
- UI показывает только **активные** суды из текущего источника мониторинга (`watch/` / `urls.txt`), а не все исторические JSON в `data/`;
- для этого введён reconciliation в `/api/cases`;
- добавлен `/api/active-courts` для точного списка судов в мониторинге;
- в UI есть ручной запуск полного и retry-прогона.

### Планировщик прогонов
Принята двухуровневая схема:
- **full-run** — основной прогон всех URL по расписанию `schedule`;
- **retry-run** — повторный прогон только stale URL по расписанию `scheduleRetry`.

Stale URL определяется по `run-log-*.json`: если для URL нет успешного обновления дольше чем `staleThresholdH` часов, он попадает в retry-прогон.

Причина такого решения: суды часто частично недоступны в момент основного запуска; повторный прогон должен добирать только проблемные источники, не гоняя весь пул повторно.

### pm2 / Linux runtime
На Linux используются три процесса:
- `courtflow-viewer` — web-viewer;
- `courtflow-parser` — основной прогон;
- `courtflow-parser-retry` — retry-прогон с `--retry`.

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

Legacy API v1 (`rucaptcha.com/in.php`, `rucaptcha.com/res.php`, `URLSearchParams`) **не использовать**.

Параметры `ImageToTextTask` для msudrf капчи:
- `type: "ImageToTextTask"`
- `numeric: 4`
- `minLength: 4`, `maxLength: 6`
- `case: false`
- `languagePool: "rn"`
- `softId: "3898"`

---

## Стратегия развития

### Фаза 1 — Базовый парсинг (✅)
- district, appeal, cassation
- viewer UI
- orchestrator/loadUrls
- merge по uid

### Фаза 2 — Справочник судов (✅)
- `courts.json`
- `core/courts.ts`
- `enrich:courts`
- `GET /api/courts`
- адреса/телефоны/email в UI

### Фаза 3 — Magistrate (✅)
- Puppeteer
- captcha flow
- RuCaptcha API v2 integration
- MagistrateAdapter

### Фаза 4 — Инфраструктура (в работе)
- watch/
- reconciliation UI/data
- two-tier scheduling
- pm2 runtime
- XLSX (низкий приоритет)
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
| 2026-07-06 | `watch/` стал основным источником URL, `urls.txt` оставлен как fallback |
| 2026-07-06 | Входной формат watch/ сделан максимально либеральным: text/JSON/CSV/space-separated |
| 2026-07-06 | UI показывает только активные courtId из watch/ через reconciliation |
| 2026-07-06 | Принята двухуровневая схема прогонов: full-run + retry-run по staleThresholdH |
| 2026-07-06 | В UI добавлено ручное управление full/retry прогонами |


---

## Code Review 2026-07-07

Проведён полный code review (Hermes Agent), все пункты разобраны построчно. Изменения внесены напрямую в GitHub (коннектор был нестабилен).

**Принято:**
- BUG-023: убран `decodeEntities: false` из 5 файлов (appeal.ts, cassation.ts, district.ts, magistrate.ts, courts.ts)
- - BUG-024: исправлена типизация `CourtType` в orchestrator.ts (`ADAPTERS`, `courtGroups`, `loadCaseHtml`)
  - - BUG-025: stale lock после SIGKILL/OOM — добавлена проверка `isProcessAlive(pid)` через `process.kill(pid, 0)`
    - - BUG-026: добавлен graceful shutdown в viewer/server.ts (SIGTERM/SIGINT → `serverInstance.close()` + fallback 5s)
     
      - **Отклонено:**
      - - Пункт 10 (изменить `extractCourtId` для magistrate): брать предпоследний сегмент хоста — это сольёт разные участки одного региона в один `courtId`, что приведёт к перезатиранию данных. Схема `35.perm` осознанная.
       
        - **Отложено (техдолг):** тесты, ESLint/Prettier, pino, Zod, fallback captcha, XLSX, uuid vulnerability fix — см. CODE_REVIEW.md раздел «Ответ на ревю».
