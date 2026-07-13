# CourtFlow — CONTEXT

> **Authoritative handoff.** Этот документ является источником фактов для передачи работы между сессиями и моделями. По завершении каждой сессии обновлять: SHA, изменённые файлы, выполненные команды, результаты и следующий шаг. Не объявлять задачу исправленной без реальной проверки.

## Назначение

CourtFlow мониторит судебные дела РФ по URL, парсит карточки `district`, `appeal`, `cassation` и `magistrate`, сохраняет нормализованный JSON и предоставляет web viewer/TUI. Цель — надёжный локальный инструмент Windows/Linux без внешней инфраструктуры.

## Карта кода

| Путь | Роль |
|---|---|
| `packages/core` | типы, конфиг, URL intake, retry, errors, справочник судов |
| `packages/adapters` | извлечение `Case` из HTML для каждого типа суда |
| `packages/captcha` | RuCaptcha и Puppeteer-session magistrate |
| `packages/scheduler` | orchestration, retry, smoke, enrichment |
| `packages/exporter` | атомарная JSON-запись; XLSX — нерешённый stub |
| `packages/viewer` | Express API, static viewer, управление background jobs |
| `packages/cli` | TUI на blessed и typed API client |

## Инварианты

- Секреты остаются в `.env`; `/api/config` возвращает только safe config.
- Выходные JSON и `courts.json` пишутся атомарно: tmp + rename.
- Job одного вида запускается только один раз: отдельные `fullPid`, `retryPid`, `enrichPid`; повтор — HTTP 409.
- Viewer перед shutdown отправляет SIGTERM своим активным children.
- TUI request к API имеет deadline 5 секунд; после destroy TUI не рендерит и не schedule'ит refresh.
- Не совмещать parser fix с широким UI/refactor изменением.

## Актуальный статус

### Известный HEAD

- До ручной замены файлов: `2492e75` на `main`.
- На этом HEAD **применены** B1/V3/V4: guard enrichment, timeout ApiClient, SIGTERM child jobs.
- На этом HEAD **не применены** B2/V1/V2: изменения `packages/cli/tui.ts`.
- Этот полный файл `packages/cli/tui.ts` закрывает B2/V1/V2 и переводит TUI enrichment на `ApiClient.enrichCourts()`.
- После замены файла обязательно записать реальный новый SHA и результаты в журнал ниже.

### Code Review #3

| ID | Содержание | Статус до замены `tui.ts` |
|---|---|---|
| B1 | single-flight `/api/run/enrich-courts` | applied |
| B2 | убрать `(casesList as any).selected` | pending |
| V1 | убрать TUI ApiClient side effect при import | pending |
| V2 | не schedule auto-refresh после TUI destroy | pending |
| V3 | 5 sec API timeout | applied |
| V4 | shutdown child parsers | applied |

## Верификация после замены

```bash
npm test
npx tsc --noEmit
```

Минимальная ручная проверка:

1. Второй `POST /api/run/enrich-courts` до завершения первого возвращает HTTP 409.
2. При SIGTERM/SIGINT viewer не оставляет full/retry/enrich children.
3. При выключенном viewer TUI сообщает о connection error не позднее пяти секунд.
4. При выходе (`q`) во время refresh нет `unhandledRejection` и повторного render.
5. В TUI, вкладка Run, клавиша `E` вызывает API client и корректно отображает 409/error.

## Backlog

### P1

- Integration tests Express endpoints: single-flight, 409, child lifecycle shutdown.
- CI: `npm ci`, `npm test`, `npx tsc --noEmit`.
- Реализовать XLSX exporter или удалить публичный `exportXlsx` stub.

### P2

- Reuse Puppeteer browser/page на один run magistrate.
- Parse timeout и межзапросный delay — в config.
- Заполнить `courts.json` через проверенный `enrich:courts`.
- Разделить `CaseEvent.note` и judge с migration strategy.

### P3

- Решить риск unmaintained `blessed` (замена либо документированный compatibility matrix).
- Убрать блокирующий `execSync` из port diagnostic.
- Не использовать commit messages `.`.

## Журнал работ

| Дата | SHA/артефакт | Изменение | Проверка |
|---|---|---|---|
| 2026-07-10 | Code Review #2 | Исправлены ранние пункты, добавлены URL tests | historical |
| 2026-07-11 | `36dd0bc` | Добавлены TUI и viewer run API | historical |
| 2026-07-13 | `bec8cf8` | В репозиторий добавлен Code Review #3 | historical |
| 2026-07-13 | `2492e75` | B1/V3/V4 вручную применены; `tui.ts` остался старым | inspected on GitHub |
| 2026-07-13 | full `tui.ts` + this file | Подготовлена полная замена TUI и синхронизация статуса | pending application |

## Старт следующей сессии

1. Прочитать `CONTEXT.md`, `CODE_REVIEW.md`, `DECISIONS.md`.
2. Выполнить `git status`, `git log --oneline -20`; записать SHA.
3. Проверить фактическое наличие `enrichPid`, `AbortSignal.timeout`, `destroyed`, lazy `ApiClient` init.
4. Выполнить весь раздел «Верификация» и записать exact results.
5. Выбрать один backlog item, определить success criteria, сделать минимальную правку, обновить этот журнал.
