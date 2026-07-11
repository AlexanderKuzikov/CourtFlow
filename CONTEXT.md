# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON, показывает через браузерный web-viewer и терминальный TUI-дашборд.

- Целевой сервер: **Linux (Ubuntu)**. Доступ через браузер из офисной сети.
- Разработка: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0** (LTS), TypeScript: **7.0.2**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков) + **TUI** (blessed с разделителями `│`, список с выделением строк)
- Запуск: `npx tsx` без сборки
- Менеджер процессов на Linux: **pm2**
- .env: загружается через `process.loadEnvFile()` (Node 21.7+, 0 зависимостей)
- Порт viewer: **8791** по умолчанию, авто-поиск свободного если занят → `logs/.port`
- Лицензия: **Apache-2.0** (патентный грант для коммерческого использования)
- Зависимости: **blessed** (TUI), **cheerio** (HTML parsing), **express** (API), **iconv-lite** (charset), **puppeteer** (captcha)

---

## Экосистема проектов (D:\GitHub\)

CourtFlow — компонент большей экосистемы мониторинга судебных дел:

| Проект | Роль | Данные |
|---|---|---|
| **Court-Harvester** | Каталог судов РФ через DaData API | 10 206 судов, 96 регионов, 14 типов |
| **FIAS-parser** | Привязка адресов судов к ГАР/OKTMO | OKTMO, FIAS GUID |
| **SudRF-Parser** | Легаси-парсер карточек дел (cheerio) | Предшественник CourtFlow |
| **Court-Viewer** | Легаси-веб-вьюер дел (Express) | Предшественник |
| **court-data** | Репо-хранилище JSON дел | Исторические данные |
| **CourtFlow** | **Текущий** — мониторинг, парсинг, UI, TUI | Это мы |

### Court-Harvester — детали

Сборщик каталога судов через DaData API (`suggestions.dadata.ru`). Формат записи:

```typescript
interface CourtData {
  code: string;              // RRTTNNNN (RR=регион, TT=тип, NNNN=номер)
  name: string;              // Полное наименование
  inn: string | null;        // ИНН
  court_type: string;        // RS, MS, AS, AA, AO, AI, VS, KJ, AJ, GV, KV, AV, OV, OS
  court_type_name: string;   // «Районный, городской, межрайонный суд» и т.д.
  address: string;           // Физический адрес
  legal_address: string | null;
  website: string | null;    // URL официального сайта
  phone?: string | null;
  region_code?: string;
}
```

Содержит 14 типов судов (включая арбитражные, военные, Верховный суд). CourtFlow сейчас работает только с 4 типами общей юрисдикции (district, appeal, cassation, magistrate).

### План интеграции CourtFlow ↔ Court-Harvester

1. **Замена `courts.json`** — текущий справочник CourtFlow заменяется на экспорт из Court-Harvester. CourtFlow добавляет недостающие поля (phones, email) через scraping главных страниц судов.
2. **Единый идентификатор суда** — `courtId` из CourtFlow переходит с поддомена (`sverdlov--perm`) на код (`59RS0007` из Court-Harvester `code` или из UID дела).
3. **Автообновление** — Court-Harvester обновляет каталог раз в месяц/квартал, CourtFlow подхватывает через файл или HTTP.

---

## Идентичность дела

Источник истины уникальности дела — **UID ГАС «Правосудие»**.

Формат: `59RS0007-01-2025-011795-66`
- `59RS0007` — код суда в ГАС «Правосудие»
- `01-2025` — номер производства / год
- `011795-66` — номер дела

UID:
- Уникален глобально, не может появиться в двух разных судах
- Содержит код суда — `courtId` можно извлечь без привязки к URL
- Не зависит от источника URL (ручной ввод, поиск, API, файл)
- При передаче дела в следующую инстанцию UID меняется (апелляция получает новый)

Текущая реализация:
- `Case.uid` заполняется адаптерами из HTML
- `Case.court` — поддомен (будет заменён на код)
- Дедупликация при merge — по `uid`

Будущие доработки:
- `externalId` — ID из CRM (опционально, генерируется внешней системой)
- `relatedUids` — связка «первая инстанция → апелляция → кассация»
- Извлечение кода суда из UID → поиск в каталоге Court-Harvester

---

## Будущее: интеграция в CRM

CourtFlow станет компонентом CRM для юристов. Ключевые точки расширения:

1. **Автоматический сбор URL** — поиск дел по суду + истец/ответчик (отдельный модуль «сборщик»)
2. **Программная подача URL** — `POST /api/urls` для внешних систем (CRM, поисковый модуль)
3. **Каталог судов** — интеграция с Court-Harvester, автообновление
4. **Внешний ID** — `externalId` для связи дела в CourtFlow с делом в CRM
5. **Связанные дела** — `relatedUids` для отслеживания движения по инстанциям

