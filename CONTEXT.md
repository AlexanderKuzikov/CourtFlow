# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON, показывает через web-viewer.

- Целевой сервер: **Linux (Ubuntu)**. Доступ через браузер из офисной сети.
- Разработка: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0** (LTS), TypeScript: **7.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков) + **TUI** (blessed)
- Запуск: `npx tsx` без сборки
- Менеджер процессов на Linux: **pm2**
- .env: загружается через `process.loadEnvFile()` (Node 21.7+, 0 зависимостей)
- Порт viewer: **8791** по умолчанию, авто-поиск свободного если занят

## Архитектура

```
courtflow/
├── config.json              # schedule, scheduleRetry, staleThresholdH
├── courts.json              # ✅ Справочник судов
├── watch/                   # ✅ Основной источник URL (любые текстовые файлы)
├── urls.txt                 # Fallback если watch/ отсутствует или пуста
├── .env                     # RUCAPTCHA_API_KEY (не коммитить)
├── ecosystem.config.cjs    # ✅ pm2: viewer + parser + parser-retry
├── CODE_REVIEW.md         # ✅ Журнал code review (2 ревю)
├── AUDIT_REPORT.md         # ⚠️ Исторический (2026-07-02, есть баннер)
├── RUCAPTCHA_INTEGRATION_GUIDE.md
├── LINUX_DEPLOY.md         # ✅ Инструкция по деплою
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── PROMPT_FOR_NEW_SESSION.md
├── logs/
└── packages/
    ├── core/
    │   ├── config.ts            # scheduleRetry, staleThresholdH в интерфейсе
    │   ├── urls.ts              # ✅ watch/ + fuzzy нормализатор + fallback urls.txt
    │   ├── courts.ts
    │   ├── errors.ts
    │   ├── types.ts
    │   ├── retry.ts
    │   └── urls.test.ts         # ✅ 19 unit-тестов extractUrls / CourtType / CourtId
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts
    ├── captcha/
    │   ├── rucaptcha.ts
    │   └── session.ts
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ full-run + --retry режим по stale URL
    │   ├── smoke.ts
    │   └── enrich-courts.ts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳ не реализовано (низкий приоритет)
    └── viewer/
        ├── server.ts            # ✅ reconciliation + /api/active-courts + full/retry/enrich endpoints
        └── public/
            └── index.html       # ✅ UI управления прогонами
    └── cli/                     # ⬜ NEW (2026-07-11)
        ├── client.ts            # HTTP-клиент к REST API (общий для TUI и будущих CLI-команд)
        └── tui.ts               # TUI-дашборд на blessed (терминальный интерфейс)
```

## Текущее состояние (2026-07-11)

### ✅ Всё работает
- `npm run parse` — 26/26 дел, 100% success (Windows + Linux)
- `npm run parse -- --retry` — только stale URL (lastSuccess > staleThresholdH часов)
- `npm test` — 19/19 unit-тестов (`urls.test.ts`)
- Linux-деплой прошёл, демонстрация успешна
- Code review #1: BUG-023..026 закрыты (TS-ошибки, stale lock, graceful shutdown)
- Code review #2: 2 блокера + 5 важных закрыты (Promise.race, fallback captcha, magistrate UID, smoke, тесты)
- UI: показывает только активные суды из `watch/`
- Ручной запуск full-run / retry-run есть в браузерном UI и TUI
- `watch/` принимает `.txt`, `.json`, `.csv`, файлы без расширения, пробельное разделение ссылок, кавычки и смешанные разделители
- **TUI** — терминальный дашборд (`npm run tui`) на blessed: таблица дел, логи, запуск парсинга
- **Порт** — авто-поиск свободного (проверка занятости + идентификация процесса), результат в `logs/.port`
- **dotenv удалён** — заменён на `process.loadEnvFile()` (0 зависимостей)
- **Пакеты обновлены** — TS 7.0.2, Puppeteer 25.3.0, Vitest 4.1.10, @types/node@24 под Node 24 LTS

### ⏳ Следующие шаги (очередь)
1. **XLSX** — `packages/exporter/xlsx.ts` (низкий приоритет, всё ещё заглушка)
2. **Singleton browser** — кешировать Puppeteer browser/page для magistrate в пределах прогона
3. **Rate-limiting** — `delayBetweenRequestsMs` между запросами к одному суду
4. При необходимости — очистка/архивация старых `data/*.json` вне активного мониторинга
5. При необходимости — уведомления о недоступных судах / stale URL

