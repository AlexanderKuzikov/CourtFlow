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

### TUI (терминальный интерфейс)
Принято решение добавить TUI-дашборд на **blessed** как альтернативу браузерному UI для сценариев где браузер недоступен (headless-сервер по SSH, серверы без GUI).

Причины выбора blessed:
- 0 зависимостей (vs ink — тянет React ~20 MB)
- Встроенные `listtable`, скролл, клавиатурная навигация
- Работает в любом терминале (Windows Terminal, PowerShell, CMD, SSH, VS Code)
- Лицензия MIT, совместим с ESM (через tsx)

Клиент (`packages/cli/client.ts`) — общий HTTP-клиент для TUI и будущих CLI-команд. Использует те же REST-эндпоинты что и браузерный UI — никакой дупликации логики.

### Tauri
Рассмотрен и **отклонён** для CourtFlow. Причины:
- CourtFlow — серверное приложение (pm2 + cron), а не десктопное
- Tauri-приложение не работает без графической сессии (X11/Wayland) — бесполезно на headless-сервере
- Уже есть браузерный UI (для RDP/локального режима) и TUI (для SSH) — покрывают все сценарии

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

### .env и секреты
Ключи API загружаются через нативный `process.loadEnvFile()` (Node 21.7+). dotenv **удалён** — 0 зависимостей. На проде ключи можно задавать в `ecosystem.config.cjs` → `env:`.

### Порт viewer и авто-поиск
Порт по умолчанию — **8791** (не 3000: избегаем гарантированных коллизий с React/Express туториалами).

При старте сервер проверяет занятость порта через `createServer().listen()`:
- Идентифицирует процесс-владелец (`netstat`/`lsof` → PID + имя)
- Если порт занят *не* CourtFlow — переключается на следующий свободный (+1 в цикле, до +100)
- Фактический порт пишется в `logs/.port`
- TUI-клиент читает `logs/.port` при старте — подхватывает фактический порт автоматически

### UID как источник истины
UID ГАС «Правосудие» (формат `59RS0007-01-2025-011795-66`) — первичный идентификатор дела.

Свойства:
- Глобально уникален, содержит код суда
- Не зависит от источника URL
- При смене инстанции меняется (апелляция получает новый UID)

Планируемые поля:
- `externalId` — ID из внешней CRM (опциональный)
- `relatedUids: string[]` — связка «первая инстанция → апелляция → кассация»

### Court-Harvester
Каталог судов РФ через DaData API: 10 206 судов, 96 регионов, 14 типов.
Формат: `code` (RRTTNNNN), `name`, `inn`, `court_type`, `address`, `website`.

План: Court-Harvester → экспорт JSON → CourtFlow читает как `courts.json`.
CourtFlow добавляет недостающие поля (phones, email) через scraping главных страниц.
Обновление каталога — Court-Harvester раз в месяц/квартал, CourtFlow подхватывает.

### CRM-интеграция (план)
CourtFlow — компонент CRM для юристов. Коммуникация: HTTP API + JSON.
- Сбор URL: ручной → автоматический (поиск по суду + истец/ответчик)
- Подача URL: `POST /api/urls`
- Связь дел: `externalId` (CRM) ↔ `uid` (ГАС)

### Лицензия
**Apache-2.0**. Патентный грант (раздел 3) важен для коммерческого использования юрфирмами и судами. MIT дал бы меньше защиты.

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
- TUI (blessed, терминальный дашборд)
- авто-поиск порта, `logs/.port`
- XLSX (низкий приоритет)
- уведомления

### Фаза 5 — Интеграция (план)
- **UID как courtId** — извлечение кода суда из UID ГАС «Правосудие»
- **Court-Harvester** — замена `courts.json` на каталог 10k+ судов, автообновление
- **POST /api/urls** — программная подача URL из внешних систем (CRM, поисковый модуль)
- **externalId** — ID дела в CRM
- **relatedUids** — связка инстанций (первая → апелляция → кассация)
- **CRM для юристов** — CourtFlow как компонент большей системы

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
| 2026-07-11 | TUI дашборд на blessed: терминальный UI для SSH-доступа. Tauri отклонён. |
| 2026-07-11 | Порт 3000 заменён на 8791. Авто-поиск свободного порта при старте. |
| 2026-07-11 | dotenv удалён. .env загружается через process.loadEnvFile() (Node 21.7+). |
| 2026-07-11 | Все пакеты обновлены до последних стабильных (TS 7.0.2, Puppeteer 25.3.0, Vitest 4.1.10). |
| 2026-07-11 | @types/node@24 для Node 24 LTS (не @26). |
| 2026-07-11 | **UID ГАС «Правосудие» — источник истины** уникальности дела. Один uid = одно дело. |
| 2026-07-11 | **TUI: list вместо listtable** — надёжное выделение строк (white+black), разделители `│`. |
| 2026-07-11 | **Court-Harvester** (10 206 судов, DaData API) — будущий источник каталога судов. |
| 2026-07-11 | **CRM-интеграция**: CourtFlow → компонент CRM для юристов. API + JSON, без смены стека. |
| 2026-07-11 | **TUI стабилизация**: setInterval→рекурсивный setTimeout с refreshing, selectedCaseIdx, fullUnicode fallback, searchActive флаг, UTF-8 вместо \uXXXX. |
| 2026-07-11 | **TUI: скрыт курсор** — ANSI \x1b[?25l/h вместо blessed cursor (blessed не скрывает курсор на Windows). |


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
