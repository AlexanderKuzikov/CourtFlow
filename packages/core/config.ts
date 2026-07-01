// packages/core/config.ts
// Загрузка config.json + secrets из .env
// API-ключи хранятся только в .env, не в config.json

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
    fallbackProvider: 'rucaptcha' | '2captcha';
    // Ключи берутся из .env, не из config.json
    apiKey: string;         // подставляется при загрузке
    fallbackApiKey: string; // подставляется при загрузке
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
  const cfg = JSON.parse(raw) as AppConfig;

  // Инжектируем ключи из .env
  cfg.captcha.apiKey = process.env['RUCAPTCHA_API_KEY'] ?? '';
  cfg.captcha.fallbackApiKey = process.env['TWOCAPTCHA_API_KEY'] ?? '';

  return cfg;
}

export function getEnabledCourts(config: AppConfig): CourtConfig[] {
  return config.courts.filter(c => c.enabled && c.urls.length > 0);
}
