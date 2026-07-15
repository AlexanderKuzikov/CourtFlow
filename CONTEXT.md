# CourtFlow — CONTEXT

> **Authoritative handoff.** Этот документ является источником фактов для передачи работы между сессиями и моделями. По завершении каждой сессии обновлять: SHA, изменённые файлы, выполненные команды, результаты и следующий шаг. Не объявлять задачу исправленной без реальной проверки.

## Назначение

CourtFlow мониторит судебные дела РФ по URL, парсит карточки `district`, `appeal`, `cassation` и `magistrate`, сохраняет нормализованный JSON и предоставляет web viewer/TUI. Цель — надёжный локальный инструмент Windows/Linux без внешней инфраструктуры.

## Карта кода

| Путь | Роль |
|---|---|
| `packages/core` | типы, конфиг, URL intake, retry, errors, справочник судов, charset detection |
| `packages/adapters` | извлечение `Case` из HTML для каждого типа суда; `shared.ts` — общие утилиты; `registry.ts` — реестр адаптеров |
| `packages/captcha` | RuCaptcha и Puppeteer-session magistrate |
| `packages/scheduler` | orchestration, retry, smoke, enrichment |
| `packages/exporter` | атомарная JSON-запись |
| `packages/viewer` | Express API, static viewer, управление background jobs |
| `packages/cli` | TUI на blessed и typed API client |

## Инварианты

- Секреты остаются в `.env`; `/api/config` возвращает только safe config.
- Выходные JSON и `courts.json` пишутся атомарно: tmp + rename.
- Job одного вида запускается только один раз: отдельные `fullPid`, `retryPid`, `enrichPid`; повтор — HTTP 409.
- Viewer перед shutdown отправляет SIGTERM своим активным children.
- TUI request к API имеет deadline 5 секунд; после destroy TUI не рендерит и не schedule'ит refresh.
- `CaseEvent.judge` — судья на момент события (magistrate: колонка 5). `CaseEvent.note` — примечание (district/appeal/cassation).
- Новые поля конфига получают дефолты (обратная совместимость).
- `softId` RuCaptcha читается из `config.json`, не хардкодится в клиенте.

## Актуальный статус

### Code Review #3

Все пункты Code Review #3 применены:
| ID | Содержание | Статус |
|---|---|---|
| B1 | single-flight `/api/run/enrich-courts` | applied |
| B2 | убрать `(casesList as any).selected` | applied |
| V1 | убрать TUI ApiClient side effect при import | applied |
| V2 | не schedule auto-refresh после TUI destroy | applied |
| V3 | 5 sec API timeout | applied |
| V4 | shutdown child parsers | applied |

### Code Review #4 (2026-07-14, OpenCode Go)

Проведён полный пятиосевой ревью. Найдено и исправлено:

| ID | Содержание | Статус |
|---|---|---|
| BLK-1 | ANSI escape `\\x1b` → `\x1b` в `tui.ts:121` | applied |
| BLK-2 | Startup race в TUI init | applied (existing `destroyed` guard) |
| V-1 | Дупликация `parseDate`/`extractCourtSubdomain`/`parsePublishInfo` → `adapters/shared.ts` | applied |
| V-2 | Дупликация `ADAPTERS`/`detectCharset` → `registry.ts` + export из `courts.ts` | applied |
| V-3 | `softId` в `config.json` вместо хардкода в `rucaptcha.ts` | applied |
| V-4 | Добавлен `requestDelayMs: 500` в `config.json` | applied |
| V-5 | `CaseEvent.judge` — новое поле, magistrate пишет судью в judge, не в note | applied |
| V-6 | Оркестратор: пропуск `withRetry` для magistrate (двойное списание RuCaptcha) | applied |
| V-7 | Задержка `requestDelayMs` между запросами к одному суду | applied |
| S-1 | Удалены пустые файлы `5dc62476d7db80fc.txt`, `c832310624b586cb.txt` | applied |
| S-3 | `hearingDate` fallback на последнюю дату для завершённых дел magistrate | applied |
| S-6 | XLSX stub (`xlsx.ts`) + `exceljs` из deps удалены | applied |
| S-8 | `setInterval` с очисткой в `index.html` | applied |
| — | Puppeteer: `--disable-gpu` в launch args (white window fix) | applied |
| — | Puppeteer: `headless: 'shell'` вместо `true` (старый режим, без белого окна на Windows). `--disable-gpu` и `--disable-software-rasterizer` откачены — вызывали timeout magistrate. | applied |
| — | GitHub Actions CI (`ci.yml`: checkout, install, tsc, test) | applied |

