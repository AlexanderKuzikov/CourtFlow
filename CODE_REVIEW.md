# CourtFlow — Полный Code Review

> **Дата:** 2026-07-06  
> **Репозиторий:** https://github.com/AlexanderKuzikov/CourtFlow  
> **Ветка:** main (HEAD: 0afd324)  
> **Автор ревью:** Hermes Agent (автономная проверка)

---

## Executive Summary

| Категория | Статус | Комментарий |
|----------|--------|-------------|
| **Архитектура** | ✅ Отличная | Чёткое разделение: core / adapters / captcha / scheduler / exporter / viewer |
| **TypeScript** | ⚠️ Ошибки компиляции | `decodeEntities` deprecated в cheerio; типы CourtType не проходят в orchestrator |
| **Тесты** | ❌ Отсутствуют | Нет unit/integration тестов; только smoke-скрипт |
| **Безопасность** | ✅ Хорошо | Секреты в .env, SafeAppConfig без ключей в API, lock-файл |
| **Зависимости** | ⚠️ 2 moderate vulns | `uuid` <11.1.1 (через exceljs); рекомендуется обновить exceljs до 4.4.0+ |
| **Документация** | ✅ Отличная | CONTEXT.md, DECISIONS.md, BUG_REPORT.md, HTML_STRUCTURE.md, LINUX_DEPLOY.md |

---

## 🔴 Critical Issues (блокеры)

### 1. TypeScript компиляция падает — `decodeEntities` не существует
**Файлы:** `packages/adapters/*.ts`, `packages/core/courts.ts` (5 мест)  
**Ошибка:** `TS2353: Object literal may only specify known properties, and 'decodeEntities' does not exist in type 'CheerioOptions'.`  
**Причина:** Cheerio 1.x удалил опцию `decodeEntities`. По умолчанию теперь `false` (entities не декодируются).  
**Фикс:** Убрать `decodeEntities: false` — это уже дефолт в v1.

```typescript
// Было:
cheerio.load(html, { decodeEntities: false });

// Стало:
cheerio.load(html);
```

### 2. Type mismatch в orchestrator.ts — CourtType assignability
**Файл:** `packages/scheduler/orchestrator.ts` строки 159, 168, 178  
**Ошибка:** `Type 'string' is not assignable to type 'CourtType'.`  
**Причина:** `courtGroups` использует `string` ключи, но `RunResult.courtType` требует union type.  
**Фикс:** Добавить type assertion или привести тип:

```typescript
const courtType = type as CourtType; // или CourtType(type)
```

---

## ⚠️ Warnings (требуют внимания)

### 3. Уязвимости зависимостей (npm audit)
| Пакет | Severity | CVE | Путь |
|-------|----------|-----|------|
| `uuid` | moderate | GHSA-w5hq-g745-h8pq | `exceljs → uuid` |

**Рекомендация:** Обновить `exceljs` до ≥4.4.0 (тянет uuid ≥11.1.1) или добавить `overrides` в package.json.

```json
"overrides": {
  "uuid": "^11.1.1"
}
```

### 4. XLSX экспортер — заглушка
**Файл:** `packages/exporter/xlsx.ts`  
**Статус:** `throw new Error('exportXlsx: не реализован')`  
**В конфиге:** `exportXlsx: false` — поэтому не блокирует, но функция заявлена в архитектуре.  
**Рекомендация:** Либо реализовать (exceljs уже в deps), либо убрать из конфига/доков.

### 5. Нет автоматизированных тестов
- `vitest` в devDependencies, но тестов нет (`*.test.ts` — 0 файлов)
- Smoke-скрипт только ручной, не CI-совместим (нет exit code на failure)
- **Риск:** Регрессии парсеров не ловятся автоматически при изменении HTML сайтов.

### 6. Lock-файл — только в памяти процесса
**Файл:** `orchestrator.ts` строки 96-101, 194-196  
**Проблема:** При краше процесса lock-файл может остаться (`unlinkSync` в finally, но при нормальном выходе). При hard kill (SIGKILL, OOM) — lock останется навсегда.  
**Рекомендация:** Добавить проверку валидности PID при старте:

