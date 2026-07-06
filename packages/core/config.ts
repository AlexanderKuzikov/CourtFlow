// packages/core/config.ts
// Загрузка config.json + secrets из .env
// Список дел — в watch/ (packages/core/urls.ts), fallback urls.txt
// BUG-001: dotenv загружается здесь, работает в том числе при cron-запуске

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

export interface SafeAppConfig {
  schedule: string;
  scheduleRetry: string;   // cron для retry-прогонов (только stale URL)
  staleThresholdH: number; // часов без успешного обновления → считается устаревшим
  outputDir: string;
  exportXlsx: boolean;
  captcha: {
    sessionFile: string;
    provider: 'rucaptcha' | '2captcha';
    fallbackProvider: 'rucaptcha' | '2captcha';
    primaryKeySet: boolean;
    fallbackKeySet: boolean;
  };
  retry: {
    attempts: number;
    backoffMs: number;
    timeoutMs: number;
  };
  viewer: {
    port: number;
    host: string;
  };
}

export interface AppConfig extends Omit<SafeAppConfig, 'captcha'> {
  captcha: SafeAppConfig['captcha'] & {
    apiKey: string;
    fallbackApiKey: string;
  };
}

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

export function loadConfig(): AppConfig {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const cfg = JSON.parse(raw) as AppConfig;

  const apiKey = process.env['RUCAPTCHA_API_KEY'] ?? '';
  const fallbackApiKey = process.env['TWOCAPTCHA_API_KEY'] ?? '';

  cfg.captcha.apiKey = apiKey;
  cfg.captcha.fallbackApiKey = fallbackApiKey;
  cfg.captcha.primaryKeySet = apiKey.length > 0;
  cfg.captcha.fallbackKeySet = fallbackApiKey.length > 0;

  // Дефолты для новых полей (обратная совместимость)
  cfg.scheduleRetry ??= '';
  cfg.staleThresholdH ??= 24;

  return cfg;
}

export function toSafeConfig(cfg: AppConfig): SafeAppConfig {
  return {
    ...cfg,
    captcha: {
      sessionFile: cfg.captcha.sessionFile,
      provider: cfg.captcha.provider,
      fallbackProvider: cfg.captcha.fallbackProvider,
      primaryKeySet: cfg.captcha.primaryKeySet,
      fallbackKeySet: cfg.captcha.fallbackKeySet,
    },
  };
}
