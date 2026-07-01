// packages/scheduler/orchestrator.ts
// Точка входа для cron и ручного запуска.
// Читает config.json при каждом запуске. Адаптер выбирается по court.type.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import fetch from 'node-fetch';
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

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buffer), 'win1251');
}

async function run() {
  const config = loadConfig();
  const courts = getEnabledCourts(config);
  const logsDir = resolve(process.cwd(), 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  console.log(`[orchestrator] Судов: ${courts.length}, URL: ${courts.reduce((s, c) => s + c.urls.length, 0)}`);

  const results: RunResult[] = [];

  for (const court of courts) {
    const adapter = ADAPTERS[court.type];
    if (!adapter) {
      console.warn(`[orchestrator] Нет адаптера для типа: ${court.type}`);
      continue;
    }

    const cases = [];

    for (const url of court.urls) {
      const start = Date.now();
      const label = `${court.id} → ${new URL(url).searchParams.get('case_id')}`;
      try {
        const html = await withRetry(
          () => fetchHtml(url, config.retry.timeoutMs),
          config.retry,
          label
        );
        const caseData = await withRetry(
          () => adapter.parse(html, url),
          { ...config.retry, attempts: 1 }, // парсинг не ретраем на одних данных
          label
        );
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
        // TODO: exportXlsx(cases, config.outputDir, court.id)
        console.log(`[xlsx] TODO: генерация для ${court.id}`);
      }
    }
  }

  // run-log.json — атомарная запись
  const logPath = resolve(logsDir, 'run-log.json');
  const logTmp = logPath + '.tmp';
  writeFileSync(logTmp, JSON.stringify(results, null, 2), 'utf-8');
  const { renameSync } = await import('fs');
  renameSync(logTmp, logPath);

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  console.log(`[orchestrator] Готово. Успешно: ${ok}, Ошибок: ${fail}`);
}

run().catch(err => {
  console.error('[orchestrator] Критическая ошибка:', err.message);
  process.exit(1);
});
