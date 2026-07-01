# ⚖️ CourtFlow

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Windows%20%2F%20Linux-lightgrey?style=flat-square)

**Система мониторинга и сбора данных судебных дел с сайтов судов РФ**

</div>

---

## О проекте

**CourtFlow** — модульный парсер-мониторинг судебных дел, ориентированный на автоматический сбор, нормализацию и передачу данных из открытых источников судебной системы РФ.

Система работает с судами общей юрисдикции (районные, мировые) через публичные порталы `sudrf.ru`, обходит защиту, нормализует данные в единую схему и экспортирует для downstream-систем (1С и др.).

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
[normalizer]  →  единая схема Case v1
        ↓
[storage]  →  cases-{court_id}-{YYYY-MM-DD}.json
        ↓
[exporter]  →  1С / внешние системы
```

## Возможности

- 🏛️ Поддержка районных судов (`*.sudrf.ru`) — HTML-парсинг через Cheerio
- ⚖️ Поддержка мировых судов (`*.msudrf.ru`) — с обходом капчи
- 🔐 Двухуровневая стратегия капчи: session cookies → 2captcha API fallback
- 🔄 Fault tolerance: exponential backoff, per-court timeout, run-log
- 📦 Нормализованный JSON-output с версионированием схемы
- 📅 Запуск через system cron (2–3 раза в неделю)
- 🚀 Готов к работе на офисном сервере без внешних зависимостей инфраструктуры

## Структура проекта

```
CourtFlow/
├── packages/
│   ├── core/           # схема Case, утилиты, retry-логика
│   ├── adapters/
│   │   ├── sudrf/      # районные суды
│   │   └── magistrate/ # мировые суды + captcha
│   ├── captcha/        # session manager + 2captcha fallback
│   ├── scheduler/      # orchestrator + fault tolerance
│   └── exporter/       # JSON writer, 1С адаптер
├── data/               # output JSON
├── logs/               # run-log.json
├── CONTEXT.md          # дневник работ и архитектурных решений
└── README.md
```

## Поддерживаемые источники

| Тип суда | Домен | Капча | Статус |
|---|---|---|---|
| Районные суды | `*.sudrf.ru` | Нет (пока) | 🟡 В разработке |
| Мировые суды | `*.msudrf.ru` | Да (кириллица, distorted) | 🟡 В разработке |
| Арбитражные суды | `*.arbitr.ru` | TBD | 🔵 Запланировано |

## Схема данных (Case v1)

```json
{
  "$schema": "courtflow/case/v1",
  "uid": "33da2016-4ca9-407d-8528-8cc01f0fc719",
  "type": "Гражданское дело",
  "number": "2-1234/2025",
  "court": "dzerjin--perm",
  "identifiers": { "delo_id": "1540005", "case_uid": "...", "case_type": null },
  "publishedAt": "2025-08-19T10:00:00",
  "modifiedAt": "2025-09-01T14:30:00",
  "card": {
    "filingDate": "2025-01-15",
    "category": ["Споры, возникающие из договоров"],
    "judge": "Иванов И.И.",
    "hearingDate": "2025-09-10",
    "result": null,
    "proceedingType": null
  },
  "events": [],
  "parties": []
}
```

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtFlow.git
cd CourtFlow
npm install

# Одиночный запуск (список URL из urls.txt)
node packages/adapters/sudrf/batch-parse.js

# Запуск через cron (пример: пн/ср/пт в 08:00)
# 0 8 * * 1,3,5 cd /path/to/CourtFlow && node packages/scheduler/run.js >> logs/cron.log 2>&1
```

## Зависимости

| Пакет | Назначение |
|---|---|
| `node-fetch` | HTTP-запросы |
| `cheerio` | HTML-парсинг |
| `iconv-lite` | Декодирование windows-1251 |
| `puppeteer` | Браузерная автоматизация (капча) |

## Связанные репозитории

- [SudRF-Parser](https://github.com/AlexanderKuzikov/SudRF-Parser) — прототип парсера (reference)
- [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) — веб-интерфейс просмотра дел

## Лицензия

[Apache 2.0](LICENSE)
