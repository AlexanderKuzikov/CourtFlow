# Руководство: Подключение RuCaptcha API v2 в Node.js проектах

> **Версия:** 1.0  
> **Основано на:** CourtFlow (`packages/captcha/rucaptcha.ts`, `packages/captcha/session.ts`)  
> **Дата:** 2026-07-02  
> **Стек:** Node.js 20+ (ESM), TypeScript, нативный `fetch`, Puppeteer (опционально)

---

## ⚠️ Главное правило: **Только API v2**

```text
✅ api.rucaptcha.com  — createTask / getTaskResult (JSON)
❌ rucaptcha.com/in.php + res.php  — Legacy API v1 (URLSearchParams)
```

> **Почему:** Legacy v1 может быть отключён без предупреждения. Документация RuCaptcha официально рекомендует v2.

---

## 📦 Установка

Никаких дополнительных пакетов не нужно — используем встроенный `fetch` (Node 18+).

```bash
# Только если нужен Puppeteer для браузерного контекста
npm i puppeteer
```

---

## 🔧 Базовый клиент (готовый к копированию)

Создайте файл `rucaptcha-client.ts`:

```typescript
// rucaptcha-client.ts
// RuCaptcha API v2 Client — ImageToTextTask
// Работает в любом Node.js проекте (ESM)

const API_BASE = 'https://api.rucaptcha.com';

export interface RuCaptchaClientOptions {
  /** API-ключ из личного кабинета rucaptcha.com */
  apiKey: string;
  /** Интервал опроса результата (мс) */
  pollingIntervalMs?: number;
  /** Общий таймаут решения (мс) */
  timeoutMs?: number;
}

export class RuCaptchaClient {
  private readonly apiKey: string;
  private readonly pollingIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: RuCaptchaClientOptions) {
    this.apiKey = options.apiKey;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  /**
   * Решает капчу по base64 изображению
   * @param imageBase64 — картинка в base64 (без data:image/... префикса)
   */
  async solveImage(imageBase64: string): Promise<string> {
    const taskId = await this.createTask(imageBase64);
    return this.pollResult(taskId);
  }

  private async createTask(imageBase64: string): Promise<number> {
    const res = await fetch(`${API_BASE}/createTask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.apiKey,
        task: {
          type: 'ImageToTextTask',
          body: imageBase64,
          numeric: 4,
          minLength: 4,
          maxLength: 6,
          case: false,
          languagePool: 'rn',
          softId: '3898',
        },
      }),
    });

    const json = await res.json() as {
      errorId: number;
      errorCode?: string;
      taskId?: number;
    };

    if (json.errorId !== 0) {
      throw new Error(`RuCaptcha createTask error: ${json.errorCode ?? json.errorId}`);
    }
    if (!json.taskId) {
      throw new Error('RuCaptcha createTask: нет taskId в ответе');
    }
    return json.taskId;
  }

  private async pollResult(taskId: number): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      await sleep(this.pollingIntervalMs);

      const res = await fetch(`${API_BASE}/getTaskResult`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientKey: this.apiKey, taskId }),
      });

      const json = await res.json() as {
        errorId: number;
        errorCode?: string;
        status: 'processing' | 'ready';
        solution?: { text: string };
      };

      if (json.errorId !== 0) {
        throw new Error(`RuCaptcha getTaskResult error: ${json.errorCode ?? json.errorId}`);
      }
      if (json.status === 'processing') continue;
      if (json.status === 'ready') {
        if (!json.solution?.text) {
          throw new Error('RuCaptcha: статус ready, но solution.text отсутствует');
        }
        return json.solution.text;
      }
      throw new Error(`RuCaptcha: неожиданный статус: ${json.status}`);
    }
    throw new Error('RuCaptcha timeout');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 🎯 Параметры `ImageToTextTask` — подбираем под свою капчу

