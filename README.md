# ⚖️ CourtFlow

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Windows%20%2F%20Linux-lightgrey?style=flat-square)

**Система мониторинга и сбора данных судебных дел с сайтов судов РФ**

</div>

---

## О проекте

**CourtFlow** — модульный TypeScript-парсер для автоматического сбора, нормализации и передачи данных из открытых источников судебной системы РФ.

Система работает с судами общей юрисдикции (районные, мировые) через публичные порталы `sudrf.ru`, обходит защиту, нормализует данные в единую типизированную схему и экспортирует для downstream-систем (1С и др.).

## Архитектура

```
[cron / scheduler]
        ↓
[orchestrator]  ←→  [run-log.json]  (fault tolerance)
        ↓
[parser engine]
  ├── adapter: sudrf-district    (районные суды)
  └── adapter: sudrf-magistrate  (мировые суды + captcha)
        ↓
[normalizer]  →  единая схема Case v1 (TypeScript interface)
        ↓
[storage]  →  cases-{court_id}-{YYYY-MM-DD}.json
        ↓
[exporter]  →  1С / внешние системы
```

## Возможности

- 🏛️ Поддержка районных судов (`*.sudrf.ru`) — HTML-парсинг через Cheerio
- ⚖️ Поддержка мировых судов (`*.msudrf.ru`) — с обходом капчи
- 🔐 Двухуровневая стратегия капчи: session cookies (Puppeteer) → rucaptcha API fallback
- 🔄 Fault tolerance: exponential backoff, per-court timeout, run-log
- 📦 Нормализованный JSON-output с версионированием схемы
- 📅 Запуск через system cron (2–3 раза в неделю)
- 🚀 Self-hosted на офисном сервере без внешней инфраструктуры

## Структура проекта

```
CourtFlow/
├── packages/
│   ├── core/           # интерфейс Case, утилиты, retry-логика
│   ├── adapters/
│   │   ├── sudrf/      # районные суды
│   │   └── magistrate/ # мировые суды + captcha
│   ├── captcha/        # session manager + rucaptcha/2captcha fallback
│   ├── scheduler/      # orchestrator + fault tolerance
│   └── exporter/       # JSON writer, 1С адаптер
├── data/               # output JSON
├── logs/               # run-log.json
├── CONTEXT.md          # контекст проекта для LLM и разработчиков
└── README.md
```

## Поддерживаемые источники

| Тип суда | Домен | Капча | Статус |
|---|---|---|---|
| Районные суды | `*.sudrf.ru` | Нет (пока) | 🟡 В разработке |
| Мировые суды | `*.msudrf.ru` | Да (кириллица, distorted) | 🟡 В разработке |
| Арбитражные суды | `*.arbitr.ru` | TBD | 🔵 Запланировано |

## Схема данных (Case v1)

```typescript
interface Case {
  $schema: 'courtflow/case/v1';
  uid: string;
  type: string;
  number: string;
  court: string;
  identifiers: { delo_id: string | null; case_uid: string | null; case_type: string | null };
  publishedAt: string | null;  // ISO 8601
  modifiedAt: string | null;
  card: {
    filingDate: string | null;
    category: string[];
    judge: string | null;
    hearingDate: string | null;
    result: string | null;
    proceedingType: string | null;
  };
  events: CaseEvent[];
  parties: CaseParty[];
}
```

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtFlow.git
cd CourtFlow
npm install

# Dev-запуск (tsx, без компиляции)
npx tsx packages/adapters/sudrf/batch-parse.ts

# Запуск через cron (пример: пн/ср/пт в 08:00)
# 0 8 * * 1,3,5 cd /path/to/CourtFlow && npx tsx packages/scheduler/run.ts >> logs/cron.log 2>&1
```

## Зависимости

| Пакет | Назначение |
|---|---|
| `tsx` | TypeScript runtime (dev + cron) |
| `node-fetch` | HTTP-запросы |
| `cheerio` | HTML-парсинг |
| `iconv-lite` | Декодирование windows-1251 |
| `puppeteer` | Браузерная автоматизация (сессия капчи) |
| `rucaptcha-client` | Решение капчи (rucaptcha primary, 2captcha fallback) |

## Связанные репозитории

- [SudRF-Parser](https://github.com/AlexanderKuzikov/SudRF-Parser) — прототип парсера (reference)
- [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) — веб-интерфейс просмотра дел

## Лицензия

[Apache 2.0](LICENSE)
