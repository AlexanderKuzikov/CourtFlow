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
├── config.json              # Системные настройки
├── courts.json              # Справочник судов (план)
├── urls.txt                 # Отслеживаемые дела
├── .env                     # Ключи API
├── HTML_STRUCTURE.md        # Карта HTML-структуры сайтов судов
├── DECISIONS.md             # Решения, стратегия, планы
├── BUG_REPORT.md            # Баги
├── CONTEXT.md               # Этот файл
├── logs/
│   ├── smoke-last.log
│   └── run-log-YYYY-MM-DD.json
├── data/                    # JSON/XLSX (в .gitignore)
└── packages/
    ├── core/
    │   ├── config.ts
    │   ├── urls.ts              # loadUrls(), detectCourtType()
    │   ├── courts.ts            # план: lookupCourt(), registerCourt()
    │   ├── types.ts
    │   └── retry.ts
    ├── adapters/
    │   ├── district.ts          # ✅ 3 вкладки
    │   ├── appeal.ts            # ✅ 5 вкладок
    │   ├── cassation.ts         # ✅ 5 вкладок
    │   └── magistrate.ts        # ⏳ Заглушка
    ├── scheduler/
    │   ├── orchestrator.ts      # ✅ loadUrls()
    │   └── smoke.ts             # ✅ smokeSaveLog
    ├── exporter/
    │   ├── json.ts              # ✅ мержинг по uid
    │   └── xlsx.ts              # ⏳
    └── viewer/
        ├── server.ts            # ✅ /api/cases, /api/logs, /api/run
        └── public/
            └── index.html       # ✅ UI мониторинг
```

## Текущее состояние (2026-07-01)

### ✅ Работает
- `npm run test:smoke` — district, appeal, cassation
- `npm start` — viewer на http://localhost:3000, UI работает
- exporter: мержинг по uid, атомарная запись
- orchestrator: loadUrls() + группировка по courtId

### ⚠️ Требует работы

**Фаза 2 (справочник судов):**
1. Проверить селекторы главной страницы для district и appeal (F12)
2. Реализовать `courts.ts` + `courts.json` + `enrich:courts`
3. `GET /api/courts` в server.ts
4. Отобразить `shortName` в UI

**Фаза 3 (magistrate):**
5. `magistrate.ts` — Puppeteer + captcha
6. BUG-010 — детекция капчи во всех адаптерах

**Фаза 4:**
7. `exporter/xlsx.ts`
8. systemd/pm2 для Linux

## Smoke-тест

```powershell
npm run test:smoke
```

Лог автозапись в `logs/smoke-last.log` (UTF-8) если `smokeSaveLog: true`.

## Файлы документации

| Файл | Назначение |
|---|---|
| `CONTEXT.md` | Текущий контекст, архитектура |
| `DECISIONS.md` | Решения, стратегия, журнал |
| `BUG_REPORT.md` | Баги с статусами |
| `HTML_STRUCTURE.md` | Карта HTML-структуры сайтов судов |
| `urls.txt` | Список дел |
| `config.json` | Системные настройки |
