# ⚖️ CourtFlow

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Windows%20%2F%20Linux-lightgrey?style=flat-square)

**Система мониторинга и сбора данных судебных дел с сайтов судов РФ**

</div>

---

## О проекте

**CourtFlow** — модульный TypeScript-парсер для автоматического сбора, нормализации и передачи данных из открытых источников судебной системы РФ.

Система работает с судами общей юрисдикции (районные, областные, кассационные, мировые) через публичные порталы `sudrf.ru` и `msudrf.ru`, обходит защиту, нормализует данные в единую типизированную схему и экспортирует для downstream-систем (1С и др.). Управление — через встроенный веб-интерфейс.

## Архитектура

```
config.json  ←  единая точка настройки
     ↓
[orchestrator]  ←→  [run-log.json]
     ↓
[parser engine]
  ├── adapter: district    (районные,    delo_id=1540005)
  ├── adapter: appeal      (областные,   delo_id=5)
  ├── adapter: cassation   (кассация,    delo_id=2800001)
  └── adapter: magistrate  (мировые + captcha)
     ↓
[normalizer]  →  Case v1 (TypeScript interface)
     ↓
[exporter]
  ├── JSON  →  cases-{court}-{date}.json
  └── XLSX  →  cases-{court}-{date}.xlsx  (автоматически)
     ↓
[viewer / control panel]
  ├── /cases   — таблица дел
  ├── /config  — настройка оркестратора через UI
  ├── /run     — ручной запуск парсинга
  └── /logs    — run-log в читаемом виде
```

## Возможности

- 🏛️ 4 типа судов — каждый в изолированном адаптере
- 🔐 Двухуровневая стратегия капчи: Puppeteer session → rucaptcha → 2captcha
- 🔄 Fault tolerance: exponential backoff, per-court timeout, run-log
- 📦 JSON + автоматический XLSX при каждом парсинге
- ⚙️ Управление через `config.json` и веб-интерфейс
- 📅 System cron, 2–3 раза в неделю
- 🚀 Self-hosted, без внешней инфраструктуры

## Структура проекта

```
CourtFlow/
├── packages/
│   ├── core/           # types.ts, config.ts, retry.ts
│   ├── adapters/       # district.ts, appeal.ts, cassation.ts, magistrate.ts
│   ├── captcha/        # session.ts, solver.ts
│   ├── scheduler/      # orchestrator.ts
│   ├── exporter/       # json.ts, xlsx.ts
│   └── viewer/         # server.ts, public/
├── data/               # output JSON + XLSX
├── logs/               # run-log.json
├── config.json         # конфигурация системы
├── CONTEXT.md          # контекст проекта для LLM и разработчиков
└── README.md
```

## Поддерживаемые источники

| Тип суда | Домен | delo_id | Капча | Статус |
|---|---|---|---|---|
| Районные | `*.sudrf.ru` | 1540005 | Нет | 🟡 В разработке |
| Областные | `oblsud--*.sudrf.ru` | 5 | Нет | 🟡 В разработке |
| Кассационные | `*.kas.sudrf.ru` | 2800001 | Нет | 🟡 В разработке |
| Мировые | `*.msudrf.ru` | 1540005 | Да (кириллица) | 🟡 В разработке |
| Арбитражные | `*.arbitr.ru` | TBD | TBD | 🔵 Запланировано |

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtFlow.git
cd CourtFlow
npm install

# Запуск viewer / control panel
npx tsx packages/viewer/server.ts

# Ручной запуск парсинга
npx tsx packages/scheduler/orchestrator.ts

# Тесты
npm test

# Smoke-test (1 URL каждого типа суда)
npm run test:smoke

# Cron (пн/ср/пт в 08:00)
# 0 8 * * 1,3,5 cd /path/to/CourtFlow && npx tsx packages/scheduler/orchestrator.ts >> logs/cron.log 2>&1
```

## Зависимости

| Пакет | Назначение |
|---|---|
| `tsx` | TypeScript runtime (без компиляции) |
| `cheerio` | HTML-парсинг |
| `iconv-lite` | Декодирование windows-1251 |
| `node-fetch` | HTTP-запросы |
| `puppeteer` | Браузерная автоматизация (капча) |
| `exceljs` | Генерация XLSX |
| `express` | Viewer / Control Panel |
| `vitest` | Unit-тесты |

## Связанные репозитории

- [SudRF-Parser](https://github.com/AlexanderKuzikov/SudRF-Parser) — прототип парсера (reference)
- [Court-Viewer](https://github.com/AlexanderKuzikov/Court-Viewer) — прототип viewer (reference)

## Лицензия

[Apache 2.0](LICENSE)
