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
├── config.json
├── courts.json              # ✅ Справочник судов
├── urls.txt
├── .env
├── HTML_STRUCTURE.md
├── DECISIONS.md
├── BUG_REPORT.md
├── CONTEXT.md
├── logs/
├── data/
└── packages/
    ├── core/
    │   ├── config.ts
    │   ├── urls.ts
    │   ├── courts.ts            # ✅ Справочник + fetch с главной страницы суда
    │   ├── types.ts
    │   └── retry.ts
    ├── adapters/
    │   ├── district.ts
    │   ├── appeal.ts
    │   ├── cassation.ts
    │   └── magistrate.ts        # ⏳
    ├── scheduler/
    │   ├── orchestrator.ts
    │   ├── smoke.ts
    │   └── enrich-courts.ts     # ✅ npm run enrich:courts
    ├── exporter/
    │   ├── json.ts
    │   └── xlsx.ts              # ⏳
    └── viewer/
        ├── server.ts            # ✅ /api/courts
        └── public/
            └── index.html       # ✅ показывает name/address/phones/email
```

## Текущее состояние (2026-07-01)

### ✅ Работает
- `npm run test:smoke`
- `npm start`
- `npm run enrich:courts`
- UI показывает человекочитаемые названия судов
- В деталях дела: адрес, телефоны, email суда

### ⚠️ Следующее
1. Автозаполнение `vnkod` в `courts.json`
2. Проверка / поддержка `msudrf.ru`
3. BUG-010 — капча
4. XLSX
5. systemd/pm2

## Команды

```powershell
npm run test:smoke
npm run parse
npm start
npm run enrich:courts
```
