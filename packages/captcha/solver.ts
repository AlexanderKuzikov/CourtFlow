// packages/captcha/solver.ts
// Решение капчи через rucaptcha (primary) или 2captcha (fallback).
// API совместимы — отличается только base URL.

import type { AppConfig } from '../core/config.js';

const PROVIDERS = {
  rucaptcha: 'https://rucaptcha.com',
  '2captcha': 'https://2captcha.com',
};

export async function solveCaptcha(
  imageBase64: string,
  config: AppConfig
): Promise<string> {
  // TODO:
  // 1. Попробовать primary provider (config.captcha.provider)
  // 2. При ошибке — fallback provider
  // 3. Вернуть решение (строка текста капчи)
  throw new Error('solveCaptcha: не реализован');
}
