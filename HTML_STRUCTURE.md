# HTML_STRUCTURE — CourtFlow

> Документация структуры HTML сайтов судов СудРФ.  
> Обновлять при любых изменениях вёрстки сайтов. Последняя проверка: **2026-07-01**.

---

## Определение типа суда по URL

| Тип | Домен | `delo_id` | `new` |
|---|---|---|---|
| district | `*.sudrf.ru` | `1540005` или `null` | — |
| appeal | `oblsud--*.sudrf.ru` | `5` | — |
| cassation | `Nkas.sudrf.ru` | `2800001` | — |
| magistrate | `*.msudrf.ru` | — | `1` |

Логика определения: `packages/core/urls.ts` → `detectCourtType()`.

---

## Главная страница суда (`https://{subdomain}.sudrf.ru/`)

> Используется модулем `enrich:courts` для автозаполнения `courts.json`.

| Поле | Селектор | Пример |
|---|---|---|
| Название суда | `h5.heading.heading_title` | Седьмой кассационный суд общей юрисдикции |
| Адрес + телефоны | `#show` | `454091, Челябинская обл...<br>Тел.: (351)...` |

`#show` содержит адрес до `<br>`, телефоны после. Телефоны разделены запятой, после `Тел.:` — отметка `(ф.)` означает факс.

> ⚠️ **Не проверено** для типов district и appeal. Селектор `h5.heading.heading_title` может отличаться. Требует проверки вручную.

---

## 1. District — Районный суд

**Пример URL:**  
`https://sverdlov--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=...&delo_id=1540005`

**Адаптер:** `packages/adapters/district.ts`

### Блок заголовка карточки

| Элемент | Селектор |
|---|---|
| UID (ссылка) | `#cont1 a[href*="judicial_uid"]` → `.text()` |
| Тип дела | `div.title` или `h1.case-title` или `.delo_name` |
| Номер дела | `div.casenumber` или `.case-num` |

### Вкладки (3 шт.)

| Вкладка | ID | Содержимое |
|---|---|---|
| ДЕЛО | `#cont1` | Таблица карточки (`table` или `table#tablcont`) |
| ДВИЖЕНИЕ ДЕЛА | `#cont2` | События, 6+ колонок |
| УЧАСТНИКИ | `#cont3` | Стороны дела |

### Карточка дела (`#cont1`)

Парсинг: `tr` → `td[0]` = ключ, `td[1]` = значение.

| Ключ в HTML | Поле в `Case` |
|---|---|
| Дата поступления | `card.filingDate` |
| Категория дела | `card.category[]` (разбивается по `<br>`) |
| Судья | `card.judge` |
| Дата рассмотрения | `card.hearingDate` |
| Результат рассмотрения | `card.result` |
| Признак рассмотрения дела | `card.proceedingType` |

### Движение дела (`#cont2`)

Шапка: 2 строки (colspan + заголовки) — `skip i < 2`.

| Колонка | Индекс | Поле |
|---|---|---|
| Название события | 0 | `eventName` |
| Дата | 1 | `eventDate` (DD.MM.YYYY → YYYY-MM-DD) |
| Время | 2 | `eventTime` |
| Место | 3 | `location` |
| Результат | 4 | `result` |
| Причина | 5 | `reason` |
| Примечание | 6 | `note` (если есть) |
| Дата публикации | 7 | `publishDate` (если есть) |

### Участники (`#cont3`)

Шапка: 2 строки — `skip i < 2`.

| Колонка | Индекс | Поле |
|---|---|---|
| Роль | 0 | `role` |
| Наименование | 1 | `name` |
| ИНН | 2 | `inn` |
| КПП | 3 | `kpp` |
| ОГРН | 4 | `ogrn` |
| ОГРНИП | 5 | `ogrnip` |

### Особенности

- `publishedAt` / `modifiedAt` — **нет** (отличие от appeal/cassation)
- Таблица карточки может быть без `id="tablcont"` — фоллбэк `#cont1 table tr`

---

## 2. Appeal — Апелляционный суд

**Пример URL:**  
`https://oblsud--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=...&delo_id=5`

**Адаптер:** `packages/adapters/appeal.ts`

### Вкладки (5 шт.)

