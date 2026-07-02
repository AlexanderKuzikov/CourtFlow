# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репо. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Парсит карточки дел с sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Node.js 24, TypeScript 6, ESM, `tsx` без сборки.

- Разработка: Windows 11 (PowerShell)
- Целевой сервер: **Ubuntu Linux**
- Менеджер процессов на Linux: **pm2** (`ecosystem.config.cjs` есть в репо)

## Текущее состояние (2026-07-02)

### ✅ Всё работает на Windows
- `npm run parse` — **26/26 дел, 100% success** (district + appeal + cassation + magistrate)
- `npm start` — web-viewer работает
- RuCaptcha API v2: `createTask`/`getTaskResult`, `api.rucaptcha.com`, баланс есть
- Puppeteer + `--ignore-certificate-errors` — мировые суды проходят (цепочка капча → RuCaptcha → HTML)
- MagistrateAdapter: `uid` = судебный номер дела, 5 колонок событий, filingDate/hearingDate/result
- courts.json: справочник судов с контактами

### ⏳ Очередь задач

1. **Linux-деплой** — завтра утром демо. Инструкция полностью в `LINUX_DEPLOY.md`.
2. **BUG-019** — удалить заглушку `packages/captcha/solver.ts` (не используется, не блокер)
3. **XLSX** — реализовать `packages/exporter/xlsx.ts` (exceljs уже в зависимостях)

## Что было сделано в последней сессии (2026-07-02)

- **BUG-020 закрыт**: `ERR_CERT_COMMON_NAME_INVALID` — wildcard `*.msudrf.ru` не покрывает `35.perm.msudrf.ru`. Фикс: `--ignore-certificate-errors`
- **BUG-017 закрыт**: MagistrateAdapter — uid=caseNumber, events 5 колонок, filingDate/hearingDate/result, индексы строк сторон
- **BUG-016 закрыт**: magistrate end-to-end подтверждён логами (8 участков, 12/12 дел, success)
- **BUG-022 закрыт**: `Locator.getAttribute` → `page.$eval`
- **BUG-021 закрыт**: `puppeteer.Page` namespace → `import { type Page }`
- **BUG-018 закрыт**: `response.buffer()` → `page.evaluate(fetch)`
- Добавлен `ecosystem.config.cjs` (pm2: viewer постоянный + parser `cron 0 */6 * * *`)
- Добавлен `LINUX_DEPLOY.md` (полная инструкция для Ubuntu)

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