```typescript
if (existsSync(lockPath)) {
  const pid = parseInt(readFileSync(lockPath, 'utf-8'), 10);
  try { process.kill(pid, 0); } catch { /* процесс мёртв — можно перезаписать */ }
  // если процесс жив — exit
}
```

### 7. Retry-режим — нет fallback провайдера капчи
**Файл:** `orchestrator.ts` строка 52-60, `config.json` имеет `fallbackProvider: '2captcha'`  
**Проблема:** Код использует только `config.captcha.apiKey` (primary). Fallback ключ загружается в конфиг но **никогда не используется**.  
**Рекомендация:** Реализовать fallback логику в `loadCaseHtml` для magistrate.

### 8. Захардкоженные таймауты в smoke.ts
**Файл:** `packages/scheduler/smoke.ts` строка 86  
**Проблема:** Использует `config.retry.timeoutMs` (15s) для fetch, но сетевые задержки до судов могут быть выше. Smoke тест падает с timeout (как в выводе выше).  
**Рекомендация:** Отдельный `smokeTimeoutMs` в конфиге или увеличить до 30-60s.

### 9. `detectCourtType` — хрупкая эвристика
**Файл:** `packages/core/urls.ts` строки 21-29  
**Проблема:** Определяет тип суда по `delo_id` параметру, но если URL меняется — сломается.  
**Рекомендация:** Добавить явный `courtType` в watch/ файлы (JSON с полем `courtType`) как опциональный override.

### 10. `extractCourtId` — не покрывает поддомены типа `35.perm.msudrf.ru`
**Файл:** `packages/core/urls.ts` строки 31-39  
**Проблема:** `.replace('.msudrf.ru', '')` оставляет `35.perm` — это не уникальный courtId.  
**Реальный courtId для magistrate** — вторая часть от конца (например `perm`). Сейчас `courtId = '35.perm'`, что дублируется при разных участках.  
**Фикс:** Для magistrate брать предпоследний сегмент:

```typescript
if (host.includes('.msudrf.ru')) {
  const parts = host.split('.');
  return parts[parts.length - 2]; // 'perm' из '35.perm.msudrf.ru'
}
```

---

## 💡 Suggestions (улучшения)

### 11. Добавить vitest конфиг и CI-совместимый smoke
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['packages/**/*.test.ts'] }
});
```
Сделать `npm run test:smoke` возвращать ненулевой код при ошибках — для CI.

### 12. Вынести общие селекторы в константы
В 4 адаптерах дублируется логика поиска UID, типов, номеров. Можно вынести в `packages/core/selectors.ts` с картой селекторов по типам судов.

### 13. Добавить ESLint / Prettier
Сейчас только `tsc --noEmit`. Рекомендую:
```bash
npm i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

### 14. Логирование — структурированный JSON
Сейчас `console.log`/`warn`/`error`. Для продакшена удобнее `pino` или похожий — легко парсить в Loki/ELK.

### 15. Graceful shutdown для viewer
**Файл:** `packages/viewer/server.ts` — нет обработки SIGTERM/SIGINT. PM2 шлёт SIGTERM, процесс умирает без закрытия соединений.

### 16. Валидация конфига при старте
`loadConfig()` не валидирует обязательные поля (schedule, outputDir, retry.*). Добавить Zod схему или простую проверку.

### 17. `courts.json` — нет vnkod в данных
Структура есть (`vnkod: string | null`), но `fetchCourtDirectoryItem` всегда ставит `null`. Можно извлекать из ссылок `judicial_uid` на главной странице.

---

## ✅ Looks Good (сильные стороны)

