# CourtFlow — Контекст проекта

> Этот файл — **основной источник контекста** для LLM и разработчиков при переключении сессий, моделей, аккаунтов.
> Обновляется каждую сессию. Структура: TL;DR вверху → детали ниже.

---

## ⚡ TL;DR для быстрого онбординга LLM

```
Проект:    CourtFlow — парсер судебных дел РФ
Репо:      https://github.com/AlexanderKuzikov/CourtFlow
Стек:      TypeScript 5.x, Node.js 22, Cheerio, Puppeteer, tsx, Vitest
Капча:     rucaptcha (primary, оплата в RUB) → 2captcha (fallback)
Storage:   JSON + XLSX (генерируется автоматически при каждом парсинге)
Scheduler: system cron, 2–3 раза в неделю
Деплой:    офисный сервер (Windows/Linux), без облака
Downstream: данные передаются в 1С (формат согласуется отдельно)
Статус:    скелет создан, код адаптеров не написан
Следующий шаг: написать core/types.ts, config.ts, затем adapter: district
```

**Прототипы (reference, не трогать):**
- [SudRF-Parser](https://github.com/AlexanderKuzikov/SudRF-Parser) — рабочий парсер районных судов на JS
- [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) — Express viewer с REST API

**Структура репо (скелет создан):**
```
packages/
  core/          ← types.ts, config.ts, retry.ts
  adapters/      ← district.ts, appeal.ts, cassation.ts, magistrate.ts
  captcha/       ← session.ts (Puppeteer), solver.ts (rucaptcha/2captcha)
  scheduler/     ← orchestrator.ts (читает config, запускает адаптеры)
  exporter/      ← json.ts, xlsx.ts
  viewer/        ← server.ts (Express), public/ (UI + /config panel)
data/            ← output JSON + XLSX
logs/            ← run-log.json
config.json      ← единая точка настройки всей системы
```

**Ключевые контракты:**
```typescript
interface CourtAdapter {
  parse(html: string, url: string): Promise<Case>;
}
// Orchestrator читает config.json при каждом запуске (не кэширует)
// Добавить суд = одна запись в config.json courts[], без изменения кода
```

---

## Архитектурные решения

| Решение | Выбор | Обоснование |
|---|---|---|
| Язык | **TypeScript 5.x** | Типизированный контракт схемы Case; безопасный рефакторинг; портфолио |
| Runtime | **tsx** (без компиляции) | Простота для cron и dev; не нужен build step |
| Storage | **JSON + XLSX** | JSON — основной; XLSX автоматически при каждом парсинге (ресурсов мало) |
| Scheduler | **System cron** | Офисный сервер, простота, надёжность |
| Config | **config.json + Viewer UI** | Все настройки в одном файле; UI для оператора без редактирования файла |
| Captcha primary | **Session cookies (Puppeteer)** | Мировые суды редко инвалидируют сессию |
| Captcha fallback | **rucaptcha API** | Оплата в рублях из РФ — ключевой фактор; API совместим с 2captcha |
| Captcha fallback-2 | **2captcha API** | Резерв; тот же код, только base URL другой |
| Captcha тип | Кириллический distorted text | Подтверждено скриншотами с `*.msudrf.ru` |
| Обновление данных | 2–3 раза в неделю | Движение дел достаточно редкое |
| Fault tolerance | Exponential backoff + run-log | Серверы судов нестабильны, частые сбои (503 на msudrf.ru) |
| Адаптеры | **Раздельные per тип суда** | HTML меняется независимо; изолируем поломки |
| Viewer | **Control Panel** | Просмотр дел + настройка оркестратора через UI |
| Тестирование | Vitest (unit) + smoke-test + viewer | Unit на mock HTML; smoke — 1 URL каждого типа; viewer — визуальная валидация |
| Репо | Новый monorepo `CourtFlow` | Прототипы несут tech debt; остаются как reference |

---

## Типы судов и адаптеры

| Адаптер | Суды | delo_id | Домен | Капча | Статус |
|---|---|---|---|---|---|
| `district` | Районные | `1540005` | `{name}--{region}.sudrf.ru` | Нет (пока) | 🔴 Не написан |
| `appeal` | Областные | `5` | `oblsud--{region}.sudrf.ru` | Нет (пока) | 🔴 Не написан |
| `cassation` | Кассационные | `2800001` | `{n}kas.sudrf.ru` | Нет (пока) | 🔴 Не написан |
| `magistrate` | Мировые | `1540005` | `{n}.{region}.msudrf.ru` | **Да** | 🔴 Не написан |

> Даже если парсинг сейчас идентичен — адаптеры изолированы. Ломается один — остальные работают.

---

## config.json — структура

```json
{
  "schedule": "0 8 * * 1,3,5",
  "outputDir": "./data",
  "exportXlsx": true,
  "courts": [
    {
      "id": "sverdlov-perm",
      "type": "district",
      "enabled": true,
      "urls": ["https://sverdlov--perm.sudrf.ru/modules.php?..."]
    },
    {
      "id": "35-perm-magistrate",
      "type": "magistrate",
      "enabled": true,
      "urls": ["https://35.perm.msudrf.ru/modules.php?..."]
    }
  ],
  "captcha": {
    "sessionFile": "./data/session.json",
    "provider": "rucaptcha",
    "apiKey": "",
    "fallbackProvider": "2captcha",
    "fallbackApiKey": ""
  },
  "retry": {
    "attempts": 3,
    "backoffMs": 2000,
    "timeoutMs": 15000
  },
  "viewer": {
    "port": 3000,
    "host": "localhost"
  }
}
```

---

## Схема данных Case v1

```typescript
interface Case {
  $schema: 'courtflow/case/v1';
  uid: string;
  type: string;
  number: string;
  court: string;          // поддомен без .sudrf.ru / .msudrf.ru
  courtType: CourtType;   // 'district' | 'appeal' | 'cassation' | 'magistrate'
  identifiers: {
    delo_id: string | null;
    case_uid: string | null;
    case_type: string | null;
  };
  publishedAt: string | null;   // ISO 8601
  modifiedAt: string | null;
  card: {
    filingDate: string | null;  // YYYY-MM-DD
    category: string[];
    judge: string | null;
    hearingDate: string | null;
    result: string | null;
    proceedingType: string | null;
  };
  events: CaseEvent[];
  parties: CaseParty[];
}

type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

interface CaseEvent {
  eventName: string | null;
  eventDate: string | null;   // YYYY-MM-DD
  eventTime: string | null;
  location: string | null;
  result: string | null;
  reason: string | null;
  note: string | null;
  publishDate: string | null;
}

interface CaseParty {
  role: string | null;
  name: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  ogrnip: string | null;
}
```

---

## История сессий

### 2026-07-01 — Старт проекта, архитектура, скелет

**Что сделано:**
- Проанализированы прототипы SudRF-Parser и Court-Viewer
- Выявлены проблемы: хардкодные URL, нет retry, нет абстракции адаптеров, дублирование кода, пустой `routes/api.js`, dead config reference
- Принята финальная архитектура: адаптер-паттерн, config.json как центр управления, viewer как control panel
- Создан репо CourtFlow, создан скелет всех пакетов
- Идентифицированы 4 типа судов (district, appeal, cassation, magistrate) по delo_id из реальных URLs в urls2.txt
- Капча мировых судов: кириллический distorted text; серверы нестабильны (503)
- 503 на msudrf.ru — серверная нестабильность, не связана с капчей
- Капча срабатывает при прямом переходе по URL карточки дела (не на главной)
- Выбраны: TypeScript, tsx, rucaptcha (RUB), Vitest
- XLSX генерируется автоматически при каждом парсинге

**Открытые вопросы:**
- [ ] Финальный формат полей для экспорта в 1С
- [ ] Полный список URL всех судов (сейчас urls2.txt в SudRF-Parser)
- [ ] Частота инвалидации сессии на `*.msudrf.ru`
- [ ] Появится ли капча на районных/областных/кассационных судах
- [ ] Различия HTML структуры appeal и cassation от district

**Следующий шаг:** написать `packages/core/types.ts`, `packages/core/config.ts`, затем `adapter/district.ts`

---

## Шаблон записи сессии

```markdown
### YYYY-MM-DD — Заголовок

**Что сделано:**
- ...

**Проблемы:**
- ...

**Решения:**
- ...

**Открытые вопросы:**
- [ ] ...

**Следующий шаг:** ...
```