| Параметр | Значения | CourtFlow (msudrf.ru) | Типичные значения |
|----------|----------|----------------------|-------------------|
| `numeric` | `0/1/2/4` | `4` (цифры+буквы) | `4` — универсально |
| `minLength` | число | `4` | `4-5` |
| `maxLength` | число | `6` | `6-8` |
| `case` | `true/false` | `false` | `false` (большинство нечувствительны) |
| `languagePool` | `'rn'/'en'/'ru'` | `'rn'` | `'rn'` для RU+EN |
| `softId` | строка | `'3898'` | **Ваш ID из кабинета** |

> **Важно:** `softId` регистрируется в личном кабинете RuCaptcha → «Для разработчиков» → «Мой softId». Даёт % от расходов рефералов. Если нет — можно не передавать.

---

## 🌐 Работа с Puppeteer: получение картинки в браузерном контексте

**Проблема:** `page.goto(captchaUrl)` + `page.goBack()` ломает сессию на msudrf.ru (капча одноразовая, токен инвалидируется).

**Решение:** `page.evaluate(fetch, ...)` — fetch внутри браузера автоматически подтягивает cookies сессии.

```typescript
// captcha-helpers.ts
import type { Page } from 'puppeteer';

/**
 * Скачивает картинку капчи через fetch в контексте страницы.
 * Сохраняет cookies сессии, не ломает историю.
 */
export async function fetchCaptchaImageAsBase64(
  page: Page,
  imageSelector: string
): Promise<string> {
  // 1. Получаем src картинки
  const src = await page.$eval(
    imageSelector,
    (img: HTMLImageElement) => img.getAttribute('src')
  );
  if (!src) throw new Error('Captcha image src not found');

  // 2. Скачиваем через fetch в браузерном контексте (credentials: 'include' = cookies)
  const imageBase64 = await page.evaluate(async (imgSrc: string) => {
    const res = await fetch(imgSrc, { credentials: 'include' });
    if (!res.ok) throw new Error(`Captcha image fetch failed: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    // ArrayBuffer -> base64
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, src);

  return imageBase64;
}
```

**Использование в CourtFlow:**
```typescript
// msudrf.ru: селектор формы капчи
const imageBase64 = await fetchCaptchaImageAsBase64(page, 'form#kcaptchaForm img');
const captchaText = await client.solveImage(imageBase64);

// Подставляем и сабмитим
await page.locator('input[name="captcha-response"]').fill(captchaText);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
  page.locator('form#kcaptchaForm button[type="submit"]').click(),
]);
```

---

## 🔐 SSL-сертификаты: wildcard `*.domain.ru` не покрывает `sub.sub.domain.ru`

**Проблема:** msudrf.ru использует wildcard `*.msudrf.ru`, но домены мировых судов — `35.perm.msudrf.ru` (два уровня вложенности). Chromium строго отклоняет такой сертификат.

**Фикс в Puppeteer launch args:**
```typescript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--ignore-certificate-errors',  // ← ГЛАВНЫЙ ФИКС
  ],
});
```

---

## 🧪 Полный рабочий пример (standalone)

Создайте `solve-captcha-example.ts`:

```typescript
// solve-captcha-example.ts
// Запуск: npx tsx solve-captcha-example.ts
// Требует: RUCAPTCHA_API_KEY в .env или переменной окружения

import { RuCaptchaClient } from './rucaptcha-client.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Загрузка .env (нативный Node 21.7+, 0 зависимостей)
process.loadEnvFile(resolve(process.cwd(), '.env'));

const API_KEY = process.env.RUCAPTCHA_API_KEY;
if (!API_KEY) {
  console.error('❌ RUCAPTCHA_API_KEY не задан в .env');
  process.exit(1);
}

// Пример: читаем локальный файл капчи, конвертим в base64
function fileToBase64(filePath: string): string {
  const buf = readFileSync(filePath);
  return buf.toString('base64');
}