Коммуникация между компонентами — HTTP API + файлы JSON (без изменений пока объёмы позволяют).

---

## Архитектура

```
courtflow/
├── config.json              # schedule, scheduleRetry, staleThresholdH, port (8791)
├── courts.json              # ⚠️ Временный — будет заменён на Court-Harvester
├── watch/                   # ✅ Основной источник URL (любые текстовые файлы)
├── urls.txt                 # Fallback если watch/ отсутствует или пуста (26 URL)
├── .env                     # RUCAPTCHA_API_KEY, TWOCAPTCHA_API_KEY
├── ecosystem.config.cjs     # ✅ pm2: viewer + parser + parser-retry
├── CODE_REVIEW.md           # ✅ Журнал code review (2 ревю)
├── AUDIT_REPORT.md          # ⚠️ Исторический (2026-07-02, есть баннер)
├── RUCAPTCHA_INTEGRATION_GUIDE.md
├── LINUX_DEPLOY.md          # ✅ Инструкция по деплою (+ TUI через SSH)
├── HTML_STRUCTURE.md
├── DECISIONS.md             # ✅ Архитектурные решения (ADR)
├── BUG_REPORT.md
├── PROMPT_FOR_NEW_SESSION.md
├── logs/
│   ├── run-log-*.json       # История запусков
│   ├── .port                # Фактический порт viewer (авто-поиск)
│   └── smoke-last.log
├── data/                    # JSON результатов парсинга (cases-{courtId}-{date}.json)
└── packages/
    ├── core/
    │   ├── config.ts            # config.json + process.loadEnvFile(.env)
    │   ├── urls.ts              # ✅ watch/ + fuzzy нормализатор + fallback urls.txt
    │   ├── courts.ts            # Загрузка courts.json
    │   ├── errors.ts            # CaptchaRequiredError
    │   ├── types.ts             # Case, CourtAdapter, RunResult, CourtType
    │   ├── retry.ts             # Exponential backoff (withRetry)
    │   └── urls.test.ts         # ✅ 19 unit-тестов
    ├── adapters/
    │   ├── district.ts          # *.sudrf.ru
    │   ├── appeal.ts            # oblsud--*.sudrf.ru
    │   ├── cassation.ts         # *kas.sudrf.ru
    │   └── magistrate.ts        # *.msudrf.ru (captcha flow)
    ├── captcha/
    │   ├── rucaptcha.ts         # RuCaptcha API v2
    │   └── session.ts           # Puppeteer-сессия для msudrf
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ full-run + --retry режим
    │   ├── smoke.ts             # Smoke-тест (1 URL каждого типа)
    │   └── enrich-courts.ts     # Обогащение справочника судов
    ├── exporter/
    │   ├── json.ts              # JSON экспорт + merge по uid
    │   └── xlsx.ts              # ⏳ Заглушка (низкий приоритет)
    ├── viewer/
    │   ├── server.ts            # ✅ Express + REST API + авто-поиск порта
    │   └── public/
    │       └── index.html       # ✅ Браузерный UI (Vanilla HTML/JS)
    └── cli/
        ├── client.ts            # ApiClient — общий HTTP-клиент (читает logs/.port)
        └── tui.ts               # TUI-дашборд на blessed (list с разделителями │)
```

---

## Текущее состояние (2026-07-11)

### ✅ Сделано сегодня
- **TUI** — терминальный дашборд на blessed (list с `│`-разделителями, выделение строки white+black, скролл, авторефреш 5с, сервер-индикатор)
- **Порт** — 8791 по умолчанию, авто-поиск свободного, `logs/.port`
- **dotenv удалён** — `process.loadEnvFile()` (0 зависимостей)
- **Пакеты** — TS 7.0.2, Puppeteer 25.3.0, Vitest 4.1.10, @types/node@24, tsx 4.23.0, iconv-lite 0.7.3
- **README** — переписан (бэджи, профформат, Apache-2.0)
- **Tauri** — рассмотрен и отклонён (браузерный UI + TUI покрывают все сценарии)
- **TUI стабилизация** — исправлены: race condition автообновления (setInterval→setTimeout+refreshing), хрупкое поле selected, Unicode fallback (│→|), конфликт поиска с автообновлением, `\uXXXX` заменены на UTF-8, упрощён resize, скрыт мигающий курсор через ANSI-коды (blessed не скрывает курсор на Windows)

