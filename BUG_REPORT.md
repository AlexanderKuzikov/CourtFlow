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
| BUG-010 | Нет различения капча/503 | 🟢 | Средний |
| BUG-011 | node-fetch ESM + Windows | 🟢 | Средний |
| BUG-012 | charset автоопределение | 🟢 | Средний |
| BUG-013 | Кодировка smoke-лога на Windows | 🟢 | Низкий |
| BUG-014 | `Cannot GET /` — неверный путь к static на Windows | 🟢 | Высокий |
| BUG-015 | Нет справочника судов с контактами | 🟢 | Средний |
| BUG-016 | Нет автоматического прохождения капчи для msudrf.ru | 🟢 | Высокий |
| BUG-017 | MagistrateAdapter: uid=case_id, events 4 колонки, нет filingDate/result | 🟢 | Средний |
| BUG-018 | `response.buffer()` удалён в Puppeteer v22+ | 🟢 | Высокий |
| BUG-019 | `solver.ts` — нереализованная заглушка | 🟢 | Низкий |
| BUG-020 | `ERR_CERT_COMMON_NAME_INVALID` в Puppeteer headless | 🟢 | Высокий |
| BUG-021 | TS2503 `Cannot find namespace 'puppeteer'` в session.ts | 🟢 | Средний |
| BUG-022 | TS2339 `Property 'getAttribute' does not exist on type 'Locator'` | 🟢 | Средний |
| BUG-023 | `decodeEntities` TS2353 в адаптерах | 🟢 | Средний |
| BUG-024 | `CourtType` assignability в orchestrator.ts | 🟢 | Средний |
| BUG-025 | Stale lock после SIGKILL/OOM | 🟢 | Высокий |
| BUG-026 | Viewer не поддерживал graceful shutdown | 🟢 | Средний |
| BUG-027 | ANSI escape `\\x1b` в TUI — курсор не скрывался | 🟢 | Средний |
| BUG-028 | XLSX stub `exportXlsx` бросал исключение; `exceljs` не использовался | 🟢 | Низкий |
| BUG-029 | `CaseEvent.note` использовался как judge в magistrate | 🟢 | Средний |
| BUG-030 | `withRetry` для magistrate → двойное списание RuCaptcha | 🟢 | Средний |
| BUG-031 | `softId: '3898'` хардкод в `rucaptcha.ts` | 🟢 | Низкий |
| BUG-032 | Пустые файлы `5dc62476d7db80fc.txt`, `c832310624b586cb.txt` в корне | 🟢 | Низкий |
| BUG-033 | `setInterval` без очистки в `index.html` | 🟢 | Низкий |
| BUG-034 | `--disable-gpu` + `--disable-software-rasterizer` → magistrate timeout 30s | 🟢 | Высокий |
| BUG-035 | Белое окно Puppeteer на Windows (new headless GPU-артефакт) | 🟢 | Средний |

---

### BUG-019 🟢 `solver.ts` — нереализованная заглушка
**Исправлено:** файл удалён (2026-07-06). Реальная логика решения капчи — в `captcha/rucaptcha.ts` + `captcha/session.ts`.

### BUG-022 🟢 TS2339 `Locator.getAttribute` не существует
**Исправлено:** заменено на `page.$eval('form#kcaptchaForm img', (img: HTMLImageElement) => img.getAttribute('src'))`.

### BUG-021 🟢 TS2503 `Cannot find namespace 'puppeteer'`
**Исправлено:** `import puppeteer, { type Page } from 'puppeteer'`.

### BUG-020 🟢 `ERR_CERT_COMMON_NAME_INVALID` в Puppeteer headless
**Причина:** wildcard `*.msudrf.ru` не покрывает домены вида `35.perm.msudrf.ru`. Chromium строго отклоняет такой сертификат.
**Исправлено:** добавлен флаг `--ignore-certificate-errors` в args Puppeteer launch в `session.ts`.

### BUG-018 🟢 `response.buffer()` удалён в Puppeteer v22+
**Исправлено:** `page.evaluate(fetch, { credentials: 'include' })`.

### BUG-017 🟢 MagistrateAdapter: некорректный uid, 4 колонки событий, нет дат
**Исправлено:** uid=caseNumber из `<h2>`, 5 колонок, filingDate/hearingDate/result.

### BUG-016 🟢 Magistrate end-to-end
**Закрыт:** 12/12 дел `success: true` на 8 участках.

### BUG-010 🟢 Капча не различалась от FAIL
**Исправлено:** `CaptchaRequiredError`, `isCaptchaPage`, `[CAPTCHA]` в оркестраторе.


### BUG-023 🟢 `decodeEntities` TS2353 в адаптерах
**Файлы:** `packages/adapters/appeal.ts`, `cassation.ts`, `district.ts`, `magistrate.ts`, `packages/core/courts.ts`
**Причина:** cheerio 1.x удалил опцию `decodeEntities` из `CheerioOptions`, `tsc --noEmit` падал с TS2353.
**Исправлено:** убран второй аргумент `{ decodeEntities: false }` из всех вызовов `cheerio.load()` — false является дефолтом в v1. **Источник:** CODE_REVIEW.md пункт 1.

### BUG-024 🟢 `CourtType` assignability в orchestrator.ts
**Файл:** `packages/scheduler/orchestrator.ts`
**Причина:** `ADAPTERS` и `courtGroups` использовали `string` вместо union `CourtType`, `tsc --noEmit` падал с TS2322.
**Исправлено:** `ADAPTERS: Record<CourtType, CourtAdapter>`, `courtGroups: Map<string, { type: CourtType; urls: string[] }>`, `loadCaseHtml(..., courtType: CourtType)`, `CourtType` добавлен в импорт. **Источник:** CODE_REVIEW.md пункт 2.

