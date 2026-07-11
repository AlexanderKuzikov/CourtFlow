// packages/cli/client.ts
// HTTP-клиент к CourtFlow API — общий для TUI и будущих CLI-команд.
// Порт и хост по умолчанию — из config.json (viewer.port / viewer.host), fallback :3000.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Case, RunResult } from '../core/types.js';

function readDefaultApiUrl(): string {
  try {
    const portFile = resolve(process.cwd(), 'logs', '.port');
    if (existsSync(portFile)) {
      const actualPort = readFileSync(portFile, 'utf-8').trim();
      const raw = readFileSync(resolve(process.cwd(), 'config.json'), 'utf-8');
      const cfg = JSON.parse(raw);
      const host = cfg.viewer?.host || 'localhost';
      return `http://${host}:${actualPort}`;
    }
  } catch { /* fall through */ }

  try {
    const raw = readFileSync(resolve(process.cwd(), 'config.json'), 'utf-8');
    const cfg = JSON.parse(raw);
    const host = cfg.viewer?.host || 'localhost';
    const port = cfg.viewer?.port || 8791;
    return `http://${host}:${port}`;
  } catch {
    return 'http://localhost:8791';
  }
}

const DEFAULT_API = readDefaultApiUrl();

export class ApiClient {
  constructor(private baseUrl: string = DEFAULT_API) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST' });
    return res.json() as Promise<T>;
  }

  cases(court?: string): Promise<Case[]> {
    const qs = court ? `?court=${encodeURIComponent(court)}` : '';
    return this.get(`/api/cases${qs}`);
  }

  courts(): Promise<Record<string, { name: string; shortName?: string; address?: string; email?: string; phones?: string[]; vnkod?: string }>> {
    return this.get('/api/courts');
  }

  activeCourts(): Promise<{ courtId: string; courtType: string; url: string }[]> {
    return this.get('/api/active-courts');
  }

  config(): Promise<{ schedule?: string; scheduleRetry?: string; staleThresholdH?: number; viewer: { port: number; host: string } }> {
    return this.get('/api/config');
  }

  logs(days?: number): Promise<RunResult[]> {
    const qs = days ? `?days=${days}` : '';
    return this.get(`/api/logs${qs}`);
  }

  runStatus(): Promise<{ full: { running: boolean; pid: number | null }; retry: { running: boolean; pid: number | null } }> {
    return this.get('/api/run/status');
  }

  startRun(): Promise<{ started: boolean; pid: number | null; mode: string; error?: string }> {
    return this.post('/api/run');
  }

  startRetry(): Promise<{ started: boolean; pid: number | null; mode: string; error?: string }> {
    return this.post('/api/run/retry');
  }
}

export function parseApiUrl(args: string[]): string {
  const idx = args.indexOf('--api');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : DEFAULT_API;
}
