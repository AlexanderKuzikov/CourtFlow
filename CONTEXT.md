# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON, показывает через web-viewer.

- Целевой сервер: **Linux (Ubuntu)**. Доступ через браузер из офисной сети.
- Разработка: **Windows 11** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков)
- Запуск: `npx tsx` без сборки
- Менеджер процессов на Linux: **pm2**

## Архитектура

```
courtflow/
├── config.json              # schedule, scheduleRetry, staleThresholdH
├── courts.json              # ✅ Справочник судов
├── watch/                   # ✅ Основной источник URL (любые текстовые файлы)
├── urls.txt                 # Fallback если watch/ отсутствует или пуста
├── .env                     # RUCAPTCHA_API_KEY (не коммитить)
├── ecosystem.config.cjs    # ✅ pm2: viewer + parser + parser-retry
├── LINUX_DEPLOY.md         # ✅ Инструкция по деплою
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── logs/
└── packages/
    ├── core/
    │   ├── config.ts            # scheduleRetry, staleThresholdH в интерфейсе
    │   ├── urls.ts              # ✅ watch/ + fuzzy нормализатор + fallback urls.txt
    │   ├── courts.ts
    │   ├── errors.ts
    │   ├── types.ts
    │   └── retry.ts
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts
    ├── captcha/
    │   ├── rucaptcha.ts
    │   └── session.ts
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ full-run + --retry режим по stale URL
    │   ├── smoke.ts
    │   └── enrich-courts.ts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳ не реализовано (низкий приоритет)
    └── viewer/
        ├── server.ts            # ✅ reconciliation + /api/active-courts + full/retry/enrich endpoints
        └── public/
            └── index.html       # ✅ UI управления прогонами
```

## Текущее состояние (2026-07-10)

### ✅ Всё работает
- `npm run parse` — 26/26 дел, 100% success (Windows + Linux)
- `npm run parse -- --retry` — только stale URL (lastSuccess > staleThresholdH часов)
- Linux-деплой прошёл, демонстрация успешна
- Code review пройдён: BUG-023..026 закрыты (TS-ошибки, stale lock, graceful shutdown)
- UI: показывает только активные суды из `watch/`
- Ручной запуск full-run / retry-run есть в UI
- `watch/` принимает `.txt`, `.json`, `.csv`, файлы без расширения, пробельное разделение ссылок, кавычки и смешанные разделители

### ⏳ Следующие шаги (очередь)
1. **XLSX** — `packages/exporter/xlsx.ts` (низкий приоритет, всё ещё заглушка)
2. **Тесты** — unit-тест `extractUrls()` + CI smoke с exit code (отложено в CODE_REVIEW)
3. **Fallback captcha** — 2captcha при первом инциденте RuCaptcha
4. При необходимости — очистка/архивация старых `data/*.json` вне активного мониторинга
5. При необходимости — уведомления о недоступных судах / stale URL

## watch/ — источник URL

- Любые текстовые файлы, любые расширения, любая вложенность папок
- Нормализатор извлекает ссылки из произвольного текста, включая JSON/CSV
- Разделители: пробелы, табы, переносы, `;`, `|`
- Кавычки и JSON-синтаксис игнорируются
- Если нет `https://` — добавляется автоматически
- Фильтр: только домены `*.sudrf.ru` и `*.msudrf.ru`
- Дубликаты URL — дедупликация через `Set`
- Удаление файла = прекращение мониторинга URL из него
- Если `watch/` пуста или отсутствует — fallback на `urls.txt`

## Two-tier scheduling

```json
"schedule":       "0 8 * * 1,3,5"
"scheduleRetry":  "0 11,14 * * 1,3,5"
"staleThresholdH": 24
```

- `courtflow-parser` — основной прогон, все URL
- `courtflow-parser-retry` — retry-прогон с `--retry`, только stale URL
- Оркестратор строит `lastSuccess` по `run-log-*.json` и фильтрует stale URL

## UI / reconciliation

- `/api/cases` теперь фильтрует данные по активным `courtId` из текущего источника мониторинга
- Исторические JSON в `data/` не удаляются, но не отображаются если суд уже не мониторится
- `/api/active-courts` даёт точный список судов в мониторинге
- `/api/run`, `/api/run/retry`, `/api/run/enrich-courts`, `/api/run/status` используются UI для ручного управления

## Команды

```bash
# Windows / Linux
npm run test:smoke
npm run parse
npm run parse -- --retry
npm start
npm run enrich:courts

# Linux / pm2
pm2 start ecosystem.config.cjs
pm2 restart courtflow-parser
pm2 restart courtflow-parser-retry
pm2 logs courtflow-viewer
pm2 status
```

## Промпт для новой сессии

См. файл `PROMPT_FOR_NEW_SESSION.md`.


---

## Статус после Code Review (2026-07-07)

**Что закрыто:**
- ✅ TS-компиляция чистая: `decodeEntities` и `CourtType` ошибки устранены (BUG-023, BUG-024)
- ✅ Lock-файл orchestrator устойчив к SIGKILL/OOM — stale lock проверяет PID через `process.kill(pid, 0)` (BUG-025)
- ✅ Viewer поддерживает graceful shutdown (SIGTERM/SIGINT) — совместим с `pm2 restart` (BUG-026)
- ✅ Полный ответ на ревю добавлен в CODE_REVIEW.md (принято / отклонено / отложено)

**Техдолг (backlog):**
- Unit-тест `extractUrls()` + CI smoke с exit code
- Fallback captcha (2captcha) — при первом инциденте RuCaptcha
- Обновить exceljs до 4.4.0+ (фикс uuid уязвимости)
- ESLint/Prettier, pino, Zod-валидация конфига
