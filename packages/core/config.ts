// packages/core/config.ts
// Загрузка и типизация config.json. Единственное место где читается конфиг.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { CourtType } from './types.js';

export interface CourtConfig {
  id: string;
  type: CourtType;
  enabled: boolean;
  urls: string[];
}

export interface AppConfig {
  schedule: string;
  outputDir: string;
  exportXlsx: boolean;
  courts: CourtConfig[];
  captcha: {
    sessionFile: string;
    provider: 'rucaptcha' | '2captcha';
    apiKey: string;
    fallbackProvider: 'rucaptcha' | '2captcha';
    fallbackApiKey: string;
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

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

export function loadConfig(): AppConfig {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as AppConfig;
}

export function getEnabledCourts(config: AppConfig): CourtConfig[] {
  return config.courts.filter(c => c.enabled && c.urls.length > 0);
}
