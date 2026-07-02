# CourtFlow — Полный аудит репозитория

## 📊 Общая оценка: **8/10** (Production-ready для Windows, требует доработки для Linux-продакшена)

---

## ✅ Что сделано отлично

| Компонент | Оценка | Комментарий |
|-----------|--------|-------------|
| **Архитектура** | 9/10 | Чистая модульность: `core/`, `adapters/`, `captcha/`, `scheduler/`, `exporter/`, `viewer/`. Один адаптер = один тип суда. |
| **Парсинг sudrf.ru (district/appeal/cassation)** | 9/10 | Работает стабильно, 100% успех в логах. Чистые адаптеры на cheerio. |
| **Парсинг msudrf.ru (magistrate)** | 8/10 | BUG-017 закрыт: uid = судебный номер, 5 колонок событий, filingDate/hearingDate/result. Puppeteer + RuCaptcha API v2. |
| **RuCaptcha API v2** | 9/10 | Правильные параметры (numeric=4, minLength=4, maxLength=6, case=false, languagePool='rn', softId='3898'). Только API v2, без legacy v1. |
| **SSL-фикс msudrf.ru** | 10/10 | `--ignore-certificate-errors` — правильный фикс для wildcard `*.msudrf.ru` не покрывающего `NN.region.msudrf.ru`. |
| **Merge по UID (json.ts)** | 9/10 | BUG-006 закрыт: повторный запуск обновляет существующие дела, не стирая историю. |
| **Lock-файл (orchestrator.lock)** | 8/10 | BUG-007 закрыт: защита от параллельного запуска. |
| **Retry + timeout + charset** | 8/10 | BUG-004, BUG-011, BUG-012 закрыты: exponential backoff, нативный fetch, авто-détection win1251/utf8. |
| **CaptchaRequiredError** | 9/10 | BUG-010 закрыт: капча логируется отдельно от FAIL. |
| **Viewer UI (Vanilla)** | 8/10 | Чистый HTML/JS/CSS без фреймворков. Поиск, фильтры, детали дела, логи, ручной запуск. |
| **Документация** | 9/10 | `CONTEXT.md`, `BUG_REPORT.md`, `DECISIONS.md`, `HTML_STRUCTURE.md`, `LINUX_DEPLOY.md`, `PROMPT_FOR_NEW_SESSION.md` — отличная практика. |

---

## 🔴 Критические баги / блокеры для продакшена

### 1. **BUG-019: `packages/captcha/solver.ts` — нереализованная заглушка** (открыт в BUG_REPORT.md)
```typescript
// packages/captcha/solver.ts
export async function solveCaptcha(): Promise<string> {
  throw new Error('solveCaptcha: не реализован');
}
```
**Влияние:** Не блокер (оркестратор не использует этот файл), но **технический долг**. Файл нигде не импортируется — мусор в кодовой базе.

**Рекомендация:** Удалить файл или реализовать как fallback-обёртку над `RuCaptchaClient`.

---

### 2. **XLSX экспорт — не реализован** (`packages/exporter/xlsx.ts`)
```typescript
export async function exportXlsx(...): Promise<string> {
  throw new Error('exportXlsx: не реализован');
}
```
**Влияние:** В `config.json` стоит `"exportXlsx": true`, но оркестратор только логирует `TODO`. Пользователь получит только JSON.

**Рекомендация:** Реализовать через `exceljs` (уже в deps). Колонки: `uid, number, type, court, judge, filingDate, hearingDate, result, parties, events`.

---

### 3. **MagistrateAdapter: UID = `caseNumber` из `<h2>`, но fallback на `case_id` из URL отсутствует**
```typescript
// magistrate.ts:37-41
const caseNumber = cleanText(
  $('h2').filter((_i, el) => $(el).text().includes('ДЕЛО №')).first().text().replace(/ДЕЛО\s*№/i, '')
) ?? '';
if (!caseNumber) throw new Error('MagistrateAdapter: не удалось определить номер дела');
```
**Риск:** Если HTML изменится и `<h2>ДЕЛО №...` исчезнет/поменяется — парсер упадёт. В district/appeal/cassation есть fallback на `case_uid`/`case_id` из URL.

