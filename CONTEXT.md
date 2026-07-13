# CourtFlow — CONTEXT

> Authoritative handoff для переключения между сессиями и моделями. После каждой рабочей сессии обновлять этот файл фактами: SHA, изменённые файлы, команды и результаты. Не писать «исправлено» без фактической верификации.

## Цель

CourtFlow мониторит карточки судебных дел РФ по URL, парсит четыре типа судов (`district`, `appeal`, `cassation`, `magistrate`), сохраняет нормализованный JSON и показывает результат через Express viewer и TUI.

## Архитектура

| Пакет | Ответственность |
|---|---|
| `core` | конфиг, типы, URL intake, retry, ошибки, courts directory |
| `adapters` | HTML -> `Case` по типам судов |
| `captcha` | RuCaptcha и Puppeteer path magistrate |
| `scheduler` | orchestration, retry, smoke, court enrichment |
| `exporter` | атомарная JSON-запись; XLSX пока stub |
| `viewer` | Express API, static web UI, запуск background jobs |
| `cli` | blessed TUI и typed HTTP ApiClient |

## Инварианты

- API никогда не возвращает API keys; только `SafeAppConfig`.
- JSON и `courts.json` пишутся через tmp + rename.
- Background jobs single-flight: full, retry, enrich — по одному процессу каждого типа.
- Viewer shutdown завершает дочерние jobs SIGTERM до process exit.
- Любой запрос TUI к viewer ограничен 5 секундами.
- TUI после destroy не назначает следующий refresh и не рендерится.
- Парсерные изменения не совмещать с широким UI/refactor изменением.

## Состояние

### База

- Последний известный SHA перед ручным fix pack: `bec8cf855af74e3d45806e6ddc01e81403cd6b2a`.
- Code Review #3 описывает B1/B2/V1–V4, появившиеся после добавления `packages/cli`.
- Файлы в данном пакете подготовлены для полной замены `packages/cli/client.ts`, `packages/viewer/server.ts` и `CONTEXT.md`.
- `tui.ts` нужно заменить только при наличии полного файла из репозитория: обязательные изменения перечислены в разделе ниже. Не затирать TUI неполным файлом.

### Закрываемые дефекты

| ID | Изменение |
|---|---|
| B1 | `enrichPid` guard в viewer, HTTP 409 при повторном запуске enrichment |
| V3 | `AbortSignal.timeout(5000)` и проверка HTTP-status в ApiClient |
| V4 | SIGTERM child PID при shutdown viewer |
| B2 | В TUI использовать `selectedCaseIdx`, не `(casesList as any).selected` |
| V1 | В TUI создавать `ApiClient` внутри `init()`, не при import |
| V2 | В TUI добавить `destroyed` flag в auto-refresh и exit handler |

## TUI: точные изменения

В `packages/cli/tui.ts`:

```ts
let apiUrl = '';
let api!: ApiClient;
let destroyed = false;
```

Заменить `const prevSelected = (casesList as any).selected ?? selectedCaseIdx;` на `const prevSelected = selectedCaseIdx;`.

В начале `autoRefresh()` добавить `if (destroyed) return;`; перед каждым `setTimeout(autoRefresh, 5000)` проверять `if (!destroyed)`.

В exit handler до `clearTimeout` добавить `destroyed = true;`.

В `init()` до использования API добавить:

```ts
apiUrl = parseApiUrl(process.argv);
api = new ApiClient(apiUrl);
```

В `enrichCourts()` заменить голый fetch на `await api.enrichCourts()`.

## Проверка

```bash
npm test
npx tsc --noEmit
```

Ручная проверка:

- Второй POST `/api/run/enrich-courts` до завершения первого должен вернуть 409.
- При остановке viewer активные child parser/enrich PID не остаются в системе.
- При недоступном viewer TUI сообщает ошибку не дольше 5 секунд.
- Выход из TUI во время refresh не даёт unhandled rejection.

## Backlog

### P1

- Integration tests для viewer endpoints и lifecycle child processes.
- CI: `npm ci`, `npm test`, `npx tsc --noEmit`.
- XLSX: реализовать либо убрать флаг/заглушку.

### P2

- Reuse Puppeteer browser/page на один scheduler run.
- Parse timeout и request delay вынести в config.
- Заполнить и закоммитить проверенный `courts.json`.
- Разделить `CaseEvent.note` и judge после миграции контракта.

### P3

- Заменить либо формально принять риск unmaintained `blessed`.
- Убрать sync `execSync` из диагностики занятого порта.
- Нормальные commit messages вместо `.`.

## Журнал

| Дата | SHA/артефакт | Факт |
|---|---|---|
| 2026-07-10 | Code Review #2 | Закрыты ранние review-пункты, добавлены url tests |
| 2026-07-11 | `36dd0bc` | Добавлены TUI и viewer run API |
| 2026-07-13 | `bec8cf8` | Обновлён Code Review #3 |
| 2026-07-13 | manual full-files pack | Подготовлены полные `client.ts`, `server.ts`, `CONTEXT.md`; требуется применить и проверить |

## Старт следующей сессии

1. Прочитать этот файл, `CODE_REVIEW.md`, `DECISIONS.md`.
2. Выполнить `git status`, `git log --oneline -20`, зафиксировать SHA.
3. Проверить наличие `enrichPid`, `AbortSignal.timeout`, SIGTERM child shutdown.
4. Выполнить verification выше и записать реальные результаты в журнал.
5. Брать один backlog item за раз; сначала success criteria, затем минимальный patch, потом документация.