## watch/ — источник URL

- Любые текстовые файлы, любые расширения, любая вложенность папок
- Нормализатор извлекает ссылки из произвольного текста, включая JSON/CSV
- Разделители: пробелы, табы, переносы, `;`, `|`
- Кавычки и JSON-синтаксис игнорируются
- Если нет `https://` — добавляется автоматически
- Фильтр: только домены `*.sudrf.ru` и `*.msudrf.ru`
- Дубликаты URL — дедупликация через `Set`
- Удаление файла = прекращение мониторинга URL из него
- Если `watch/` пуста или отсутствует — fallback на `urls.txt`

## Two-tier scheduling

```json
"schedule":       "0 8 * * 1,3,5"
"scheduleRetry":  "0 11,14 * * 1,3,5"
"staleThresholdH": 24
```

- `courtflow-parser` — основной прогон, все URL
- `courtflow-parser-retry` — retry-прогон с `--retry`, только stale URL
- Оркестратор строит `lastSuccess` по `run-log-*.json` и фильтрует stale URL

## TUI — терминальный дашборд

`npm run tui` запускает интерактивный дашборд в любом терминале (SSH, Windows Terminal, PowerShell, CMD, VS Code).

Основан на библиотеке **blessed** (0 зависимостей, ~30 KB). Подключается к Express API (`/api/cases`, `/api/logs`, `/api/run` и т.д.).

Три вкладки (Tab) с одинаковым набором операций что и в браузерном UI:
- **Дела** — таблица с поиском (/) и фильтром по типу суда (F), детали по Enter
- **Логи** — лента запусков, переключение дней (D: 1 / 7 / 30)
- **Запуск** — полный прогон (F), retry (R), справочник судов (E), обновление данных (D)

Обновление данных — авторефреш каждые 5 секунд (как в браузерном UI).

Удалённое подключение: `npm run tui -- --api http://192.168.1.5:3000`

### Архитектура TUI

```
packages/cli/
├── client.ts   — ApiClient (fetch-обёртка над REST API, тот же что используют plan CLI-команды)
└── tui.ts      — blessed screen + listtable + клавиатурные сокращения
```

## UI / reconciliation

- `/api/cases` теперь фильтрует данные по активным `courtId` из текущего источника мониторинга
- Исторические JSON в `data/` не удаляются, но не отображаются если суд уже не мониторится
- `/api/active-courts` даёт точный список судов в мониторинге
- `/api/run`, `/api/run/retry`, `/api/run/enrich-courts`, `/api/run/status` используются UI для ручного управления

## Команды

```bash
# Windows / Linux
npm run test:smoke
npm run parse
npm run parse -- --retry
npm test
npm start
npm run tui              # Терминальный дашборд (SSH/терминал)
npm run tui -- --api http://server:3000  # Удалённый TUI
npm run enrich:courts

# Linux / pm2
pm2 start ecosystem.config.cjs
pm2 restart courtflow-parser
pm2 restart courtflow-parser-retry
pm2 logs courtflow-viewer
pm2 status
```

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.


---

## Статус после Code Review #1 (2026-07-07)

**Что закрыто:**
- ✅ TS-компиляция чистая: `decodeEntities` и `CourtType` ошибки устранены (BUG-023, BUG-024)
- ✅ Lock-файл orchestrator устойчив к SIGKILL/OOM (BUG-025)
- ✅ Viewer поддерживает graceful shutdown (BUG-026)
- ✅ Полный ответ на ревю в CODE_REVIEW.md

## Статус после Code Review #2 (2026-07-10)

**Блокеры закрыты:**
- ✅ `courtType: any` → `CourtType` в enrich-courts.ts (B1)
- ✅ Promise.race leak → AbortController в orchestrator.ts (B2)

**Важное закрыто:**
- ✅ Fallback UID из case_id в magistrate.ts (V1)
- ✅ Fallback captcha provider 2captcha в loadCaseHtml (V3)
- ✅ Magistrate тест через cached HTML в smoke.ts (V4)
- ✅ Unit-тесты: `urls.test.ts` — 19 тестов extractUrls/detectCourtType/extractCourtId (V5)

**Техдолг (backlog):**
- Singleton browser для magistrate
- Rate-limiting между запросами
- Обновить exceljs до 4.4.0+ (фикс uuid уязвимости)
- ESLint/Prettier, pino, Zod-валидация конфига
- XLSX exporter (низкий приоритет)
