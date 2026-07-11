# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репо. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Парсит карточки дел с sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Node.js 24 LTS, TypeScript 7.0, ESM, `tsx` без сборки.

- Разработка: Windows 11 (PowerShell)
- Целевой сервер: **Ubuntu Linux**
- Менеджер процессов на Linux: **pm2**

## Экосистема (важно!)

CourtFlow — часть экосистемы из 5+ проектов в `D:\GitHub\`:
- **Court-Harvester** — каталог 10 206 судов РФ (DaData API)
- **FIAS-parser** — привязка адресов к ГАР/OKTMO
- **SudRF-Parser** — легаси-парсер (cheerio)
- **Court-Viewer** — легаси-вьюер (Express)
- **court-data** — репо-хранилище JSON

План: CourtFlow интегрируется с Court-Harvester (каталог судов) и CRM для юристов.

## Текущее состояние (2026-07-11)

### Работает
- `npm run parse` — **26/26 дел, 100% success**
- `npm run parse -- --retry` — retry только для stale URL
- `npm start` — web-viewer (авто-поиск порта, по умолчанию 8791)
- `npm run tui` — терминальный дашборд на blessed (SSH, терминал)
- `npm test` — 19/19 unit-тестов
- Linux-деплой и демонстрация — успешны
- `watch/` — основной источник URL, fallback `urls.txt`
- `watch/` принимает текст, JSON, CSV, файлы без расширения
- UI показывает только активные суды из `watch/`
- Браузерный UI и TUI: ручной запуск full-run и retry-run
- RuCaptcha API v2 + Puppeteer для msudrf
- UID ГАС «Правосудие» — источник истины уникальности дела
- dotenv удалён — .env через `process.loadEnvFile()`
- Порт 8791, авто-поиск свободного → `logs/.port`
- Все пакеты обновлены: TS 7.0.2, Puppeteer 25, Vitest 4, @types/node@24

### Сделано в сессии 2026-07-11
- **TUI**: `packages/cli/tui.ts` — blessed list с `│`-разделителями, выделение white+black, скролл, индикатор сервера
- **HTTP-клиент**: `packages/cli/client.ts` — читает `logs/.port`
- **dotenv** → `process.loadEnvFile()`
- **Порт**: 3000 → 8791, авто-поиск
- **Пакеты**: все обновлены до latest stable
- **README**: переписан (бэджи, Apache-2.0)
- **Tauri**: отклонён
- **Доки**: CONTEXT, DECISIONS, PROMPT, LINUX, RUCAPTCHA обновлены

### ⏳ Очередь задач
1. Интеграция Court-Harvester — замена courts.json
2. UID → courtId — извлечение кода суда из UID
3. POST /api/urls — программная подача URL
4. externalId / relatedUids — поля для CRM
5. XLSX exporter (низкий приоритет)
6. Singleton browser для magistrate
7. Rate-limiting

## Правила работы

- Не объясняй базовые концепции — пользователь архитектор
- Трогай только то что нужно, без рефакторинга соседнего кода
- Фиксируй баги в `BUG_REPORT.md`, решения в `DECISIONS.md`, состояние в `CONTEXT.md`
- Операционные файлы (`.env`, `urls.txt`, `logs/.port`) не пушить
- `data/` не пушить, `logs/` кроме `orchestrator.lock` и `.port` — пушить
- `PUPPETEER_HEADLESS=false` — только локальная диагностика
- Промпт для новой сессии обновлять в конце каждой сессии

## Файлы для обязательного чтения

1. `CONTEXT.md`
2. `BUG_REPORT.md`
3. `DECISIONS.md`
4. `LINUX_DEPLOY.md`
5. `ecosystem.config.cjs`
