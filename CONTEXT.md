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
    │   ├── orchestrator.ts      # ✅ Использует loadUrls(), группировка по courtId
    │   └── smoke.ts             # ✅ Пишет UTF-8 лог сам, управляется smokeSaveLog
    ├── exporter/
    │   ├── json.ts              # ✅ Мержинг по uid (BUG-006 ✅)
    │   └── xlsx.ts              # ⏳ Не реализован
    └── viewer/
        ├── server.ts            # ✅ /api/config, /api/cases, /api/logs, /api/run, /api/run/status
        └── public/
            └── index.html       # ✅ UI: дела, логи, запуск, панель деталей
```

## Текущее состояние (2026-07-01)

### ✅ Работает
- `npm run test:smoke` — district, appeal, cassation парсятся корректно
- `npm start` — viewer на http://localhost:3000, UI работает
- district/appeal/cassation: uid, судья, стороны, события, publishedAt ✅
- exporter: мержинг по uid, атомарная запись ✅
- orchestrator: loadUrls(), группировка по courtId ✅
- smoke-лог в UTF-8 автоматически (smokeSaveLog) ✅
- все BUG 001–009, 011–014 ✅

### ⚠️ Требует работы

**Первый приоритет:**
1. `magistrate.ts` — реализация + Puppeteer + captcha flow
2. `exporter/xlsx.ts` — реализовать
3. BUG-010 — детекция капчи в HTML

**Второй приоритет:**
4. systemd/pm2-сервис для Linux

## Smoke-тест

```powershell
npm run test:smoke
```

Лог пишется автоматически в `logs/smoke-last.log` (UTF-8), если `smokeSaveLog: true` в `config.json`.  
Затем запушить лог через GitHub Desktop.

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
Start-Process "test.html"
```
