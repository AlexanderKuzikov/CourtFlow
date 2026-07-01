// packages/captcha/session.ts
// Puppeteer-сессия для мировых судов.
// Стратегия: сохраняем cookies после ввода капчи, переиспользуем.
// При истечении сессии — вызываем solver.ts

import type { AppConfig } from '../core/config.js';

export async function fetchWithSession(
  url: string,
  config: AppConfig
): Promise<string> {
  // TODO:
  // 1. Загрузить cookies из config.captcha.sessionFile (если есть)
  // 2. Открыть Puppeteer, применить cookies
  // 3. Перейти по url
  // 4. Если капча — решить через solver.ts, сохранить новые cookies
  // 5. Вернуть HTML страницы
  throw new Error('fetchWithSession: не реализован');
}
