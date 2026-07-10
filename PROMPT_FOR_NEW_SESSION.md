# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репо. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Парсит карточки дел с sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Node.js 24, TypeScript 6, ESM, `tsx` без сборки.

- Разработка: Windows 11 (PowerShell)
- Целевой сервер: **Ubuntu Linux**
- Менеджер процессов на Linux: **pm2**



## Текущее состояние (2026-07-10)
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
2. **Singleton browser** — кешировать `browser`/`page` для magistrate в пределах прогона
3. При необходимости — архивирование/очистка старых `data/*.json`
4. При необходимости — уведомления по stale/failed URL

## Что было сделано в последней сессии (2026-07-10)

- **Code Review #2**: полный аудит кода, зафиксирован в CODE_REVIEW.md
- **Документация синхронизирована**: README (переписан), CONTEXT (дата/очередь), AUDIT_REPORT (баннер устаревания), RUCAPTCHA_GUIDE (синхронизация кода), HTML_STRUCTURE (дата)
- **B1 закрыт**: `courtType: any` → `CourtType` в enrich-courts.ts
- **B2 закрыт**: Promise.race leak → AbortController в orchestrator.ts
- **V1 закрыт**: fallback UID из `case_id` в magistrate.ts
- **V3 закрыт**: fallback captcha provider (2captcha) в loadCaseHtml
- **V4 закрыт**: magistrate тест через cached HTML в smoke.ts (если `logs/magistrate-last.html` существует)
- **V5 закрыт**: unit-тесты `urls.test.ts` — 19 тестов (`extractUrls`, `detectCourtType`, `extractCourtId`)
- **S2 закрыт**: хардкод «urls.txt» → «Всего URL» в smoke.ts
- **S9 закрыт**: дата PROMPT_FOR_NEW_SESSION → 2026-07-10
- **S10 закрыт**: хардкод «ОК: 26» → «все URL» в LINUX_DEPLOY.md

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

- **Code Review #2 (2026-07-10):** 2 блокера + 5 важных пунктов закрыты. Подробности в `CODE_REVIEW.md`.
- BUG-023..026 закрыты (code review #1)
- Первые unit-тесты: `packages/core/urls.test.ts` (19 тестов, `npm test`)
