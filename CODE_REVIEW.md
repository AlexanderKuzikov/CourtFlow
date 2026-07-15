# CourtFlow — Code Review

> **История:**
> - Code Review #1 (2026-07-06, Hermes Agent) — sha `75f3a5c`
> - Code Review #2 (2026-07-10, OpenCode Go) — sha `6f30f81`
> - Code Review #3 (2026-07-13, Perplexity / Claude Sonnet 4.6) — HEAD `36dd0bc`
> - **Code Review #4 (2026-07-14, OpenCode Go / DeepSeek v4)** — HEAD `05fa449`, полный пятиосевой ревью + 16 правок

---

## Code Review #4 (2026-07-14)

**Дата:** 2026-07-14
**Автор:** OpenCode Go (DeepSeek v4 Pro)
**Область:** 22 TS-файлов, 11 md-документов, config, CI, ~5700 строк
**Метод:** построчное чтение всего кода + документации, 5 осей (корректность, читаемость, архитектура, безопасность, производительность)

### Исправлено

| # | Severity | Файл | Описание |
|---|---|---|---|
| BLK-1 | Блокер | `tui.ts:121` | ANSI escape `\\x1b` → `\x1b` (курсор не скрывался) |
| V-1 | Важно | `adapters/shared.ts` (new) | Вынос `parseDate`, `extractCourtSubdomain`, `parsePublishInfo`, `cleanText` из 4 адаптеров |
| V-2 | Важно | `adapters/registry.ts` (new) | Реестр `ADAPTERS`; `detectCharset` экспортирован из `courts.ts` |
| V-3 | Важно | `config.json`, `config.ts`, `rucaptcha.ts`, `session.ts`, `orchestrator.ts` | `softId` перенесён из хардкода в конфиг |
| V-5 | Важно | `types.ts`, `magistrate.ts`, `district.ts`, `appeal.ts`, `cassation.ts` | Поле `CaseEvent.judge`; magistrate пишет судью в `judge`, не в `note` |
| V-6 | Важно | `orchestrator.ts` | Magistrate URL пропускают `withRetry` (двойное списание RuCaptcha) |
| V-7 | Важно | `config.json`, `orchestrator.ts` | `requestDelayMs: 500` + `sleep()` между запросами к одному суду |
| S-1 | Совет | `5dc62476d7db80fc.txt`, `c832310624b586cb.txt` | Удалены пустые артефакты |
| S-3 | Совет | `magistrate.ts` | `hearingDate` fallback на последнюю дату события |
| S-6 | Совет | `xlsx.ts`, `package.json` | XLSX stub + `exceljs` удалены |
| S-8 | Совет | `index.html` | `setInterval` с очисткой при `beforeunload` |
| — | — | `session.ts` | `--disable-gpu` в Puppeteer args (white window на Windows) |
| — | — | `session.ts` | `--disable-gpu` в Puppeteer args (white window). Позже откачен — вызывал timeout на Windows. Заменён на `headless: 'shell'`. |
| — | — | `.github/workflows/ci.yml` (new) | CI: checkout + Node 24 + npm ci + tsc + vitest |
| — | — | `smoke.ts`, `orchestrator.ts` | Убраны дупликаты `ADAPTERS` и `detectCharset` |

### Верификация

- `npx tsc --noEmit` — чисто
- `npm test` — 35/35 passed (2 test files, 388ms)

### Осталось в backlog (P1—P3)

См. `CONTEXT.md` Backlog.

---

## Code Review #3 (2026-07-13)

---

## Что изменилось с Code Review #2

**Новое с 2026-07-10:**
- ✅ Добавлен `packages/cli/` — новый пакет: `tui.ts` (TUI-дашборд на `blessed`) + `client.ts` (HTTP-клиент)
- ✅ Добавлен `packages/cli/tui.test.ts` — 170 строк unit-тестов (mock blessed + 9 describe-блоков)
- ✅ `packages/viewer/server.ts` — существенно расширен: `/api/run/retry`, авто-поиск свободного порта, `logs/.port`, `identifyProcess()`
- ✅ `package.json` — добавлены `blessed`, `@types/blessed`, скрипт `tui`
- ✅ `CONTEXT.md`, `DECISIONS.md`, `PROMPT_FOR_NEW_SESSION.md` — обновлены под новую архитектуру
- ✅ `LINUX_DEPLOY.md` — расширен (+34 строки)
- ⚠️ Все коммиты с 2026-07-10 имеют сообщение «.» — нечитаемая история