| Аспект | Детали |
|--------|--------|
| **Модульность** | Чёткое разделение: `core`, `adapters`, `captcha`, `scheduler`, `exporter`, `viewer` |
| **Изоляция адаптеров** | Один адаптер = один тип суда. Изменения HTML не ломают другие типы. |
| **Watch/ папка** | Гибкий источник URL: любой формат, рекурсивный скан, дедупликация, fallback на urls.txt |
| **Two-tier scheduling** | Full-run + retry-run по stale URL (на основе run-log истории) — правильный паттерн для нестабильных источников |
| **Merge по UID** | `exporter/json.ts` не стирает историю, мержит новые данные |
| **Lock-файл** | Защита от параллельного запуска оркестратора |
| **SafeAppConfig** | API `/api/config` не утекает секреты |
| **Puppeteer + RuCaptcha v2** | Правильный подход для magistrate: browser context + API v2 (не legacy) |
| **Charset автоопределение** | Из Content-Type заголовка, fallback win1251 |
| **Документация** | CONTEXT.md, DECISIONS.md, BUG_REPORT.md, HTML_STRUCTURE.md, LINUX_DEPLOY.md — уровень enterprise |
| **pm2 ecosystem** | Готовый продакшен-конфиг с cron_restart |

---

## 📋 Checklist по файлам

| Файл | Статус | Заметки |
|------|--------|---------|
| `packages/core/types.ts` | ✅ | Чёткие интерфейсы, `$schema` для версионирования |
| `packages/core/config.ts` | ✅ | SafeAppConfig паттерн, dotenv загрузка |
| `packages/core/urls.ts` | ⚠️ | `extractCourtId` для magistrate, `detectCourtType` эвристика |
| `packages/core/errors.ts` | ✅ | `CaptchaRequiredError`, `isCaptchaPage` |
| `packages/core/retry.ts` | ✅ | Exponential backoff, чистая реализация |
| `packages/core/courts.ts` | ⚠️ | `decodeEntities` ошибка TS, `vnkod` не заполняется |
| `packages/adapters/district.ts` | ⚠️ | `decodeEntities` ошибка TS |
| `packages/adapters/appeal.ts` | ⚠️ | `decodeEntities` ошибка TS |
| `packages/adapters/cassation.ts` | ⚠️ | `decodeEntities` ошибка TS |
| `packages/adapters/magistrate.ts` | ⚠️ | `decodeEntities` ошибка TS |
| `packages/captcha/rucaptcha.ts` | ✅ | API v2, правильные параметры ImageToTextTask |
| `packages/captcha/session.ts` | ✅ | Puppeteer + fetch в browser context, `--ignore-certificate-errors` |
| `packages/scheduler/orchestrator.ts` | ⚠️ | TS ошибки CourtType, lock уязвимость, fallback капча не используется |
| `packages/scheduler/smoke.ts` | ⚠️ | Таймауты, нет exit code для CI |
| `packages/scheduler/enrich-courts.ts` | ✅ | Простая обёртка, работает |
| `packages/exporter/json.ts` | ✅ | Merge по UID, атомарная запись через .tmp |
| `packages/exporter/xlsx.ts` | ❌ | Заглушка, не реализован |
| `packages/viewer/server.ts` | ⚠️ | Нет graceful shutdown, reconciliation работает |

---

## 🔧 Plan of Action (рекомендуемый порядок фиксов)

### Приоритет 1 (Блокеры компиляции)
1. Убрать `decodeEntities: false` из 5 файлов адаптеров + courts.ts
2. Исправить `CourtType` assignability в orchestrator.ts (3 места)

### Приоритет 2 (Надёжность)
3. Добавить проверку валидности PID в lock-файл
4. Реализовать fallback провайдера капчи (2captcha) в orchestrator
5. Исправить `extractCourtId` для magistrate поддоменов

### Приоритет 3 (Качество)
6. Добавить vitest конфиг + минимум 1 тест на адаптер
7. Сделать smoke тест CI-совместимым (exit code)
8. Реализовать `exportXlsx` или убрать из конфига/доков
9. Добавить ESLint + Prettier
10. Graceful shutdown в viewer

### Приоритет 4 (Низкий)
11. Обновить exceljs (фикс уязвимости uuid)
12. Структурированное логирование (pino)
13. Валидация конфига (Zod)
14. Извлечение vnkod в courts.ts

---

## 📦 Как применить фиксы

Все изменения можно сделать локально, закоммитить и запушить:

