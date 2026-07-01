// packages/scheduler/orchestrator.ts
// BUG-011: node-fetch удалён, используем встроенный fetch (Node 22)
// BUG-007: lock-файл для защиты от параллельного запуска
// BUG-005: run-log-YYYY-MM-DD.json (история хранится)
// BUG-012: charset из Content-Type заголовка ответа

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import iconv from 'iconv-lite';
import { loadConfig, getEnabledCourts } from '../core/config.js';
import { withRetry } from '../core/retry.js';
import type { RunResult, CourtAdapter } from '../core/types.js';
import { DistrictAdapter } from '../adapters/district.js';
import { AppealAdapter } from '../adapters/appeal.js';
import { CassationAdapter } from '../adapters/cassation.js';
import { MagistrateAdapter } from '../adapters/magistrate.js';
import { exportJson } from '../exporter/json.js';

const ADAPTERS: Record<string, CourtAdapter> = {
  district:   new DistrictAdapter(),
  appeal:     new AppealAdapter(),
  cassation:  new CassationAdapter(),
  magistrate: new MagistrateAdapter(),
};

// BUG-012: автоопределение charset из Content-Type
function detectCharset(contentType: string | null): string {
  if (!contentType) return 'win1251';
  const m = contentType.match(/charset=([\w-]+)/i);
  const cs = m?.[1]?.toLowerCase();
  if (cs === 'utf-8' || cs === 'utf8') return 'utf8';
  return 'win1251';
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const charset = detectCharset(res.headers.get('content-type'));
  const buffer = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buffer), charset);
}

async function run() {
  const config = loadConfig();
  const courts = getEnabledCourts(config);
  const logsDir = resolve(process.cwd(), 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  // BUG-007: lock-файл
  const lockPath = resolve(logsDir, 'orchestrator.lock');
  if (existsSync(lockPath)) {
    console.warn('[orchestrator] Уже запущен (lock есть). Выход.');
    process.exit(0);
  }
  writeFileSync(lockPath, String(process.pid));

  console.log(`[orchestrator] Судов: ${courts.length}, URL: ${courts.reduce((s, c) => s + c.urls.length, 0)}`);

  const results: RunResult[] = [];

  try {
    for (const court of courts) {
      const adapter = ADAPTERS[court.type];
      if (!adapter) {
        console.warn(`[orchestrator] Нет адаптера для: ${court.type}`);
        continue;
      }

      const cases = [];

      for (const url of court.urls) {
        const start = Date.now();
        const caseId = new URL(url).searchParams.get('case_id') ?? url;
        const label = `${court.id} → ${caseId}`;
        try {
          const html = await withRetry(
            () => fetchHtml(url, config.retry.timeoutMs),
            config.retry,
            label
          );
          // BUG-004: timeout на parse()
          const parsePromise = adapter.parse(html, url);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('parse timeout')), 10000)
          );
          const caseData = await Promise.race([parsePromise, timeoutPromise]);
          cases.push(caseData);
          results.push({ courtId: court.id, courtType: court.type, url, success: true, uid: caseData.uid, duration: Date.now() - start, timestamp: new Date().toISOString() });
          console.log(`[OK] ${label} — ${caseData.uid}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ courtId: court.id, courtType: court.type, url, success: false, error, duration: Date.now() - start, timestamp: new Date().toISOString() });
          console.error(`[FAIL] ${label} — ${error}`);
        }
      }

      if (cases.length > 0) {
        exportJson(cases, config.outputDir, court.id);
        if (config.exportXlsx) {
          console.log(`[xlsx] TODO: ${court.id}`);
        }
      }
    }
  } finally {
    // BUG-007: снимаем lock всегда, даже при ошибке
    try { (await import('fs')).unlinkSync(lockPath); } catch {}
  }

  // BUG-005: run-log-YYYY-MM-DD.json
  const date = new Date().toISOString().slice(0, 10);
  const logPath = resolve(logsDir, `run-log-${date}.json`);
  const logTmp = logPath + '.tmp';
  // Добавляем к существующей записи дня
  const existing: RunResult[] = existsSync(logPath)
    ? JSON.parse(readFileSync(logPath, 'utf-8'))
    : [];
  writeFileSync(logTmp, JSON.stringify([...existing, ...results], null, 2), 'utf-8');
  renameSync(logTmp, logPath);

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  console.log(`[orchestrator] Готово. OK: ${ok}, FAIL: ${fail}`);
}

run().catch(err => {
  console.error('[orchestrator] Критическая ошибка:', err.message);
  process.exit(1);
});
