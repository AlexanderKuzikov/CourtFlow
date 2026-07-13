// packages/cli/client.ts
// HTTP-клиент к CourtFlow API — общий для TUI и будущих CLI-команд.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Case, RunResult } from '../core/types.js';

function readDefaultApiUrl(): string {
  try {
    const portFile = resolve(process.cwd(), 'logs', '.port');
    if (existsSync(portFile)) {
      const actualPort = readFileSync(portFile, 'utf-8').trim();
      const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'config.json'), 'utf-8'));
      return `http://${cfg.viewer?.host || 'localhost'}:${actualPort}`;
    }
  } catch { /* fall through */ }
  try {
    const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'config.json'), 'utf-8'));
    return `http://${cfg.viewer?.host || 'localhost'}:${cfg.viewer?.port || 8791}`;
  } catch { return 'http://localhost:8791'; }
}

export class ApiClient {
  constructor(private baseUrl: string = readDefaultApiUrl()) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  cases(court?: string): Promise<Case[]> { return this.get(`/api/cases${court ? `?court=${encodeURIComponent(court)}` : ''}`); }
  courts(): Promise<Record<string, { name: string; shortName?: string; address?: string; email?: string; phones?: string[]; vnkod?: string }>> { return this.get('/api/courts'); }
  activeCourts(): Promise<{ courtId: string; courtType: string; url: string }[]> { return this.get('/api/active-courts'); }
  config(): Promise<{ schedule?: string; scheduleRetry?: string; staleThresholdH?: number; viewer: { port: number; host: string } }> { return this.get('/api/config'); }
  logs(days?: number): Promise<RunResult[]> { return this.get(`/api/logs${days ? `?days=${days}` : ''}`); }
  runStatus(): Promise<{ full: { running: boolean; pid: number | null }; retry: { running: boolean; pid: number | null } }> { return this.get('/api/run/status'); }
  startRun(): Promise<{ started: boolean; pid: number | null; mode: string; error?: string }> { return this.post('/api/run'); }
  startRetry(): Promise<{ started: boolean; pid: number | null; mode: string; error?: string }> { return this.post('/api/run/retry'); }
  enrichCourts(): Promise<{ started: boolean; pid: number | null; error?: string }> { return this.post('/api/run/enrich-courts'); }
}

export function parseApiUrl(args: string[]): string {
  const idx = args.indexOf('--api');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : readDefaultApiUrl();
}
