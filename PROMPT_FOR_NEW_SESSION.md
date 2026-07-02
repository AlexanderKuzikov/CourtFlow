# Промпт для новой AI-сессии — CourtFlow

> Скопируй этот текст целиком в первое сообщение новой сессии.

---

Я — AI-архитектор, работаю над проектом **CourtFlow** (GitHub: `AlexanderKuzikov/CourtFlow`). У тебя есть MCP-доступ к репозиторию. Сначала прочитай `CONTEXT.md`, `DECISIONS.md`, `BUG_REPORT.md`, `HTML_STRUCTURE.md` из корня репо.

## Контекст проекта

CourtFlow — система мониторинга судебных дел РФ. Node.js 24, TypeScript 6, ESM, `tsx` без сборки. Парсит sudrf.ru (районные, апелляционные, кассационные) и msudrf.ru (мировые). Запуск сейчас на Windows 11, целевой сервер — Linux.

## Что работает

- `npm run parse` — district / appeal / cassation: **все 13 дел OK**
- `npm start` — web-viewer работает
- RuCaptcha API v2 реализован (`api.rucaptcha.com`, `createTask`/`getTaskResult`)
- RUCAPTCHA_API_KEY заполнен в `.env`, баланс есть

## Главная проблема — BUG-020

**magistrate (msudrf.ru) не работает** из-за `net::ERR_NETWORK_ACCESS_DENIED` в Puppeteer headless на Windows 11.

Что уже проверено и исключено:
- Сайт открывается в браузере вручную — сеть есть
- Smart App Control отключён
- AppLocker журнал пустой
- Windows Firewall: блокирующих правил для chrome.exe нет
- `--no-sandbox`, `--disable-setuid-sandbox` — добавлены, не помогли

**Следующий шаг диагностики:**

Попроси пользователя запустить локально (ne pushit') с `headless: false` в `packages/captcha/session.ts` и одной msudrf-ссылкой в `urls.txt`. Интерпретация результата:

| Результат | Диагноз | Действие |
|---|---|---|
| Сайт грузится в видимом окне | Проблема в headless, не в сети | Добавить `--disable-features=NetworkServiceInProcess` или `executablePath` системного Chrome |
| ERR_NETWORK_ACCESS_DENIED и в видимом | Проблема в сети/DNS/прокси | Проверить proxy-настройки Chromium |

## Файлы которые нужно прочитать перед началом работы

Обязательно через MCP:
1. `CONTEXT.md` — текущее состояние
2. `DECISIONS.md` — архитектурные решения
3. `BUG_REPORT.md` — все баги
4. `packages/captcha/session.ts` — текущий Puppeteer flow
5. `packages/captcha/rucaptcha.ts` — RuCaptcha API v2 client

## Правила работы

- Не объясняй базовые концепции — пользователь архитектор
- Трогай только то что нужно, без рефакторинга соседнего кода
- Перед пушем — проверяй SHA через MCP
- Фиксируй все баги в BUG_REPORT.md, решения — в DECISIONS.md
- Операционные файлы (`.env`, `urls.txt`) не пушать
- `data/` не пушать, `logs/` (кроме `orchestrator.lock`) — пушать
- Для magistrate диагностики — `headless: false` локально, в репо не пушать