| Вкладка | ID | Содержимое |
|---|---|---|
| ДЕЛО | `#cont1` | Карточка дела (`table#tablcont`) |
| НИЖЕСТОЯЩИЙ СУД | `#cont2` | Карточка дела в первой инстанции |
| ДВИЖЕНИЕ ДЕЛА | `#cont3` | События (НЕ #cont2!) |
| УЧАСТНИКИ | `#cont4` | Стороны дела (НЕ #cont3!) |
| СУДЕБНЫЕ АКТЫ | `#cont5` | `publishInfo` — даты публикации |

### Блок заголовка карточки

Те же селекторы что и district, но таблица имеет `id="tablcont"` — селектор `#cont1 table#tablcont tr`.

### Движение дела (`#cont3`)

Аналогично district (`#cont2`). Те же колонки и порядок.

### `publishInfo` (`#cont5 .publishInfo`)

```
Опубликован 01.06.2026 14:23, изменено 02.06.2026 09:10
```

Регексп: `опубликован\s+([\d.]+\s+[\d:]+)`, `изменено\s+([\d.]+\s+[\d:]+)`.

### Нижестоящий суд (`#cont2`)

`table#tablcont tr` — `td[0]` = ключ, `td[1]` = значение.  
Сейчас не сохраняется в `Case` (TODO: добавить поле `lowerCourt` в схему).

---

## 3. Cassation — Кассационный суд

**Пример URL:**  
`https://7kas.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=...&delo_id=2800001`

**Адаптер:** `packages/adapters/cassation.ts`

### Вкладки (5 шт.)

Аналогично appeal — те же 5 вкладок `#cont1`–`#cont5` с той же семантикой.

| Вкладка | ID | Содержимое |
|---|---|---|
| ДЕЛО | `#cont1` | Карточка (`table#tablcont`) |
| НИЖЕСТОЯЩИЕ СУДЫ | `#cont2` | Суды предыдущих инстанций |
| ДВИЖЕНИЕ ДЕЛА | `#cont3` | События |
| УЧАСТНИКИ | `#cont4` | Стороны |
| СУДЕБНЫЕ АКТЫ | `#cont5` | `publishInfo` |

### Особенности

- Структура полностью совпадает с appeal
- `publishInfo` тот же формат что и в appeal
- `vnkod` виден в ссылках `judicial_uid` — пример: `vnkod=74KJ0007`

---

## 4. Magistrate — Мировой судья

**Пример URL:**  
`https://35.perm.msudrf.ru/modules.php?name=sud_delo&name_op=case&new=1&case_id=...`

**Адаптер:** `packages/adapters/magistrate.ts` — ⏳ Заглушка

### Особенности

- Домен: `*.msudrf.ru` (отличается от `*.sudrf.ru`)
- URL параметр `new=1` вместо `delo_id`
- Сайт **требует JavaScript** — native fetch недостаточен, нужен Puppeteer
- Структура HTML не изучена — требует отдельного исследования

> ⚠️ Необходимо зафиксировать HTML-структуру после реализации Puppeteer-адаптера.

---

## vnkod — внутренний ID суда в ГАС «Правосудие»

Присутствует в ссылках `judicial_uid` внутри карточки дела:
```
/modules.php?name=DocumViewer&...&vnkod=74KJ0007&...
```

Парсинг: `$('a[href*="vnkod="]').attr('href')` → `new URLSearchParams(href).get('vnkod')`.

| Тип | Пример vnkod |
|---|---|
| district | `59RS0007` (суд № + регион) |
| appeal | `59OS0000` |
| cassation | `74KJ0007` (7-й кассационный) |
| magistrate | — (не изучено) |

---

## Реестр капчи

Сайты sudrf.ru могут вернуть HTTP 200 с формой капчи вместо данных. Признак:

```html
<form ... action="...captcha..."> или <input name="captcha">
```

Статус: **BUG-010** — не реализовано. TODO: бросать `CaptchaRequiredError` во всех адаптерах.

---

## Чек-лист при изменении вёрстки

1. Есть ли `#tablcont` у таблицы карточки?
2. Осталось ли `#cont1`–`#cont5` или изменились номера?
3. Остался ли `div.title` / `div.casenumber`?
4. Остался ли `#show` / `h5.heading.heading_title` на главной?
5. Появилась ли форма капчи вместо данных?
