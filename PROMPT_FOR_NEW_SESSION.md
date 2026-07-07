# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репо. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Парсит карточки дел с sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Node.js 24, TypeScript 6, ESM, `tsx` без сборки.

- Разработка: Windows 11 (PowerShell)
- Целевой сервер: **Ubuntu Linux**
- Менеджер процессов на Linux: **pm2**



## Текущее состояние (2026-07-07)
- `npm run parse` — **26/26 дел, 100% success**
- `npm run parse -- --retry` — retry только для stale URL
- `npm start` — web-viewer работает
- Linux-деплой и демонстрация — успешны
- `watch/` — основной источник URL для мониторинга
- `watch/` принимает текст, JSON, CSV, файлы без расширения, ссылки в кавычках и ссылки разделённые пробелами
- Если `watch/` пуста — fallback на `urls.txt`
- UI показывает только активные суды из `watch/`
- В UI есть ручной запуск full-run и retry-run
- `courtflow-parser-retry` есть в pm2-конфиге
- RuCaptcha API v2 работает
- Puppeteer + `--ignore-certificate-errors` закрывает msudrf

### ⏳ Очередь задач

1. **XLSX** — реализовать `packages/exporter/xlsx.ts` (низкий приоритет)
2. При необходимости — архивирование/очистка старых `data/*.json`
3. При необходимости — уведомления по stale/failed URL

## Что было сделано в последней сессии (2026-07-07)

- **BUG-019 закрыт**: удалён `packages/captcha/solver.ts`
- Добавлен `watch/` как основной источник URL
- `packages/core/urls.ts` переписан: fuzzy extraction из text/JSON/CSV/space-separated input
- Добавлен reconciliation: `/api/cases` показывает только активные courtId
- Добавлен `/api/active-courts`
- Добавлен `scheduleRetry` + `staleThresholdH` в `config.json`
- `packages/scheduler/orchestrator.ts` получил `--retry` режим по `run-log-*.json`
- `ecosystem.config.cjs`: добавлен `courtflow-parser-retry`
- `packages/viewer/server.ts`: добавлены `/api/run/retry`, `/api/run/enrich-courts`, новый `/api/run/status`
- `packages/viewer/public/index.html`: управление full/retry прогонами и статусами
- `LINUX_DEPLOY.md`, `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` обновлены

## Правила работы

- Не объясняй базовые концепции — пользователь архитектор
- Трогай только то что нужно, без рефакторинга соседнего кода
- Фиксируй баги в `BUG_REPORT.md`, решения в `DECISIONS.md`, состояние в `CONTEXT.md` после каждого шага
- Операционные файлы (`.env`, `urls.txt`) не пушать
- `data/` не пушать, `logs/` (кроме `orchestrator.lock`) — пушать
- `PUPPETEER_HEADLESS=false` — только локальная диагностика, не пушать в `.env`
- Промпт для новой сессии обновлять в конце каждой сессии

## Файлы для обязательного чтения

1. `CONTEXT.md`
2. `BUG_REPORT.md`
3. `DECISIONS.md`
4. `LINUX_DEPLOY.md`
5. `ecosystem.config.cjs`

- **Code Review пройдён полностью:** все пункты разобраны, изменения внесены напрямую в GitHub
- - BUG-023 закрыт: убран `decodeEntities: false` из 5 файлов адаптеров + courts.ts
  - - BUG-024 закрыт: исправлена типизация `CourtType` в orchestrator.ts
    - - BUG-025 закрыт: stale lock после SIGKILL/OOM — `process.kill(pid, 0)` проверка живости PID
      - - BUG-026 закрыт: добавлен graceful shutdown в viewer/server.ts (SIGTERM/SIGINT)
        - - Ответ на ревю добавлен в CODE_REVIEW.md: принято/отклонено/отложено, пункт 10 (magistrate courtId) отклонён с аргументацией
