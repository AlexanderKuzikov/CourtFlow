// packages/core/config.ts
// Загрузка config.json + secrets из .env
// АПИ-ключи хранятся только в .env, не в config.json
// BUG-001: dotenv загружается здесь, работает в том числе при cron-запуске

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { CourtType } from './types.js';

// Загружаем .env сразу при импорте модуля
dotenvConfig({ path: resolve(process.cwd(), '.env') });

export interface CourtConfig {
  id: string;
  type: CourtType;
  enabled: boolean;
  urls: string[];
}

// SafeAppConfig — без ключей, используется для GET /api/config (BUG-003)
export interface SafeAppConfig {
  schedule: string;
  outputDir: string;
  exportXlsx: boolean;
  courts: CourtConfig[];
  captcha: {
    sessionFile: string;
    provider: 'rucaptcha' | '2captcha';
    fallbackProvider: 'rucaptcha' | '2captcha';
    primaryKeySet: boolean;   // есть ли ключ (без самого значения)
    fallbackKeySet: boolean;  // есть ли ключ
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

// AppConfig — полный, только внутри сервера
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

  // BUG-002: предупреждение если есть magistrate без ключей
  const hasMagistrate = cfg.courts.some(c => c.type === 'magistrate' && c.enabled && c.urls.length > 0);
  if (hasMagistrate && !apiKey && !fallbackApiKey) {
    console.warn('[config] ⚠️ Есть enabled magistrate-суды, но RUCAPTCHA_API_KEY и TWOCAPTCHA_API_KEY не заданы. Капча не будет работать.');
  }

  return cfg;
}

// BUG-003: безопасная версия для GET /api/config
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

export function getEnabledCourts(config: AppConfig): CourtConfig[] {
  return config.courts.filter(c => c.enabled && c.urls.length > 0);
}