**Рекомендация:** Добавить fallback:
```typescript
const caseNumber = cleanText(...) ?? parsedUrl.searchParams.get('case_id') ?? '';
```

---

### 4. **Отсутствует обработка 503/502/429 от судов** (retry есть, но не специфичный)
`withRetry` ретраит всё подряд. Судовые сайты часто отдают 503/502 при перегрузке — стоит логировать отдельно и, возможно, увеличивать backoff именно для этих кодов.

---

### 5. **Нет rate-limiting / задержек между запросами к одному суду**
Оркестратор идёт по URL последовательно, но если в `urls.txt` 50 дел одного суда — пойдут подряд без паузы. Риск бан по IP/подсети.

**Рекомендация:** Добавить в `config.json` параметр `delayBetweenRequestsMs` (например, 500–1000ms) и `sleep` в цикле `for (const url of urls)`.

---

## 🟡 Средние проблемы / слабые места

| # | Проблема | Файл | Риск |
|---|----------|------|------|
| 1 | **Hardcoded `delo_id` в detectCourtType** | `urls.ts:16-24` | Если суды сменят `delo_id` — сломается автоопределение типа. Лучше определять по домену (`oblsud--*`, `*kas.*`, `*.msudrf.ru`). |
| 2 | **Нет валидации `urls.txt` при загрузке** | `urls.ts:41-56` | Битые URL (нет протокола, битые параметры) упадут позже с непонятной ошибкой. |
| 3 | **`courts.json` — только ручное `enrich:courts`** | `courts.ts` | Если суд не в справочнике — в UI будет поддомен вместо названия. Нет автодополнения при парсинге. |
| 4 | **`viewer` не имеет `/api/run/enrich-courts` endpoint** | `server.ts:82-95` | В UI кнопка «Справочник судов» шлёт POST на несуществующий эндпоинт. |
| 5 | **`puppeteer.launch` создаёт новый браузер на КАЖДОЕ дело magistrate** | `session.ts:19-28` | Медленно (10-10-15 сек/дело. Для 10+ дел — минуты. Можно переиспользовать `browser`/`page`. |
| 6 | **Нет health-check / readiness эндпоинта у viewer** | `server.ts` | PM2 не может проверить живость кроме процесса. |
| 7 | **`ecosystem.config.cjs` — `cron_restart` работает только в PM2 Pro** | `ecosystem.config.cjs` | В бесплатном PM2 cron не работает. Нужен внешний cron/systemd. |
| 8 | **Нет метрик / Prometheus / health endpoint** | — | В продакшене не видно, жив ли парсер, сколько дел обработано, сколько ошибок. |
| 9 | **Hardcoded `softId: '3898'` в RuCaptcha** | `rucaptcha.ts:45` | Жёстко зашит ID разработчика. Если сменится — поломается статистика на стороне RuCaptcha. Лучше вынести в config/env. |
| 10 | **`publishedAt` / `modifiedAt` только для appeal/cassation** | `appeal.ts`, `cassation.ts` | District/magistrate — всегда `null`. В `types.ts` поля optional, но данные теряются. |

---

## 🟢 Идеи и предложения по функционалу

### 1. **Инкрементальный парсинг / дельта-детекция**
Сейчас парсятся ВСЕ дела из `urls.txt` каждый запуск. Для 100+ дел — долго.
- **Идея:** Хранить `lastModified`/`etag` по каждому URL, делать `HEAD` запрос, парсить только изменившиеся.
- **Бонус:** Экономия трафика и времени судов.

### 2. **Уведомления (Telegram / Email / Webhook)**
- Новое событие в деле → пуш в Telegram-бот.
- Ошибка парсинга → алерт.
- Ежедневный отчёт: «Обработано N дел, M новых событий, K ошибок».

### 3. **Фильтрация по дате / типу события в UI**
Сейчас в деталях дела показываются все события. Для юристов полезно: «Показать только судебные заседания», «Показать только решения».

### 4. **Экспорт в 1С (ваш кейс)**
- Уже есть flat JSON. Добавить профиль экспорта: «1C: JSONL по строкам», «1C: CSV с разделителем `;`», «1C: XML по схеме».
- Маппинг полей под типичную 1С-конфигурацию судебных дел.

### 5. **Автообновление `courts.json` при парсинге**
Если оркестратор встречает новый `courtId` — сам делает `fetchCourtDirectoryItem` и сохраняет. Не нужно отдельный `enrich:courts`.

### 6. **Поддержка kad.arbitr.ru (арбитражные суды)**
В памяти пользователя есть контекст: `kad.arbitr.ru` — pravocaptcha (jQuery-templated, рендерится через JS, картинка через `.ashx`). Нужен отдельный адаптер + Puppeteer + VLM (Ollama Qwen2.5-VL) или 2Captcha.

### 7. **Docker-образ для продакшена**
- `Dockerfile` с Node 24, Puppeteer deps, non-root user.
- `docker-compose.yml` с viewer + parser (cron) + optional Redis для очереди.

### 8. **Тесты (Vitest настроен, но тестов нет)**
- Unit-тесты адаптеров на фикстурах HTML (сохранить `magistrate-last.html` как fixture).
- Integration smoke-тест на локальном mock-сервере.

### 9. **Конфигурируемые селекторы**
Вынести CSS-селекторы в JSON-константы или конфиг — при изменении вёрстки судов править в одном месте, не лезя в код адаптеров.

### 10. **Конфигурируемые колонки XLSX / профили экспорта**
Разные профили для разных потребителей: юристы, 1С, аналитика.

---

## 📋 Детальный разбор по модулям

### `packages/core/`
| Файл | Оценка | Замечания |
|------|--------|-----------|
| `config.ts` | 9/10 | `dotenv` загружается при импорте, `SafeAppConfig` для `/api/config` (BUG-003) |
| `urls.ts` | 7/10 | Детектор типа суда по `delo_id` — хрупко. Нет валидации URL |
| `types.ts` | 9/10 | Чёткие интерфейсы `Case`, `CaseEvent`, `CaseParty`, `CourtAdapter`, `RunResult` |
| `errors.ts` | 9/10 | `CaptchaRequiredError` + `isCaptchaPage` — чистая изоляция |
| `retry.ts` | 8/10 | Exponential backoff, но не различает HTTP коды |
| `courts.ts` | 8/10 | Парсинг главной страницы суда, `vnkod` пока `null` |

### `packages/adapters/`
| Адаптер | Статус | Особенности |
|---------|--------|-------------|
| `district.ts` | ✅ Работает | 3 вкладки, таблица `#tablcont` опциональна |
| `appeal.ts` | ✅ Работает | 5 вкладок, `#cont5` = publishInfo, смещение индексов vs district |
| `cassation.ts` | ✅ Работает | Аналогично appeal, `#cont4` = жалобы (не парсим), `#cont5` = участники |
| `magistrate.ts` | ⚠️ Есть нюансы | BUG-017 закрыт, но нет fallback UID, жесткий парсинг 5 колонок |

### `packages/captcha/`
| Файл | Оценка | Замечания |
|------|--------|-----------|
| `rucaptcha.ts` | 9/10 | API v2, правильные параметры ImageToTextTask, polling с таймаутом |
| `session.ts` | 8/10 | Puppeteer + `--ignore-certificate-errors`, fetch в браузерном контексте для кук |
| `solver.ts` | 0/10 | **Мёртвый код**, удалить |

### `packages/scheduler/`
| Файл | Оценка | Замечания |
|------|--------|-----------|
| `orchestrator.ts` | 8/10 | Lock-файл, retry, группировка по судам, merge по UID, run-log истории |
| `smoke.ts` | 8/10 | По 1 URL каждого типа, лог в `logs/smoke-last.log` |
| `enrich-courts.ts` | 8/10 | Уникальные суды из `urls.txt` → `enrichCourts` |

### `packages/exporter/`
| Файл | Статус |
|------|--------|
| `json.ts` | ✅ Работает, merge по UID, атомарная запись через `.tmp` |
| `xlsx.ts` | ❌ **Не реализован** |

### `packages/viewer/`
| Компонент | Оценка |
|-----------|--------|
| `server.ts` | 8/10 — Express, static, API: `/api/config`, `/api/courts`, `/api/cases`, `/api/logs`, `/api/run`, `/api/run/status` |
| `public/index.html` | 8/10 — Vanilla, 3 таба (Дела/Логи/Запуск), поиск, фильтры, модалка деталей, автополлинг статуса |

---

## 🧪 Логи запуска (подтверждение работоспособности)

### `logs/run-log-2026-07-02.json` — итоги последнего запуска:
- **Всего URL:** 26
- **District (3 суда, 11 дел):** 100% success
- **Appeal (1 суд, 2 дела):** 100% success
- **Cassation (1 суд, 1 дело):** 100% success
- **Magistrate (8 судов, 12 дел):** После перезапуска — 100% success (ранние прогоны падали по SSL/timeout)

> **Вывод:** На Windows всё работает стабильно. Magistrate требует Puppeteer + RuCaptcha ключ.

---

## 📦 Конфигурация продакшена (Linux)

| Файл | Статус |
|------|--------|
| `ecosystem.config.cjs` | ✅ Готов, но `cron_restart` не работает в PM2 Free |
| `LINUX_DEPLOY.md` | ✅ Подробная инструкция: Node 24, Puppeteer deps, pm2, systemd |
| `.env.example` | ✅ Есть, нужен `RUCAPTCHA_API_KEY` |

**Рекомендация:** Заменить `cron_restart` в pm2 на systemd timer — надежнее, работает в любой ОС.

---

## 🎯 План минимального релиза v0.2.0 (Production Ready)

| Задача | Приоритет | Трудозатраты |
|--------|-----------|--------------|
| Удалить `packages/captcha/solver.ts` | 🔴 Critical | 5 мин |
| Реализовать `exportXlsx` в `packages/exporter/xlsx.ts` | 🔴 Critical | 30 мин |
| Добавить fallback UID в `MagistrateAdapter` | 🟡 High | 10 мин |
| Добавить `delayBetweenRequestsMs` в config + orchestrator | 🟡 High | 15 мин |
| Добавить `POST /api/run/enrich-courts` в viewer | 🟡 High | 10 мин |
| Заменить pm2 cron на systemd timer | 🟡 High | 20 мин |
| Добавить `GET /api/health` endpoint | 🟢 Medium | 10 мин |
| Вынести `softId` RuCaptcha в config/env | 🟢 Medium | 5 мин |
| Написать unit-тесты адаптеров (Vitest) | 🟢 Low | 1-2 ч |

---

## 💡 Общее впечатление кодовой базы

### Сильные стороны
- **Архитектурная дисциплина** — каждый тип суда в своём адаптере, общий контракт `CourtAdapter`, никакого спагетти
- **Документирование решений** — `DECISIONS.md`, `BUG_REPORT.md`, `CONTEXT.md` — редкость для пет-проектов, признак зрелого подхода
- **Правильные технические решения** — RuCaptcha API v2 (не legacy), `--ignore-certificate-errors` для msudrf, merge по UID, lock-файл, charset detection
- **Чистый стек** — TypeScript ESM, нативный fetch, без лишних зависимостей, Vanilla UI без фреймворков

### Зоны роста
- **Отсутствие rate-limiting** — главная угроза стабильности в продакшене
- **Недоделанный XLSX** — заявлена фича в конфиге, не работает
- **Мёртвый код (`solver.ts`)** — сигнал о недозакрытых задачах
- **PM2 cron в free tier** — не работает, нужен systemd
- **Нет наблюдаемости** — нет health/metrics, в продакшене слепо

---

## 🏁 Вердикт

**Проект готов к использованию на Windows (dev/личное).**  
**Для Linux-продакшена требуется 2-4 часа доработки** (пункты из плана v0.2.0).

Архитектура расширяемая, код читаемый, баги задокументированы и в основном закрыты. Хорошая база для дальнейшего развития.

---

*Аудит выполнен Hermes Agent в read-only режиме. Код не изменён.*