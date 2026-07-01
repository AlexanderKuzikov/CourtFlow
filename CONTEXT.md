# CONTEXT — CourtFlow

> Файл для быстрого вхождения нового AI-ассистента в проект. Читать перед началом работы.

---

## Что делает проект

**CourtFlow** — система мониторинга судебных дел РФ. Парсит карточки дел с сайтов sudrf.ru и msudrf.ru, накапливает историю в JSON/XLSX, показывает через web-viewer.

- Офисный сервер: **Linux**, доступ через браузер из офисной сети
- Разработка: **Windows** (PowerShell + GitHub Desktop)
- Node.js: **v24.15.0**, TypeScript: **6.x**, npm: **11.18.0**
- UI: **Vanilla HTML/JS** (без фреймворков)

## Архитектура

```
courtflow/
├── config.json              # системные настройки (без URL дел!)
├── urls.txt                 # Список отслеживаемых дел (читаемый, human-friendly)
├── .env                     # Ключи (RUCAPTCHA_API_KEY, TWOCAPTCHA_API_KEY)
├── logs/
│   ├── smoke-last.log        # Последний smoke-тест (пишется автоматически при smokeSaveLog: true)
│   └── run-log-YYYY-MM-DD.json  # Результаты запусков из cron
├── data/                    # JSON/XLSX выгрузка (в .gitignore)
└── packages/
    ├── core/
    │   ├── config.ts            # loadConfig(), toSafeConfig()
    │   ├── urls.ts              # loadUrls(), detectCourtType(), extractCourtId()
    │   ├── types.ts             # Case, CaseEvent, CaseParty, CourtAdapter...
    │   └── retry.ts             # withRetry()
    ├── adapters/
    │   ├── district.ts          # ✅ Работает. #cont1/2/3 (3 вкладки)
    │   ├── appeal.ts            # ✅ Работает. #cont1..5 (5 вкладок), publishInfo
    │   ├── cassation.ts         # ✅ Работает. #cont1..5 (5 вкладок), publishInfo
    │   └── magistrate.ts        # ⏳ Заглушка. Требует Puppeteer
    ├── scheduler/
    │   ├── orchestrator.ts      # ⚠️ Всё ещё использует getEnabledCourts() — нужно переписать на loadUrls()
    │   └── smoke.ts             # ✅ Работает. Пишет UTF-8 лог сам, управляется smokeSaveLog
    ├── exporter/
    │   ├── json.ts              # ⚠️ BUG-006: перезапись при повторном запуске
    │   └── xlsx.ts              # ⏳ Не реализован
    └── viewer/
        ├── server.ts            # ⚠️ Express. /api/config OK, /api/logs TODO, /api/run TODO
        └── public/              # ⏳ Vanilla HTML/JS — не начат
```

## Текущее состояние (2026-07-01)

### ✅ Работает
- `npm run test:smoke` — district, appeal, cassation парсятся корректно
- district: UID, судья, 7 сторон, 15 событий ✅
- appeal: UID, судья, 7 сторон, 6 событий, publishedAt ✅
- cassation: UID, судья, 3 стороны, 1 событие, publishedAt/modifiedAt ✅
- smoke-лог пишется автоматически в UTF-8 (`smokeSaveLog: true` в config.json)
- dotenv загружается автоматически (BUG-001 ✅)
- API-ключи не утекают через /api/config (BUG-003 ✅)
- lock-файл от параллельного запуска (BUG-007 ✅)
- charset из Content-Type (BUG-012 ✅)
- node-fetch удалён, native fetch (BUG-011 ✅)
- run-log-YYYY-MM-DD.json (BUG-005 ✅)

### ⚠️ Требует работы

**Первый приоритет:**
1. `orchestrator.ts` — переписать на `loadUrls()` вместо `getEnabledCourts()`
2. `exporter/json.ts` — BUG-006: мержить данные по uid, не перезаписывать
3. `exporter/xlsx.ts` — реализовать

**Второй приоритет:**
4. `magistrate.ts` — реализация + Puppeteer captcha flow
5. `viewer/public/` — Vanilla HTML/JS UI (4 страницы: дела, конфиг, логи, запуск)
6. `viewer/server.ts` — `/api/logs` и `/api/run` (сейчас TODO)
7. systemd/pm2-сервис для Linux

## Smoke-тест

```powershell
npm run test:smoke
```

Лог пишется автоматически в `logs/smoke-last.log` (UTF-8), если `smokeSaveLog: true` в `config.json`.  
Затем запушить лог через GitHub Desktop для передачи AI-ассистенту.

## Файлы контекста

| Файл | Назначение |
|---|---|
| `BUG_REPORT.md` | Все баги с статусами |
| `CONTEXT.md` | Этот файл. Текущий контекст |
| `urls.txt` | Список дел (редактируется вручную) |
| `logs/smoke-last.log` | Последний smoke-тест |
| `config.json` | Системные настройки |

## Концепция: один адаптер — один тип суда

Каждый адаптер изолирован. Изменения в HTML сайта sudrf.ru всегда по типам, не глобально. Поэтому district/appeal/cassation/magistrate никогда не объединяются в один класс.

## Где читать HTML при дебаге

```powershell
# Сохранить HTML любого дела
Invoke-WebRequest -Uri "<url>" -OutFile "test.html" -UseBasicParsing
# Открыть в браузере, F12 → Elements → искать #cont
Invoke-WebRequest -Uri "<url>" -OutFile "test.html"
Start-Process "test.html"
```
