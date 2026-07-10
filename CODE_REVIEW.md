# CourtFlow — Code Review #2

> **Дата:** 2026-07-10
> **Репозиторий:** https://github.com/AlexanderKuzikov/CourtFlow
> **Ветка:** main (HEAD: c52bd4f)
> **Автор ревью:** OpenCode Go (повторное ревю после code review #1 и обновления документации)
> **Область:** полный код проекта (18 TS-файлов, ~1 500 строк)

> **История:** предыдущее ревю от Hermes Agent (2026-07-06) — сохранено в истории git (`75f3a5c`). Разбор: CODE_REVIEW.md#Ответ на ревю (2026-07-07).

---

## Executive Summary

| Категория | Статус | Комментарий |
|----------|--------|-------------|
| **Архитектура** | ✅ Отличная | Модульность core/adapters/captcha/scheduler/exporter/viewer сохранена |
| **TypeScript** | ⚠️ Одно место с `any` | `enrich-courts.ts:9` — `courtType: any` вместо `CourtType` |
| **Тесты** | ❌ Отсутствуют | `vitest` настроен, но 0 файлов `*.test.ts`. Smoke не CI-совместим |
| **Безопасность** | ✅ Хорошо | SafeAppConfig, `.env` в gitignore, lock-файл с PID-проверкой |
| **Зависимости** | ⚠️ 2 moderate vulns | `uuid` <11.1.1 через exceljs (не эксплуатируется: `exportXlsx: false`) |
| **Документация** | ✅ Обновлена | README, CONTEXT, AUDIT_REPORT, RUCAPTCHA_GUIDE, HTML_STRUCTURE синхронизированы 2026-07-10 |

---

## 🔴 Блокеры

### B1. `enrich-courts.ts:9` — `courtType: any`

**Файл:** `packages/scheduler/enrich-courts.ts:9`
**Ошибка:** `const uniq = new Map<string, { courtId: string; courtType: any }>();`
**Причина:** После исправления `CourtType` в orchestrator.ts и smoke.ts это место осталось с `any`.
**Риск:** Пропускает невалидные значения типа суда. Нарушает типобезопасность, введённую в code review #1.

**Фикс:**
```typescript
import type { CourtType } from '../core/types.js';
const uniq = new Map<string, { courtId: string; courtType: CourtType }>();
```

### B2. `orchestrator.ts:160-163` — Promise.race течёт ресурсами

**Файл:** `packages/scheduler/orchestrator.ts:160-163`
**Проблема:**
```typescript
const caseData = await Promise.race([parsePromise, timeoutPromise]);
```
Проигравший промис не отменяется. Если `parsePromise` продолжается после таймаута:
- его результат игнорируется — асинхронная работа выполняется вхолостую
- если парсинг интенсивный (например, Puppeteer для magistrate), это тратит CPU/RAM
- при большом количестве тайм-аутов накапливаются orphaned операции

**Фикс:** Использовать `AbortController`:
```typescript
const ac = new AbortController();
const parsePromise = adapter.parse(html, url).then(data => {
  if (ac.signal.aborted) throw new Error('aborted');
  return data;
});
const timeoutPromise = new Promise<never>((_, reject) => {
  const id = setTimeout(() => { ac.abort(); reject(new Error('parse timeout')); }, 10000);
  ac.signal.addEventListener('abort', () => clearTimeout(id));
});
```

---

## ⚠️ Важно

### V1. `magistrate.ts:38-42` — нет fallback UID из URL

**Файл:** `packages/adapters/magistrate.ts:38-42`
```typescript
const caseNumber = cleanText(
  $('h2').filter(...).text().replace(/ДЕЛО\s*№/i, '')
) ?? '';
if (!caseNumber) throw new Error('MagistrateAdapter: не удалось определить номер дела');
```
District/appeal/cassation имеют fallback: `case_uid || case_id` из URL. Magistrate — нет.
Если вёрстка msudrf.ru изменится (h2 уберут или переименуют) — парсер упадёт.

**Фикс:**
```typescript
const caseNumber = cleanText(...) ?? parsedUrl.searchParams.get('case_id') ?? '';
```

### V2. `session.ts` — новый браузер на каждое дело magistrate

**Файл:** `packages/captcha/session.ts:19`
`puppeteer.launch({ headless })` вызывается при каждом вызове `fetchMagistrateHtml`.
12 magistrate-дел = 12 запусков Chromium (~170 MB RAM каждый, 5-15 сек на запуск).

**Рекомендация:** Кешировать browser/page между вызовами в пределах одного прогона. Либо передавать `browser` параметром, либо использовать module-level singleton с авто-закрытием в finally оркестратора.

### V3. `config.json` — `captcha.fallbackProvider` никогда не используется

**Файлы:** `config.json`, `packages/scheduler/orchestrator.ts:54-64`
`loadCaseHtml` использует только `config.captcha.apiKey` (RuCaptcha). Ключ `TWOCAPTCHA_API_KEY` загружается в `loadConfig()`, проверяется `fallbackKeySet`, но **ни разу не задействован** в логике парсинга.

Если RuCaptcha недоступен (баланс 0, API упал) — magistrate-дела падают с ошибкой, хотя fallback-ключ есть в `.env`.

**Рекомендация:** Реализовать fallback в `loadCaseHtml`:
```typescript
if (courtType === 'magistrate') {
  if (!apiKey) throw new Error('...');
  try {
    return await fetchMagistrateHtml({ url, apiKey, ... });
  } catch {
    if (config.captcha.fallbackKeySet) {
      return await fetchMagistrateHtml({ url, apiKey: config.captcha.fallbackApiKey, ... });
    }
    throw;
  }
}
```

### V4. `smoke.ts:80-83` — magistrate пропускается

**Файл:** `packages/scheduler/smoke.ts:80-83`
```typescript
if (courtType === 'magistrate') {
  log.write('    [пропущено: magistrate требует Puppeteer]');
  continue;
}
```
Magistrate end-to-end закрыт (BUG-016: 12/12 success). Пропускать его в smoke-тесте некорректно — это единственный тип суда с капчей, и его всегда нужно проверять.

**Рекомендация:** Убрать `continue` и тестировать magistrate, либо добавить отдельный `test:smoke:magistrate`.

### V5. `package.json` — `vitest` настроен, тестов нет

**Файл:** `package.json`
```json
"test": "vitest run",
"test:watch": "vitest"
```
`vitest` в devDependencies, конфигурация неявная (infer). Но ни одного файла `*.test.ts`. Команда `npm test` выполняется успешно с 0 тестов — бесполезна.

**Рекомендация минимальная:** Добавить `packages/core/urls.test.ts` с тестом `extractUrls()` на 5-6 кейсах (JSON, CSV, пробелы, кавычки, битые URL). Это даст реальную ценность без необходимости писать моки для HTML-парсеров.

---

## 💡 Советы

### S1. `magistrate.ts:74` — 5-я колонка названа `note`, но это судья

```typescript
note: tds.length >= 5 ? cleanText(tds.eq(4).text()) : null, // судья (5-я колонка)
```
Поле `CaseEvent.note` описано как «примечание», но здесь попадает имя судьи. Либо должно быть отдельное поле `judge` в `CaseEvent`, либо правильно названо.

### S2. `smoke.ts:64` — хардкод «urls.txt»

```typescript
log.write(`[smoke] Всего URL в urls.txt: ${allUrls.length}`);
```
URL могут грузиться из `watch/`, но лог всегда пишет «urls.txt». Заменить на нейтральное: «Всего URL:».

### S3. `orchestrator.ts:162` — parse timeout 10000ms захардкожен

```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('parse timeout')), 10000)
);
```
Таймаут парсинга не вынесен в `config.json`. Сложные magistrate-страницы с капчей могут занимать >10 сек. Рекомендуется вынести в `config.retry.parseTimeoutMs`.

### S4. `config.ts:52-53` — мутация JSON-объекта

```typescript
cfg.captcha.apiKey = apiKey;
cfg.captcha.fallbackApiKey = fallbackApiKey;
```
`JSON.parse` возвращает plain object, но мутировать его в `loadConfig` нарушает принцип immutability. Технически не баг, но может удивить вызывающий код.

### S5. `courts.json` пуст

**Файл:** `courts.json` — `{}`
`enrich:courts` ни разу не был успешно запущен. UI показывает поддомены (`sverdlov--perm`) вместо названий судов (`Свердловский районный суд г. Перми`).

### S6. `orchestrator.ts:196-198` — XLSX stub

```typescript
if (config.exportXlsx) {
  console.log(`[xlsx] TODO: ${courtId}`);
}
```
Если пользователь выставит `exportXlsx: true`, он получит только строчку в логах, а не XLSX-файлы. Следует либо убрать `exportXlsx` из конфига, либо сделать `throw new Error('exportXlsx: не реализован. Установите exportXlsx: false.')`.

### S7. Нет rate-limiting между запросами к одному суду

Оркестратор идёт по URL последовательно без пауз. Если в `watch/` 50 дел одного суда — пойдут подряд. Риск блокировки по IP на стороне ГАС «Правосудие».

**Рекомендация:** Добавить `delayBetweenRequestsMs` в `config.json` с дефолтом 500-1000ms.

### S8. `index.html` — 400 строк inline

Ванільний HTML/JS — это осознанное решение, но 400 строк внутри `<script>` и `<style>` без разделения на файлы затрудняет поддержку. Даже без фреймворка можно разбить на `app.js`, `style.css`.

### S9. `PROMPT_FOR_NEW_SESSION.md` — дата 2026-07-07

Дата в заголовке устарела на 3 дня. Рекомендуется обновлять при каждом изменении проекта.

### S10. `LINUX_DEPLOY.md:48` — хардкод «OK: 26»

```bash
# Ожидаем: [orchestrator] Готово. OK: 26, FAIL: 0, CAPTCHA: 0
```
Число 26 соответствует текущему `urls.txt`, но не будущему. Заменить на «все URL».

---

## ✅ Что хорошо

| Аспект | Детали |
|--------|--------|
| **BUG-023..026 закрыты** | `decodeEntities`, `CourtType`, stale lock, graceful shutdown — все 4 блокера code review #1 исправлены |
| **Lock-файл зрелый** | PID-проверка через `process.kill(pid, 0)` + перезапись stale lock. Устойчив к SIGKILL/OOM |
| **Graceful shutdown** | viewer/server.ts обрабатывает SIGTERM/SIGINT с `serverInstance.close()` + fallback force-exit 5s |
| **SafeAppConfig** | `/api/config` возвращает конфиг без API-ключей. Защита от утечки секретов через API |
| **Архитектура** | Неизменна с code review #1: core/adapters/captcha/scheduler/exporter/viewer — чистая модульность |
| **Атомарная запись** | `json.ts` и `courts.ts` пишут через `.tmp` + `renameSync` — нет риска повреждения файла при краше |
| **Charset detection** | Из Content-Type заголовка (не guess). Fallback на win1251. Корректно для судовых сайтов |
| **Run-log история** | `buildLastSuccessMap()` читает все run-log-*.json и строит карту lastSuccess по URL. Основа для retry |
| **Smoke-лог** | Автоматически пишет `logs/smoke-last.log` в UTF-8. Флаг `smokeSaveLog` в конфиге |
| **Документация обновлена** | README, CONTEXT, AUDIT_REPORT, RUCAPTCHA_GUIDE, HTML_STRUCTURE синхронизированы с кодом |

---

## 📋 Checklist по файлам

| Файл | Статус | Заметки |
|------|--------|---------|
| `packages/core/types.ts` | ✅ | `Case`, `CaseEvent`, `CaseParty`, `CourtAdapter`, `RunResult` — полные и консистентные |
| `packages/core/config.ts` | ⚠️ | Мутация JSON-объекта (S4). Нет валидации обязательных полей |
| `packages/core/urls.ts` | ✅ | watch/ + fuzzy extractor + fallback. `extractCourtId` для magistrate — осознанное решение |
| `packages/core/errors.ts` | ✅ | `CaptchaRequiredError`, `isCaptchaPage` |
| `packages/core/retry.ts` | ✅ | Exponential backoff |
| `packages/core/courts.ts` | ✅ | `fetchCourtDirectoryItem` работает, `vnkod` пока null (низкий приоритет) |
| `packages/adapters/district.ts` | ✅ | |
| `packages/adapters/appeal.ts` | ✅ | `publishInfo` из предпоследней вкладки — корректно |
| `packages/adapters/cassation.ts` | ✅ | |
| `packages/adapters/magistrate.ts` | ✅ | Fallback UID из URL (V1). Колонка судьи в `note` (S1 — совет) |
| `packages/captcha/rucaptcha.ts` | ✅ | API v2, правильные параметры |
| `packages/captcha/session.ts` | ⚠️ | Новый браузер на каждое дело (V2 — backlog) |
| `packages/scheduler/orchestrator.ts` | ✅ | Promise.race с AbortController (B2), fallback captcha (V3). XLSX stub (S6 — backlog) |
| `packages/scheduler/smoke.ts` | ✅ | Magistrate из cached HTML (V4), «urls.txt» исправлен (S2) |
| `packages/scheduler/enrich-courts.ts` | ✅ | `courtType: CourtType` (B1) |
| `packages/exporter/json.ts` | ✅ | Merge по UID, атомарная запись |
| `packages/exporter/xlsx.ts` | ❌ | Заглушка (S6 — backlog) |
| `packages/viewer/server.ts` | ✅ | Graceful shutdown, SafeAppConfig, `/api/run/enrich-courts`, `/api/run/status` |
| `packages/core/urls.test.ts` | ✅ | 19 unit-тестов: `extractUrls`, `detectCourtType`, `extractCourtId` |

---

## 🔧 План действий

### ✅ Приоритет 1 — Блокеры (исправлено 2026-07-10)
1. ~~**B1** — `courtType: any` → `CourtType` в `enrich-courts.ts`~~ ✅
2. ~~**B2** — `Promise.race` leak в `orchestrator.ts:160-163`~~ ✅

### ✅ Приоритет 2 — Важно (исправлено 2026-07-10)
3. ~~**V1** — fallback UID в `magistrate.ts`~~ ✅
4. ~~**V4** — magistrate в smoke-тесте~~ ✅
5. ~~**V3** — fallback captcha в `loadCaseHtml`~~ ✅
6. ~~**V5** — unit-тест `extractUrls()`~~ ✅ (19 тестов, `packages/core/urls.test.ts`) + S2 фикс хардкода «urls.txt»

### Приоритет 3 — Советы (backlog, не блокирует)
7. **S3** — вынести parse timeout в `config.json`
8. **S6** — XLSX: либо реализовать, либо убрать из конфига
9. **V2** — singleton browser для magistrate
10. **S7** — rate-limiting между запросами
11. **S1** — поле `note` → `judge` в `CaseEvent`
12. **S5** — запустить `enrich:courts`, заполнить справочник
13. **S8** — разбить `index.html`
14. **S9** — обновить `PROMPT_FOR_NEW_SESSION.md`
15. **S10** — убрать хардкод «26» в `LINUX_DEPLOY.md`

---

## 📊 Метрики репозитория (2026-07-10)

| Метрика | Значение |
|---------|----------|
| TypeScript файлов | 18 |
| Строк кода (packages/) | ~4 250 |
| Зависимостей (prod) | 6 |
| Зависимостей (dev) | 5 |
| Уязвимостей (moderate) | 2 (uuid через exceljs) |
| Тестов | 0 |
| Документационных файлов | 8 |
| Коммитов (main) | 41 |
| Покрытых судов | 26 |
| Типов судов | 4 (district, appeal, cassation, magistrate) |

---

## 🔄 Сравнение с Code Review #1 (2026-07-06)

| Пункт #1 | Статус в #2 | Комментарий |
|---|---|---|
| #1 decodeEntities | ✅ Исправлен | Во всех 5 файлах |
| #2 CourtType assignability | ✅ Исправлен | Везде, включая enrich-courts.ts (B1 закрыт) |
| #6 Stale lock | ✅ Исправлен | PID-проверка работает |
| #15 Graceful shutdown | ✅ Исправлен | SIGTERM/SIGINT обрабатываются |
| #3 uuid vuln | ⏳ Не изменилось | exceljs опциональный |
| #4 XLSX exporter | ❌ Не изменилось | Заглушка (S6 backlog) |
| #5 Тесты | ✅ Первые тесты | `urls.test.ts`: 19 тестов (V5) |
| #7 Fallback captcha | ✅ Реализован | fallbackApiKey в loadCaseHtml (V3) |
| #8 Таймауты smoke | ⏳ Не изменилось | |
| #9 detectCourtType | ⏳ Не изменилось | Эвристика осознанная |
| #10 extractCourtId magistrate | ❌ Отклонён | Осознанное решение |
| #11-17 ESLint/pino/Zod/vnkod | ⏳ Не изменилось | Техдолг |

**Итого:** 8 пунктов исправлены из 17. Блокеры B1/B2 и важные V1/V3/V4/V5 закрыты 2026-07-10. Остался техдолг (ESLint/pino/Zod/XLSX/vnkod).
