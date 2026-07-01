# CourtFlow — Контекст проекта

> Этот файл — **основной источник контекста** для LLM и разработчиков при переключении сессий, моделей, аккаунтов.
> Обновляется каждую сессию. Структура: TL;DR вверху → детали ниже.

---

## ⚡ TL;DR для быстрого онбординга LLM

```
Проект:    CourtFlow — парсер судебных дел РФ
Репо:      https://github.com/AlexanderKuzikov/CourtFlow
Стек:      TypeScript 5.x, Node.js 22, Cheerio, Puppeteer, tsx
Капча:     rucaptcha (primary, оплата в RUB) → 2captcha (fallback)
Storage:   JSON-файлы, без БД
Scheduler: system cron, 2–3 раза в неделю
Деплой:    офисный сервер (Windows/Linux), без облака
Downstream: данные передаются в 1С (формат согласуется)
Статус:    архитектура зафиксирована, код не написан
Следующий шаг: создать скелет packages/, написать core/types.ts
```

**Прототипы (reference, не трогать):**
- [SudRF-Parser](https://github.com/AlexanderKuzikov/SudRF-Parser) — рабочий парсер районных судов на JS
- [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) — Express viewer с REST API

**Структура целевого репо:**
```
packages/core/           ← интерфейсы Case, retry, утилиты
packages/adapters/sudrf/ ← районные суды *.sudrf.ru
packages/adapters/magistrate/ ← мировые суды *.msudrf.ru + капча
packages/captcha/        ← session cookies + rucaptcha/2captcha
packages/scheduler/      ← orchestrator, fault tolerance, run-log
packages/exporter/       ← JSON writer, будущий 1С адаптер
data/                    ← output JSON
logs/                    ← run-log.json
```

**Ключевой контракт адаптера:**
```typescript
interface CourtAdapter {
  parse(html: string, url: string): Promise<Case>;
}
```

---

## Архитектурные решения

| Решение | Выбор | Обоснование |
|---|---|---|
| Язык | **TypeScript 5.x** | Типизированный контракт схемы Case; безопасный рефакторинг; портфолио |
| Runtime | **tsx** (без компиляции) | Простота для cron и dev; не нужен build step |
| Storage | **JSON-файлы** | Нет смысла в БД для «горячих» данных; downstream — 1С |
| Scheduler | **System cron** | Офисный сервер, простота, надёжность |
| Captcha primary | **Session cookies (Puppeteer)** | Мировые суды редко инвалидируют сессию |
| Captcha fallback | **rucaptcha API** | Оплата в рублях из РФ — ключевой фактор; API совместим с 2captcha |
| Captcha fallback-2 | **2captcha API** | Резерв; тот же код, только base URL другой |
| Captcha тип | Кириллический distorted text | Подтверждено скриншотами с `*.msudrf.ru` |
| Обновление данных | 2–3 раза в неделю | Движение дел достаточно редкое |
| Fault tolerance | Exponential backoff + run-log | Серверы судов нестабильны, частые сбои |
| Адаптеры | Раздельные per тип суда | HTML районных и мировых меняется независимо |
| Репо | Новый monorepo `CourtFlow` | Прототипы несут tech debt; остаются как reference |

---

## Схема данных Case v1

```typescript
interface Case {
  $schema: 'courtflow/case/v1';
  uid: string;
  type: string;
  number: string;
  court: string;  // поддомен без .sudrf.ru / .msudrf.ru
  identifiers: {
    delo_id: string | null;
    case_uid: string | null;
    case_type: string | null;
  };
  publishedAt: string | null;  // ISO 8601
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

### 2026-07-01 — Старт проекта, архитектура

**Что сделано:**
- Проанализированы прототипы SudRF-Parser и Court-Viewer
- Выявлены проблемы прототипов: хардкодные URL, нет retry, нет абстракции адаптеров, дублирование кода парсинга, пустой `routes/api.js`, dead config reference на `scraper-incremental.js`
- Принята архитектура с адаптер-паттерном под разные типы судов
- Создан репо CourtFlow
- Зафиксированы все архитектурные решения (см. таблицу выше)
- Капча мировых судов идентифицирована: кириллический distorted text (скриншоты с `35.perm.msudrf.ru`)
- Выбран TypeScript как основной язык
- Выбран rucaptcha как primary капча-сервис (оплата в RUB из РФ)

**Открытые вопросы:**
- [ ] Финальный формат и поля для экспорта в 1С (согласовывается отдельно)
- [ ] Полный список URL мировых судов
- [ ] Частота инвалидации сессии на `*.msudrf.ru` — требует тестирования
- [ ] Появится ли капча на районных судах — мониторим
- [ ] HTML структура мировых судов отличается от районных — требует анализа

**Следующий шаг:** создать скелет `packages/`, написать `core/types.ts`

---

## Источники данных

| Тип | Домен | Пример URL дела |
|---|---|---|
| Районные суды | `{name}--{region}.sudrf.ru` | `dzerjin--perm.sudrf.ru` |
| Мировые суды | `{number}.{region}.msudrf.ru` | `35.perm.msudrf.ru` |
| Арбитраж | `{region}.arbitr.ru` | — (запланировано) |

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