### Bugfix #5 (2026-07-15)

| ID | Содержание | Статус |
|---|---|---|
| MAG-1 | `MagistrateAdapter.card.result` брался из последнего события (`lastResult`), а не из поля «Результат рассмотрения» карточки дела (Tab 0). Для «закрытых» дел в событиях написано «Принято решение: Решение по существу», а суть решения («Иск удовлетворен», «Взыскано…») — в карточке. Исправлено: `rawCard['Результат рассмотрения'] ?? lastResult`. | applied |
| MAG-2 | `hearingDate` добавлен третий fallback на `rawCard['Дело рассмотрено (выдан приказ)']` — дата решения, если нет будущих слушаний и прошлых событий. | applied |
| S-2 | `session.ts` — headless: `'shell'` (старый режим, без белого окна). `--disable-gpu` откачен (вызывал timeout magistrate). | applied |
| CR-5 | `courts.ts` — `fetchCourtDirectoryItem` не работал для magistrate: другая HTML-структура главной (нет `#show`/нет `h5.heading.heading_title`). Исправлено: `span#court_name` для названия, `h2:contains("Адрес") + p` для адреса, сбор телефонов из `.content`. | tsc clean, 35 tests pass |

## Верификация

```bash
npm test          # 2 files, 35 tests — all passed
npx tsc --noEmit  # clean
```

### SHA: `7cb1ac3` (HEAD)

```
7cb1ac3 docs: update HTML_STRUCTURE.md for magistrate card fields
b150ae3 fix(magistrate): result card from Tab 0 not from events
8c3bc1c .
```

## Backlog

### P1

- Integration tests Express endpoints: single-flight, 409, child lifecycle shutdown.
- Заполнить `courts.json` через проверенный `enrich:courts`.

### P2

- Reuse Puppeteer browser/page на один run magistrate.
- Разделить `CaseEvent.note` и `CaseEvent.judge` в district/appeal/cassation событиях (сейчас `judge` всегда null — информация о судье на момент события не извлекается).

### P3

- Решить риск unmaintained `blessed` (замена либо документированный compatibility matrix).
- Убрать блокирующий `execSync` из port diagnostic.
- Не использовать commit messages `.`.

## Журнал работ

| Дата | SHA/артефакт | Изменение | Проверка |
|---|---|---|---|
| 2026-07-10 | Code Review #2 | Исправлены ранние пункты, добавлены URL tests | historical |
| 2026-07-11 | `36dd0bc` | Добавлены TUI и viewer run API | historical |
| 2026-07-13 | `bec8cf8` | Code Review #3 | historical |
| 2026-07-13 | `2492e75` | B1/V3/V4 applied | inspected on GitHub |
| 2026-07-14 | pending commit | Code Review #4: 16 правок (ANSI, shared fns, judge field, softId, delay, CI, xlsx removal, Puppeteer fix) | tsc clean, 35 tests pass |

## Старт следующей сессии

1. Прочитать `CONTEXT.md`, `CODE_REVIEW.md`, `HTML_STRUCTURE.md`, `DECISIONS.md`.
2. Выполнить `git status`, `git log --oneline -20`; записать SHA.
3. Проверить: `npm test`, `npx tsc --noEmit`.
4. Выбрать один backlog item, определить success criteria, сделать минимальную правку, обновить этот журнал.