### ✅ Общее состояние
- `npm run parse` — 26/26 дел, 100% success (Windows + Linux)
- `npm run parse -- --retry` — только stale URL
- `npm test` — 19/19 unit-тестов (`urls.test.ts`)
- Linux-деплой прошёл, демонстрация успешна
- Code review #1: BUG-023..026 закрыты
- Code review #2: 2 блокера + 5 важных закрыты
- UI: показывает только активные суды из `watch/`
- Ручной запуск full-run / retry-run в браузерном UI и TUI
- `watch/` принимает `.txt`, `.json`, `.csv`, файлы без расширения

### ⏳ Очередь задач
1. **Интеграция Court-Harvester** — замена `courts.json` на каталог из 10k+ судов
2. **UID как courtId** — извлечение кода суда из UID дела
3. **POST /api/urls** — программная подача URL из внешних систем
4. **externalId / relatedUids** — поля для CRM и связки инстанций
5. **XLSX** — `packages/exporter/xlsx.ts` (низкий приоритет)
6. **Singleton browser** — кешировать Puppeteer для magistrate
7. **Rate-limiting** — задержки между запросами к одному суду

---

## TUI — терминальный дашборд

`npm run tui` — интерактивный дашборд в любом терминале (SSH, Windows Terminal, PowerShell, VS Code).

Библиотека: **blessed** (0 зависимостей). Подключение к Express API.

| Вкладка | Клавиши | Действие |
|---|---|---|
| **Дела** (`1`) | `↑↓` выбор, `Enter` детали, `/` поиск, `F` фильтр | Таблица дел с `│`-разделителями |
| **Логи** (`2`) | `↑↓` скролл, `D` дни (1/7/30) | Лента запусков |
| **Запуск** (`3`) | `F` полный, `R` retry, `E` суды, `D` данные | Управление прогонами |

- Выделенная строка: белый фон + чёрный жирный текст
- Авторефреш каждые 5 секунд (сохраняет позицию)
- Индикатор сервера в статус-баре: `● зелёный` / `● красный Сервер недоступен`
- `Enter` / `Esc` — открыть/закрыть детали дела

Удалённое подключение: `npm run tui -- --api http://server:8791`

---

## URL — источник и дедупликация

**Источник:** `watch/` (основной) → fallback `urls.txt`

**Дедупликация:** единый `Set<string>` по полному URL внутри `watch/`. Между `watch/` и `urls.txt` дедупликация не требуется — они взаимоисключающие.

**Дедупликация дел:** при merge в `exporter/json.ts` — по `uid` (UID ГАС «Правосудие»). Один uid = одно дело, независимо от источника URL.

---

## Two-tier scheduling

```json
"schedule":       "0 8 * * 1,3,5"
"scheduleRetry":  "0 11,14 * * 1,3,5"
"staleThresholdH": 24
```

- `courtflow-parser` — основной прогон, все URL
- `courtflow-parser-retry` — retry-прогон с `--retry`, только stale URL

---

## Команды

```bash
# Windows / Linux
npm run test:smoke
npm run parse
npm run parse -- --retry
npm test
npm start                     # Браузерный UI (авто-порт, по умолчанию 8791)
npm run tui                   # Терминальный дашборд
npm run tui -- --api http://server:8791
npm run enrich:courts

# Linux / pm2
pm2 start ecosystem.config.cjs
pm2 restart courtflow-parser
pm2 restart courtflow-parser-retry
pm2 logs courtflow-viewer
pm2 status
```

---

## Code Review история

### Code Review #1 (2026-07-07)
- ✅ BUG-023: `decodeEntities` ошибка в 5 файлах
- ✅ BUG-024: `CourtType` типизация в orchestrator.ts
- ✅ BUG-025: stale lock после SIGKILL/OOM
- ✅ BUG-026: graceful shutdown в viewer/server.ts

### Code Review #2 (2026-07-10)
- ✅ B1: `courtType: any` → `CourtType` в enrich-courts.ts
- ✅ B2: Promise.race leak → AbortController
- ✅ V1: Fallback UID из case_id в magistrate.ts
- ✅ V3: Fallback captcha provider 2captcha
- ✅ V4: Magistrate тест через cached HTML в smoke.ts
- ✅ V5: 19 unit-тестов `urls.test.ts`
- ✅ S2: Хардкод «urls.txt» исправлен
- ✅ S10: Хардкод «ОК: 26» исправлен

**Техдолг (backlog):**
- Singleton browser для magistrate
- Rate-limiting между запросами
- ESLint/Prettier, pino, Zod-валидация конфига
- XLSX exporter (низкий приоритет)
