# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репо. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Парсит карточки дел с sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Node.js 24, TypeScript 6, ESM, `tsx` без сборки.

- Разработка: Windows 11 (PowerShell)
- Целевой сервер: **Ubuntu Linux**
- Менеджер процессов на Linux: **pm2** (`ecosystem.config.cjs` есть в репо)

## Текущее состояние (2026-07-06)

### ✅ Всё работает
- `npm run parse` — **26/26 дел, 100% success** (district + appeal + cassation + magistrate)
- `npm run parse -- --retry` — только stale URL (lastSuccess > staleThresholdH часов)
- `npm start` — web-viewer работает
- Linux-деплой и демонстрация — успешны
- RuCaptcha API v2: `createTask`/`getTaskResult`, `api.rucaptcha.com`
- Puppeteer + `--ignore-certificate-errors` — мировые суды проходят
- MagistrateAdapter: uid = судебный номер, 5 колонок, filingDate/hearingDate/result
- courts.json: справочник судов с контактами
- watch/ папка: источник URL для мониторинга (fuzzy нормализатор)
- Two-tier scheduling: основной прогон + retry (только stale URL)
- Reconciliation: UI показывает только суды из watch/

### ⏳ Очередь задач

1. **LINUX_DEPLOY.md** — обновить: courtflow-parser-retry, watch/ папка
2. **XLSX** — реализовать `packages/exporter/xlsx.ts` (низкий приоритет)

## Что было сделано в последней сессии (2026-07-06)

- **Linux-деплой** + демонстрация — успешно
- **BUG-019 закрыт**: удалён `solver.ts`
- **watch/ папка**: новый источник URL, fuzzy нормализатор (кавычки, разделители, схема)
- **Reconciliation**: `/api/cases` фильтрует только активные courtId из watch/
- **`/api/active-courts`**: новый эндпоинт — точный список судов в мониторинге
- **Two-tier scheduling**: `scheduleRetry` + `staleThresholdH` в config.json
- **`--retry` флаг** в оркестраторе: читает run-log, парсит только stale URL
- **`courtflow-parser-retry`** в ecosystem.config.cjs

## Правила работы

- Не объясняй базовые концепции — пользователь архитектор
- Трогай только то что нужно, без рефакторинга соседнего кода
- Фиксируй баги в `BUG_REPORT.md`, решения в `DECISIONS.md`, состояние в `CONTEXT.md` после каждого шага
- Операционные файлы (`.env`, `urls.txt`) не пушать
- `data/` не пушать, `logs/` (кроме `orchestrator.lock`) — пушать
- `PUPPETEER_HEADLESS=false` — только локальная диагностика, не пушать в `.env`
- Промпт для новой сессии обновлять в конце каждой сессии

## Файлы для обязательного чтения

1. `CONTEXT.md` — текущее состояние и архитектура
2. `BUG_REPORT.md` — все баги
3. `DECISIONS.md` — архитектурные решения
4. `LINUX_DEPLOY.md` — инструкция по деплою (Ubuntu + pm2)
5. `ecosystem.config.cjs` — pm2-конфиг