---

## Executive Summary

| Категория | Статус | Комментарий |
|----------|--------|-------------|
| **Архитектура** | ✅ Отличная | +cli пакет органично вписался. Модульность сохранена |
| **TUI (tui.ts)** | ⚠️ Хорошо | Работающий blessed-дашборд, но ряд архитектурных проблем |
| **Тесты** | ✅ Есть | `urls.test.ts` (19) + `tui.test.ts` (170 строк) — прогресс |
| **TypeScript** | ✅ Хорошо | `any` в `tui.ts:267` — единственное место |
| **Безопасность** | ✅ Хорошо | SafeAppConfig сохранён, `.env` в gitignore |
| **Зависимости** | ⚠️ +1 prod dep | `blessed` — unmaintained с 2015 (последний релиз), 0 обновлений |
| **server.ts** | ⚠️ Важно | `spawnOrchestrator` — нет limit на параллельные enrich-courts |
| **Документация** | ✅ Обновлена | CONTEXT, DECISIONS, PROMPT обновлены под TUI |

---

## 🔴 Блокеры

### B1. `server.ts` — `/api/run/enrich-courts` запускает неограниченное число процессов

**Файл:** `packages/viewer/server.ts:195-202`
```typescript
app.post('/api/run/enrich-courts', (_req, res) => {
  const child = spawn(process.execPath, [...], { ... });
  res.json({ started: true, pid: child.pid ?? null });
});
```
В отличие от `/api/run` и `/api/run/retry`, здесь **нет guard на повторный запуск**. Каждый POST создаёт новый дочерний процесс. При быстром нажатии `E` в TUI или несколько раз из curl — запустятся несколько `enrich-courts.ts` параллельно. Это безопасно только если `enrich-courts` идемпотентен при параллельном файловом доступе, но `courts.ts` использует `.tmp`-файл — параллельное исполнение вызовет race condition на файле.

**Фикс:**
```typescript
let enrichPid: number | null = null;

app.post('/api/run/enrich-courts', (_req, res) => {
  if (enrichPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: enrichPid });
  const child = spawn(...);
  enrichPid = child.pid ?? null;
  child.on('close', () => { enrichPid = null; });
  res.json({ started: true, pid: enrichPid });
});
```

### B2. `tui.ts:267` — `(casesList as any).selected`

**Файл:** `packages/cli/tui.ts:267`
```typescript
const prevSelected = (casesList as any).selected ?? selectedCaseIdx;
```
`blessed.list` имеет `selected: number` в `@types/blessed`. Это `as any` обходит типизацию намеренно или по незнанию. Если `@types/blessed` не экспортирует `selected` — нужно объявить локальный тип:

```typescript
const prevSelected = (casesList as blessed.Widgets.ListElement & { selected: number }).selected ?? selectedCaseIdx;
```
Или использовать `selectedCaseIdx` напрямую — он уже синхронизирован через `'select item'`.

---

## ⚠️ Важно

### V1. `tui.ts` — module-level side effects при импорте в тестах

**Файл:** `packages/cli/tui.ts:9-10`, `tui.test.ts:44`
```typescript
const apiUrl = parseApiUrl(process.argv);
const api = new ApiClient(apiUrl);
```
Эти строки выполняются при `import './tui.js'` в тесте. Проблема сейчас скрыта за `VITEST`-guard на `init()`:
```typescript
if (!process.env.VITEST) { init()... }
```
Но `readDefaultApiUrl()` в `client.ts` читает `logs/.port` и `config.json` с диска при импорте — это I/O в test environment. Если файлы отсутствуют, падает с исключением (try/catch есть, но возвращает `localhost:8791`). При добавлении тестов, требующих `ApiClient`, поведение непредсказуемо.