```bash
cd /path/to/CourtFlow

# 1. Fix decodeEntities
sed -i 's/{ decodeEntities: false }//g' packages/adapters/*.ts packages/core/courts.ts
# (аккуратно — оставить пустые скобки или убрать второй аргумент)

# 2. Fix CourtType в orchestrator.ts
# Добавить: const courtType = type as CourtType;

# 3. Fix extractCourtId в urls.ts
# Обновить логику для .msudrf.ru

# 4. Commit & push
git add -A
git commit -m "fix: resolve TS compilation errors + courtId extraction"
git push origin main
```

---

## 📊 Метрики репозитория

| Метрика | Значение |
|---------|----------|
| TypeScript файлов | 14 |
| Строк кода (packages/) | ~1,500 |
| Зависимостей (prod) | 6 |
| Зависимостей (dev) | 5 |
| Уязвимостей (moderate) | 2 |
| Тестов | 0 |
| Документационных файлов | 8 |

---


---

## 📝 Ответ на ревю (2026-07-07)

> Автор: Comet (Perplexity AI). Разбор проведён после аварии с электричеством, прервавшей сессию. Изменения внесены напрямую в GitHub.
>
> ### ✅ Принято и исправлено
>
> | # | Пункт | Статус | Что сделано |
> |---|---|---|---|
> | 1 | `decodeEntities` TS2353 | ✅ Исправлено | Убран второй аргумент `cheerio.load()` в 5 файлах: appeal.ts, cassation.ts, district.ts, magistrate.ts, courts.ts |
> | 2 | `CourtType` assignability | ✅ Исправлено | `ADAPTERS: Record<CourtType, CourtAdapter>`, `courtGroups: Map<string, { type: CourtType; ... }>`, `loadCaseHtml(..., courtType: CourtType)` |
> | 6 | Stale lock после SIGKILL/OOM | ✅ Исправлено | Добавлена `isProcessAlive()` через `process.kill(pid, 0)`. Stale lock перезаписывается, не блокирует запуск |
> | 15 | Graceful shutdown viewer | ✅ Исправлено | `SIGTERM`/`SIGINT` → `serverInstance.close()` + fallback force-exit 5s. `app.listen()` сохраняется в `serverInstance` |
>
> ### ❌ Отклонено
>
> | # | Пункт | Причина отклонения |
> |---|---|---|
> | 10 | `extractCourtId` для magistrate — брать предпоследний сегмент (`perm` вместо `35.perm`) | **Отклонено.** Предложенный фикс сольёт разные судебные участки одного региона в один `courtId = 'perm'`. Это приведёт к перезатиранию данных при `exportJson()` и потерям дел в UI. Текущая схема `35.perm` сохраняет уникальность каждого участка — это осознанное архитектурное решение. |
>
> ### ⏳ Отложено (осознанно, не блокирует продакшен)
>
> | # | Пункт | Почему отложено |
> |---|---|---|
> | 3 | uuid уязвимость (exceljs) | exceljs опциональный, `exportXlsx: false` по умолчанию; риск не эксплуатируется |
> | 4 | XLSX экспортер | Низкий приоритет, зафиксирован как Фаза 4 в DECISIONS.md |
> | 5 | Unit/integration тесты | HTML судов меняется непредсказуемо; план: unit-тест `extractUrls()` + CI smoke с exit code |
> | 7 | Fallback captcha (2captcha) | RuCaptcha стабилен; возьмём при первом реальном инциденте |
> | 8 | Таймауты в smoke.ts | 15s выбрано осознанно; пересмотрим при первом false positive |
> | 9 | `detectCourtType` эвристика | URL-схема ГАС «Правосудие» стабильна; риск изменения низкий |
> | 11–14, 16–17 | ESLint/Prettier, pino, Zod, vnkod | Техдолг; не влияют на корректность работы |
>
> ### Итог
>
> Из 2 критических и 8 warning-пунктов: **4 исправлены** (пункты 1, 2, 6, 15), **1 отклонён** с аргументацией (пункт 10), **остальные 9 осознанно отложены** с указанием условий возврата. Ни один пункт не остался без ответа.
*Ревью выполнено автоматически Hermes Agent. Все выводы основаны на статическом анализе кода, конфигурации и документации репозитория на GitHub.*
