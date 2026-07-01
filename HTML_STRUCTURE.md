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

---

## Главная страница суда (`https://{subdomain}.sudrf.ru/`)

> Используется модулем `enrich:courts` для автозаполнения `courts.json`.

### Подтверждено для district / appeal / cassation

| Поле | Селектор | Примечание |
|---|---|---|
| Название суда | `h5.heading.heading_title` | Одинаково у district/appeal/cassation |
| Контактный блок | `#show` | HTML с несколькими `<br>` |
| Email | `#show a[href^="mailto:"]` | Брать отдельно из ссылки |

### Правила парсинга `#show`

- Первая строка до первого `<br>` — **адрес суда**
- Следующие строки до `mailto:` — **телефоны**
- Ссылка `mailto:` — **email**
- Подписи вроде `(Гр.)`, `(Уг.)`, `(Коап.)`, `(ф.)` **сохраняются как есть**

### Подтвержденные примеры

**District — `sverdlov--perm.sudrf.ru`**
- Название: `Свердловский районный суд г. Перми`
- Адрес: `614990, Пермский край, г. Пермь, ул. Куйбышева, д. 111в`
- Телефоны: `(342) 291-95-70 (Гр.)`, `291-95-71 (Уг.)`, `291-95-73 (Коап.)`
- Email: `sverdlovsky.perm@sudrf.ru`

**Appeal — `oblsud--perm.sudrf.ru`**
- Название: `Пермский краевой суд`
- Адрес: `614990, Пермский край, г. Пермь, ул. Екатерининская, д. 33`
- Телефон: `(342) 210-12-44`
- Email: `kraevoy.perm@sudrf.ru`

**Cassation — `7kas.sudrf.ru`**
- Название: `Седьмой кассационный суд общей юрисдикции`
- Адрес: `454091, Челябинская обл., г. Челябинск, ул. Кирова, д. 161`
- Телефоны: `(351) 728-76-01`, `728-76-51 (ф.)`

---

## 1. District — Районный суд

**Адаптер:** `packages/adapters/district.ts`

### Заголовок карточки

| Элемент | Селектор |
|---|---|
| UID | `#cont1 a[href*="judicial_uid"]` |
| Тип дела | `div.title` / `h1.case-title` / `.delo_name` |
| Номер дела | `div.casenumber` / `.case-num` |

### Вкладки

| Вкладка | ID | Содержимое |
|---|---|---|
| ДЕЛО | `#cont1` | Карточка |
| ДВИЖЕНИЕ ДЕЛА | `#cont2` | События |
| УЧАСТНИКИ | `#cont3` | Стороны |

### Особенности

- `publishedAt` / `modifiedAt` отсутствуют
- Таблица карточки может быть без `#tablcont`

---

## 2. Appeal — Апелляционный суд

**Адаптер:** `packages/adapters/appeal.ts`

### Вкладки

| Вкладка | ID | Содержимое |
|---|---|---|
| ДЕЛО | `#cont1` | Карточка |
| НИЖЕСТОЯЩИЙ СУД | `#cont2` | Первая инстанция |
| ДВИЖЕНИЕ ДЕЛА | `#cont3` | События |
| УЧАСТНИКИ | `#cont4` | Стороны |
| СУДЕБНЫЕ АКТЫ | `#cont5` | `publishInfo` |

---

## 3. Cassation — Кассационный суд

**Адаптер:** `packages/adapters/cassation.ts`

### Вкладки

Аналогично appeal: `#cont1`–`#cont5`.

### Особенности

- `vnkod` присутствует в ссылках `judicial_uid`
- `publishInfo` в `#cont5 .publishInfo`

---

## 4. Magistrate — Мировой судья

- Домен: `*.msudrf.ru`
- URL-паттерн: `modules.php?name=sud_delo&op=cs&case_id=...&delo_id=1540005`
- Требует Puppeteer
- Структура не изучена (нет HTML карточки)

---

## Реестр капчи

Сайты sudrf.ru и msudrf.ru могут вернуть HTTP 200 с формой капчи вместо данных.

### Подтверждённая структура капчи (msudrf.ru, 2026-07-01)

```html
<div class="content">
  <h2>Для продолжения необходимо пройти дополнительную проверку</h2>
  <form method="post" id="kcaptchaForm">
    <img src="/captcha.php">
    <input type="text" name="captcha-response">
    <button type="submit">Продолжить</button>
  </form>
</div>
```

### Детектор

- **Файл:** `packages/core/errors.ts`
- **Функция:** `isCaptchaPage(html: string): boolean`
- **Признак:** `html.includes('id="kcaptchaForm"')`
- **Ошибка:** `CaptchaRequiredError` (отдельный класс, не мешается с FAIL)
- **Статус:** реализовано (BUG-010 закрыт)