**Рекомендация:** Переместить `const api = new ApiClient(apiUrl)` внутрь `init()`. Утилитарные функции (`formatCaseItem`, `esc` и т.д.) экспортировать без зависимости от `api`.

### V2. `tui.ts` — `autoRefresh` не останавливается корректно при закрытии detail

**Файл:** `packages/cli/tui.ts:152-162`
```typescript
async function autoRefresh(): Promise<void> {
  if (refreshing || detailBox.visible || searchActive) {
    refreshTimer = setTimeout(autoRefresh, 5000);
    return;
  }
  ...
  refreshTimer = setTimeout(autoRefresh, 5000);
}
```
При `q`/`Ctrl+C` вызывается `clearTimeout(refreshTimer)`. Но если `autoRefresh` уже в `await Promise.all(...)` — очистка не работает, промисы не отменяются. После `screen.destroy()` `loadCases()` вызовет `screen.render()` на уничтоженном экране → unhandled error.

**Фикс:** Добавить `AbortController` или флаг `destroyed`:
```typescript
let destroyed = false;

screen.key(['q', 'C-c'], () => {
  destroyed = true;
  ...
});

async function autoRefresh() {
  if (destroyed) return;
  ...
  if (!destroyed) refreshTimer = setTimeout(autoRefresh, 5000);
}
```

### V3. `client.ts` — нет timeout на fetch-запросы

**Файл:** `packages/cli/client.ts:37-42`
```typescript
private async get<T>(path: string): Promise<T> {
  const res = await fetch(`${this.baseUrl}${path}`);
  ...
}
```
Если сервер недоступен, Node fetch зависает на несколько минут (системный TCP timeout). TUI будет «заморожен» на время авто-рефреша. В классе нет `AbortSignal.timeout()`.

**Фикс:**
```typescript
const res = await fetch(`${this.baseUrl}${path}`, {
  signal: AbortSignal.timeout(5000),
});
```

### V4. `server.ts` — `spawn` с `detached: false` + нет обработки `SIGTERM` для дочерних процессов

**Файл:** `packages/viewer/server.ts:176-180`
При `shutdown()` → `serverInstance.close()` → `process.exit(0)` дочерние процессы (`fullPid`, `retryPid`) **не завершаются**. Они продолжат работу как orphan-процессы. На Linux с PM2 это особенно критично — `pm2 restart` не убьёт orphan-parserы.

**Фикс:**
```typescript
function shutdown(signal: string) {
  if (fullPid)  { try { process.kill(fullPid,  'SIGTERM'); } catch {} }
  if (retryPid) { try { process.kill(retryPid, 'SIGTERM'); } catch {} }
  serverInstance.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
```

### V5. `tui.test.ts` — тест `formatCaseItem` не проверяет `courts`-маппинг

**Файл:** `packages/cli/tui.test.ts:100-115`
`formatCaseItem` зависит от module-level переменной `courts: Record<string, ...>`. В тесте `courts = {}`, поэтому тест всегда проверяет fallback (`c.court` вместо `shortName`). Тест не гарантирует, что колонка «Суд» показывает название, когда `courts` заполнен.

**Рекомендация:** Добавить кейс с предварительно заполненным `courts`:
```typescript
// В tui.test.ts нет доступа к модульному courts — нужен отдельный экспорт или фабричная функция
// Либо рефакторинг formatCaseItem в чистую функцию: formatCaseItem(c, courts)
```

---

## 💡 Советы

### S1. `tui.ts` — `blessed` не поддерживается с 2015

`blessed` — пакет с последним релизом в 2015 году, 0 merge за последние годы. На Node 22+ есть известные проблемы с raw mode. Альтернативы: `neo-blessed` (форк с поддержкой), `ink` (React для терминала), `@clack/prompts`. Для production-deployment это технический долг.

### S2. `tui.ts:getSep()` — вызывается до `screen` создан при импорте в тестах

```typescript
export const COL = { ... };
const sep = getSep();  // здесь — screen уже инициализирован выше по файлу
```
`getSep()` читает `screen.fullUnicode`. В тестах `screen` — мок, и `fullUnicode: true` захардкожен в моке. Это работает, но хрупко. Лучше передавать `fullUnicode` параметром или вычислять `sep` внутри `formatCaseItem`.