async function main() {
  const client = new RuCaptchaClient({
    apiKey: API_KEY,
    pollingIntervalMs: 5000,
    timeoutMs: 120000,
  });

  try {
    // Вариант 1: из файла
    const imageBase64 = fileToBase64('./captcha-sample.png');
    
    // Вариант 2: если картинка уже в base64 (из Puppeteer)
    // const imageBase64 = await fetchCaptchaImageAsBase64(page, 'form#kcaptchaForm img');

    console.log('🔄 Отправка капчи в RuCaptcha...');
    const text = await client.solveImage(imageBase64);
    
    console.log(`✅ Решено! Текст: "${text}"`);
  } catch (err) {
    console.error('❌ Ошибка:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
```

---

## 📋 Чек-лист интеграции в новый проект

| Шаг | Действие | Статус |
|-----|----------|--------|
| 1 | Скопировать `rucaptcha-client.ts` в проект | ☐ |
| 2 | Зарегистрироваться на rucaptcha.com, получить API-ключ | ☐ |
| 3 | (Опционально) Создать softId в кабинете | ☐ |
| 4 | Добавить `RUCAPTCHA_API_KEY` в `.env` / переменные окружения | ☐ |
| 5 | Определить параметры капчи (`numeric`, `minLength`, `maxLength`, `languagePool`) | ☐ |
| 6 | Если капча в браузере — использовать `fetchCaptchaImageAsBase64` (Puppeteer) | ☐ |
| 7 | Добавить `--ignore-certificate-errors` в Puppete в Puppeteer args (если wildcard SSL) | ☐ |
| 8 | Протестировать на реальных капчах (минимум 10-20) | ☐ |
| 9 | Настроить мониторинг: % успеха, среднее время, баланс | ☐ |

---

## 🐛 Типичные ошибки и решения

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `ERROR_ZERO_BALANCE` | Баланс ≤ 0 | Пополнить счёт (оплата в RUB, ~1₽/100 капч) |
| `ERROR_KEY_DOES_NOT_EXIST` | Неверный API-ключ | Проверить ключ в `.env`, нет ли пробелов/кавычек |
| `ERROR_NO_SLOT_AVAILABLE` | Все воркеры заняты | Увеличить `pollingIntervalMs` до 10-15 сек, повторить |
| `ERROR_CAPTCHA_UNSOLVABLE` | Воркеры не смогли решить | Проверить параметры задачи (`numeric`, `minLength`, `languagePool`) |
| `ERROR_IMAGE_TOO_BIG` | Картинка > 100 KB | Сжать/обрезать перед отправкой |
| `Timeout` в `pollResult` | Капча решается > 2 мин | Увеличить `timeoutMs` или уменьшить сложность параметров |
| `net::ERR_CERT_COMMON_NAME_INVALID` | Wildcard SSL не покрывает поддомен | Добавить `--ignore-certificate-errors` в Puppeteer args |
| Капча показывается повторно после сабмита | Токен инвалидировался при `goBack()` | Использовать `page.evaluate(fetch, { credentials: 'include' })` |

---

## 💰 Экономика

| Метрика | Значение |
|---------|----------|
| Цена | ~1₽ за 100 капч (ImageToTextTask) |
| Баланс | Пополнение от 50₽ (карта/SBP/крипта) |
| SoftId | 5-10% реферальных отчислений на ваш счёт |
| Среднее время решения | 5-30 секунд |

---

## 🔗 Полезные ссылки

- **Официальная документация API v2:** https://rucaptcha.com/api-docs/normal-captcha
- **Коды ошибок:** https://rucaptcha.com/api-docs/errors
- **Параметры ImageToTextTask:** https://rucaptcha.com/api-docs/normal-captcha#imagetotexttask
- **Личный кабинет (API ключ, softId, баланс):** https://rucaptcha.com/setting

---

## 📄 Лицензия

Код клиента (`RuCaptchaClient`) — **MIT**. Используйте свободно в любых проектах.

---

*Руководство создано на основе боевого кода CourtFlow (https://github.com/AlexanderKuzikov/CourtFlow). Проверено на продакшене: 100% успех на 12 делах msudrf.ru за прогон.*