### BUG-025 🟢 Stale lock после SIGKILL/OOM
**Файл:** `packages/scheduler/orchestrator.ts`
**Причина:** `unlinkSync(lockPath)` вызывался только в `finally`. При жёстком завершении (SIGKILL, OOM) lock оставался навсегда, блокируя все последующие запуски.
**Исправлено:** добавлена `isProcessAlive(pid)` через `process.kill(pid, 0)` и `acquireLock()`: stale lock (мёртвый PID) перезаписывается, живой процесс блокирует как прежде. **Источник:** CODE_REVIEW.md пункт 6.

### BUG-026 🟢 Viewer не поддерживал graceful shutdown
**Файл:** `packages/viewer/server.ts`
**Причина:** pm2 отправляет SIGTERM при `restart`/`stop`. Express-процесс завершался без `server.close()`, обрубая активные соединения.
**Исправлено:** добавлены обработчики `SIGTERM`/`SIGINT` с `serverInstance.close()` и fallback force-exit через 5 секунд. **Источник:** CODE_REVIEW.md пункт 15.

### BUG-027 🟢 ANSI escape `\\x1b` в TUI — курсор не скрывался
**Файл:** `packages/cli/tui.ts:121`
**Причина:** двойной бэкслэш в JS-строке экранирует `\x` → литерал `\x1b`, а не ESC-символ. Курсор оставался видимым в TUI.
**Исправлено:** `\\x1b` → `\x1b`. **Источник:** Code Review #4, BLK-1.

### BUG-028 🟢 XLSX stub и неиспользуемый exceljs
**Файлы:** `packages/exporter/xlsx.ts`, `package.json`
**Причина:** `exportXlsx` бросал исключение, `exceljs` (~4.4 MB) тянулся без использования. В `config.json` `"exportXlsx": false` — фича никогда не работала.
**Исправлено:** `xlsx.ts` удалён, `exceljs` убран из `dependencies`. **Источник:** Code Review #4, S-6.

### BUG-029 🟢 `CaseEvent.note` использовался как judge в magistrate
**Файлы:** `packages/core/types.ts`, `packages/adapters/magistrate.ts`, `district.ts`, `appeal.ts`, `cassation.ts`
**Причина:** в magistrate колонка 5 — «Судья», но данные писались в поле `note`. В district/appeal/cassation `note` — это «примечание» (колонка 7). Семантика поля разная.
**Исправлено:** добавлено поле `CaseEvent.judge`. Magistrate пишет в `judge`, `note` = null. District/appeal/cassation: `judge` = null, `note` — примечание. **Источник:** Code Review #4, V-5.

### BUG-030 🟢 `withRetry` для magistrate → двойное списание RuCaptcha
**Файл:** `packages/scheduler/orchestrator.ts`
**Причина:** `withRetry` оборачивал весь `loadCaseHtml`, включая captcha-решение. При неудаче капчи retry запускал новый браузер → новый fetch капчи → новый вызов RuCaptcha API → двойное списание.
**Исправлено:** для `courtType === 'magistrate'` `loadCaseHtml` вызывается напрямую, без `withRetry`. Fallback-провайдер внутри `loadCaseHtml` остаётся. **Источник:** Code Review #4, V-6.

### BUG-031 🟢 Хардкод `softId: '3898'` в RuCaptcha client
**Файл:** `packages/captcha/rucaptcha.ts:45`
**Причина:** ID разработчика был зашит в коде. При смене ключа или разработчика требовалось менять код.
**Исправлено:** `softId` вынесен в `config.json` → `captcha.softId`, передаётся через `MagistrateSessionOptions`. **Источник:** Code Review #4, V-3.

### BUG-032 🟢 Пустые файлы-артефакты в корне
**Файлы:** `5dc62476d7db80fc.txt`, `c832310624b586cb.txt`
**Причина:** неизвестное происхождение, оба пустые. Загрязняют рабочую директорию.
**Исправлено:** удалены. **Источник:** Code Review #4, S-1.

### BUG-033 🟢 Утечка таймера `setInterval` в viewer HTML
**Файл:** `packages/viewer/public/index.html:398`
**Причина:** `setInterval(pollRunStatus, 5000)` создавался при загрузке страницы без очистки. При многократной навигации (SPA-переходы) таймеры накапливались.
**Исправлено:** таймер сохраняется в `passivePollTimer`, очищается в `beforeunload`. **Источник:** Code Review #4, S-8.

### BUG-034 🟢 `--disable-gpu` + `--disable-software-rasterizer` → magistrate timeout 30s
**Файл:** `packages/captcha/session.ts`
**Причина:** в headless-режиме Chromium рендерит через software rasterizer. `--disable-gpu` + `--disable-software-rasterizer` отключали оба механизма рендеринга. `page.goto()` зависал на `waitUntil: 'domcontentloaded'` → Puppeteer TimeoutError через 30s.
**Исправлено:** флаги удалены. Вместо них `headless: 'shell'` — старый headless-режим (не создаёт GPU-окно, совместим с Windows/Linux). **Источник:** Code Review #4.

### BUG-035 🟢 Белое окно Puppeteer на Windows
**Файл:** `packages/captcha/session.ts`
**Причина:** в new headless-режиме (Puppeteer 22+) GPU-композитор на Windows кратковременно создаёт пустое окно в левом верхнем углу.
**Исправлено:** `headless: 'shell'` вместо `true`. Старый режим не инициализирует GPU-композитор → окно не появляется. Безопасен для Linux. **Источник:** Code Review #4.