### S3. `server.ts:identifyProcess()` — `execSync` в async context

`identifyProcess()` вызывается из async `findPort()`, но является синхронным. `execSync` блокирует event loop на время выполнения `netstat`/`lsof` (может быть 100-500ms). Для production-сервера — замерзание event loop.

**Рекомендация:** Либо `execFileAsync`, либо просто убрать — это debugging-only информация.

### S4. `tui.ts` — нет обработки ошибок в `enrichCourts()`

```typescript
async function enrichCourts(): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/run/enrich-courts`, { method: 'POST' });
    if (res.ok) { ... }
  } catch { ... }
}
```
Использует `fetch` напрямую вместо `api.post()`. Нет timeout. Дублирует логику `ApiClient`. Следует переиспользовать `api`.

### S5. `package.json` — `blessed` в `dependencies`, не `devDependencies`

`blessed` нужен только для `npm run tui` — интерактивного использования. На headless-сервере TUI не запускается. Оставлять его в `dependencies` означает, что `npm ci --omit=dev` всё равно установит Puppeteer + blessed. Если `tui` — опциональный инструмент, стоит рассмотреть `optionalDependencies` или вынести в отдельный workspace.

### S6. Backlog из Code Review #2 — не изменилось

| Пункт | Статус |
|-------|--------|
| **S3** — parse timeout в `config.json` | ⏳ Не сделано |
| **S6** — XLSX stub | ⏳ Не сделано |
| **V2** — singleton browser для magistrate | ⏳ Не сделано |
| **S7** — rate-limiting между запросами | ⏳ Не сделано |
| **S1** — поле `note` → `judge` в `CaseEvent` | ⏳ Не сделано |
| **S5** — запустить `enrich:courts` | ⏳ `courts.json` всё ещё `{}` |
| **S8** — разбить `index.html` | ⏳ Не сделано |

### S7. Commit messages — нечитаемая история

Все 7 коммитов с 2026-07-10 по 2026-07-11 имеют сообщение «.». После рефреш-сессии, когда работа активная, это не критично — но в git log и в PR-описаниях это делает историю непригодной для анализа регрессий.

---

## ✅ Что хорошо в Code Review #3

| Аспект | Детали |
|--------|--------|
| **TUI архитектура** | Чёткое разделение: `tui.ts` (UI-логика) / `client.ts` (HTTP) / `server.ts` (API) |
| **blessed mock в тестах** | Корректный подход: полный мок blessed, тестирование только чистых функций |
| **ApiClient** | Типизированный HTTP-клиент, все endpoints, `parseApiUrl` из argv |
| **Авто-порт** | `findPort()` + `logs/.port` — элегантное решение для локального TUI |
| **VITEST guard** | `if (!process.env.VITEST) { init() }` — правильная изоляция I/O от тестов |
| **Auto-refresh** | 5-секундный поллинг с паузой при detail/search — UX-продуманно |
| **`/api/run/status`** | Раздельный статус `full`/`retry` с PID — позволяет TUI корректно отображать состояние |
| **Retry mode** | `spawnOrchestrator(['--retry'])` + `/api/run/retry` — чистое расширение без дублирования |

---

## 📋 Checklist по файлам (полный, обновлён)

| Файл | Статус | Заметки |
|------|--------|---------|
| `packages/core/types.ts` | ✅ | Без изменений |
| `packages/core/config.ts` | ⚠️ | Мутация JSON-объекта (S4 из #2). Нет Zod-валидации |
| `packages/core/urls.ts` | ✅ | Без изменений |
| `packages/core/urls.test.ts` | ✅ | 19 тестов |
| `packages/core/errors.ts` | ✅ | Без изменений |
| `packages/core/retry.ts` | ✅ | Без изменений |
| `packages/core/courts.ts` | ✅ | Без изменений |
| `packages/adapters/district.ts` | ✅ | Без изменений |
| `packages/adapters/appeal.ts` | ✅ | Без изменений |
| `packages/adapters/cassation.ts` | ✅ | Без изменений |
| `packages/adapters/magistrate.ts` | ✅ | Без изменений |
| `packages/captcha/rucaptcha.ts` | ✅ | Без изменений |
| `packages/captcha/session.ts` | ⚠️ | Новый браузер на каждое дело (из #2, backlog) |
| `packages/scheduler/orchestrator.ts` | ✅ | Без изменений с #2 |
| `packages/scheduler/smoke.ts` | ✅ | Без изменений с #2 |
| `packages/scheduler/enrich-courts.ts` | ✅ | Без изменений с #2 |
| `packages/exporter/json.ts` | ✅ | Без изменений |
| `packages/exporter/xlsx.ts` | ❌ | Заглушка (backlog) |
| `packages/viewer/server.ts` | ⚠️ | B1 (enrich guard), V4 (orphan children) |
| `packages/cli/tui.ts` | ⚠️ | B2 (as any), V1 (side effects), V2 (destroy race) |
| `packages/cli/client.ts` | ⚠️ | V3 (нет fetch timeout) |
| `packages/cli/tui.test.ts` | ✅ | 170 строк, 9 describe-блоков, хороший mock |

---

## 🔧 План действий

### Приоритет 1 — Блокеры (новые)
1. **B1** — guard на повторный запуск `/api/run/enrich-courts` в `server.ts`
2. **B2** — убрать `as any` в `tui.ts:267` → правильный тип или `selectedCaseIdx`

### Приоритет 2 — Важно (новые)
3. **V1** — вынести `const api = new ApiClient(...)` в `init()`, изолировать от import side effects
4. **V2** — добавить `destroyed`-флаг для корректного завершения `autoRefresh`
5. **V3** — добавить `AbortSignal.timeout(5000)` в `ApiClient.get/post`
6. **V4** — в `shutdown()` посылать `SIGTERM` дочерним процессам перед `process.exit`

### Приоритет 3 — Советы (backlog)
7. **S3** — вынести `execSync` из `identifyProcess` или сделать async
8. **S4** — заменить прямой `fetch` в `enrichCourts()` на `api.post()`
9. **S5** — рассмотреть `optionalDependencies` для `blessed`
10. **S6** — см. backlog из Code Review #2 (XLSX, singleton browser, rate-limit, note→judge)

---

## 📊 Метрики репозитория (2026-07-13)

| Метрика | #2 (2026-07-10) | #3 (2026-07-13) | Δ |
|---------|-----------------|-----------------|---|
| TypeScript файлов | 18 | 20 | +2 |
| Строк кода (packages/) | ~4 250 | ~5 700 | +1 450 |
| Зависимостей (prod) | 6 | 7 | +1 (blessed) |
| Зависимостей (dev) | 5 | 6 | +1 (@types/blessed) |
| Тестовых файлов | 1 | 2 | +1 |
| Тестов (строк) | 19 | 19 + 170 | +170 |
| Коммитов (main) | 41 | 48 | +7 |
| Документационных файлов | 8 | 9 | +1 (DECISIONS.md) |
| Блокеров | 0 | 2 | +2 (новые) |
| Важных | 0 | 4 | +4 (новые) |

---

## 🔄 Сравнение code review #1 / #2 / #3

| Пункт | #1 | #2 | #3 |
|---|---|---|---|
| decodeEntities | ✅ | ✅ | ✅ |
| CourtType / any | ✅ | ✅ | ⚠️ new (tui.ts B2) |
| Stale lock | ✅ | ✅ | ✅ |
| Graceful shutdown | ✅ | ✅ | ⚠️ orphan children (V4) |
| uuid vuln | ⏳ | ⏳ | ⏳ |
| XLSX exporter | ❌ | ❌ | ❌ |
| Тесты | ❌ | ✅ 19 | ✅ 189+ |
| Fallback captcha | ✅ | ✅ | ✅ |
| Singleton browser | ⏳ | ⏳ | ⏳ |
| Rate-limiting | — | ⏳ | ⏳ |
| enrich-courts guard | — | — | ❌ new (B1) |
| fetch timeout в TUI | — | — | ❌ new (V3) |
| autoRefresh destroy race | — | — | ❌ new (V2) |
| Commit messages | — | — | ⚠️ «.» x7 |
