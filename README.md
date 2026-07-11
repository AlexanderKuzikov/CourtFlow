<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Node-24.15_LTS-339933?logo=node.js&logoColor=white">
    <img alt="Node 24 LTS" src="https://img.shields.io/badge/Node-24.15_LTS-339933?logo=node.js&logoColor=white">
  </picture>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
</p>
<p align="center">
  <img alt="Express 5" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white">
  <img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white">
  <img alt="Cheerio 1" src="https://img.shields.io/badge/Cheerio-1.x-E88E1F?logo=html5&logoColor=white">
  <img alt="blessed" src="https://img.shields.io/badge/TUI-blessed-555?logo=windowsterminal&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/Platform-Windows_|_Linux-808080?logo=linux&logoColor=white">
</p>

<h1 align="center">CourtFlow</h1>
<p align="center">Автоматический мониторинг судебных дел РФ</p>

---

Парсит карточки дел с сайтов `sudrf.ru` и `msudrf.ru`, накапливает историю изменений в JSON, отображает через браузерный UI или терминальный дашборд.

## Возможности

- **4 типа судов** — районные, апелляционные, кассационные, мировые
- **Автоматическая капча** — RuCaptcha API v2 для `msudrf.ru` (Puppeteer)
- **Два интерфейса** — браузерный (Express) и терминальный (blessed)
- **История изменений** — события, участники, судьи, результаты заседаний
- **Справочник судов** — адреса, телефоны, email (автозаполнение)
- **Гибкий источник URL** — папка `watch/` принимает `.txt`, `.json`, `.csv`, ссылки в любом формате
- **Двухуровневый парсинг** — полный прогон + retry только устаревших дел
- **No-build** — запуск через `tsx` без компиляции

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtFlow.git
cd CourtFlow
cp .env.example .env          # прописать RUCAPTCHA_API_KEY

npm install
npm run enrich:courts         # заполнить справочник судов
npm run test:smoke            # проверка адаптеров
npm run parse                 # первый прогон

npm start                     # браузерный UI
# или
npm run tui                   # терминальный дашборд
```

## Интерфейсы

### Браузерный UI (`npm start`)

Express-сервер на порту из `config.json` (по умолчанию **8791**, авто-поиск если занят).
Три вкладки: дела (таблица + поиск + детали), логи запусков, ручное управление прогонами.

### Терминальный дашборд (`npm run tui`)

blessed-дашборд для SSH/терминала — те же возможности что и браузерный UI:

| Клавиша | Действие |
|---|---|
| `↑↓` | Навигация по строкам |
| `Enter` | Детали дела |
| `/` | Поиск по номеру/судье/суду |
| `F` | Фильтр по типу суда |
| `Tab` | Смена вкладки (дела / логи / запуск) |
| `R` | Обновить данные |
| `Q` | Выход |

Удалённое подключение: `npm run tui -- --api http://server-ip:8791`

## Команды

| Команда | Описание |
|---|---|
| `npm start` | Браузерный UI |
| `npm run tui` | Терминальный дашборд |
| `npm run parse` | Полный прогон всех URL |
| `npm run parse -- --retry` | Retry-прогон (только устаревшие URL) |
| `npm run test:smoke` | Проверка адаптеров |
| `npm run enrich:courts` | Заполнить справочник судов |
| `npm test` | Unit-тесты |

## Типы судов

| Тип | Домен | Капча |
|---|---|---|
| `district` | `*.sudrf.ru` | нет |
| `appeal` | `oblsud--*.sudrf.ru` | нет |
| `cassation` | `*kas.sudrf.ru` | нет |
| `magistrate` | `*.msudrf.ru` | image → RuCaptcha API v2 |

## Настройка

| Файл | Назначение |
|---|---|
| `config.json` | Расписание, порт, retry-настройки |
| `.env` | `RUCAPTCHA_API_KEY`, `TWOCAPTCHA_API_KEY` |
| `watch/` | Папка с URL для мониторинга (любой текстовый формат) |
| `courts.json` | Справочник судов (автозаполняемый) |

## Источник URL (`watch/`)

Поместите файлы со ссылками в папку `watch/`. Поддерживаются `.txt`, `.json`, `.csv`, файлы без расширения. Ссылки разделяются пробелами, табами, переносами, `;`, `|`. Кавычки и JSON-синтаксис игнорируются. Дубликаты автоматически удаляются. Удаление файла = прекращение мониторинга.

При пустой `watch/` используется `urls.txt` в корне проекта.

## Linux / pm2

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

Три процесса:
- `courtflow-viewer` — web-viewer (постоянно)
- `courtflow-parser` — основной прогон (`0 8 * * 1,3,5`)
- `courtflow-parser-retry` — retry-прогон (`0 11,14 * * 1,3,5`)

SSH-туннель для удалённого TUI: `ssh -L 8791:localhost:8791 user@server`

## Архитектура

```
packages/
├── core/           # Типы, конфиг, URL-парсер, retry
├── adapters/       # Парсеры: district, appeal, cassation, magistrate
├── captcha/        # RuCaptcha API v2 + Puppeteer-сессия
├── scheduler/      # Оркестратор, smoke-тест, enrich-courts
├── viewer/         # Express-сервер + браузерный UI
├── cli/            # TUI-клиент (blessed) + общий HTTP-клиент
└── exporter/       # JSON merge (XLSX — в планах)
```

## Документация

- `CONTEXT.md` — архитектура и текущее состояние
- `DECISIONS.md` — принятые архитектурные решения (ADR)
- `LINUX_DEPLOY.md` — инструкция по деплою на Ubuntu
- `CODE_REVIEW.md` — журнал code review
- `BUG_REPORT.md` — журнал ошибок
- `PROMPT_FOR_NEW_SESSION.md` — инструкция для AI-сессии

## Лицензия

[Apache License 2.0](LICENSE)
