// packages/scheduler/orchestrator.ts
// BUG-011: node-fetch удалён, используем встроенный fetch (Node 22)
// BUG-007: lock-файл для защиты от параллельного запуска
// BUG-005: run-log-YYYY-MM-DD.json (история хранится)
// BUG-012: charset из Content-Type заголовка ответа

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import iconv from 'iconv-lite';
import { loadConfig } from '../core/config.js';
import { loadUrls } from '../core/urls.js';
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
  const allUrls = loadUrls();
  const logsDir = resolve(process.cwd(), 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  // BUG-007: lock-файл
  const lockPath = resolve(logsDir, 'orchestrator.lock');
  if (existsSync(lockPath)) {
    console.warn('[orchestrator] Уже запущен (lock есть). Выход.');
    process.exit(0);
  }
  writeFileSync(lockPath, String(process.pid));

  // Группируем URL по courtId для побатчевой экспорта JSON
  const courtGroups = new Map<string, { type: string; urls: string[] }>();
  for (const { url, courtType, courtId } of allUrls) {
    if (!courtGroups.has(courtId)) courtGroups.set(courtId, { type: courtType, urls: [] });
    courtGroups.get(courtId)!.urls.push(url);
  }

  const totalUrls = allUrls.length;
  console.log(`[orchestrator] Судов: ${courtGroups.size}, URL: ${totalUrls}`);

  const results: RunResult[] = [];

  try {
    for (const [courtId, { type, urls }] of courtGroups) {
      const adapter = ADAPTERS[type];
      if (!adapter) {
        console.warn(`[orchestrator] Нет адаптера для: ${type}`);
        continue;
      }

      if (type === 'magistrate') {
        console.log(`[orchestrator] Пропущен ${courtId} (magistrate требует Puppeteer)`);
        continue;
      }

      const cases = [];

      for (const url of urls) {
        const start = Date.now();
        const caseId = new URL(url).searchParams.get('case_id') ?? url;
        const label = `${courtId} → ${caseId}`;
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
          results.push({
            courtId, courtType: type, url,
            success: true, uid: caseData.uid,
            duration: Date.now() - start,
            timestamp: new Date().toISOString(),
          });
          console.log(`[OK] ${label} — ${caseData.uid}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({
            courtId, courtType: type, url,
            success: false, error,
            duration: Date.now() - start,
            timestamp: new Date().toISOString(),
          });
          console.error(`[FAIL] ${label} — ${error}`);
        }
      }

      if (cases.length > 0) {
        exportJson(cases, config.outputDir, courtId);
        if (config.exportXlsx) {
          console.log(`[xlsx] TODO: ${courtId}`);
        }
      }
    }
  } finally {
    // BUG-007: снимаем lock всегда, даже при ошибке
    try { unlinkSync(lockPath); } catch {}
  }

  // BUG-005: run-log-YYYY-MM-DD.json
  const date = new Date().toISOString().slice(0, 10);
  const logPath = resolve(logsDir, `run-log-${date}.json`);
  const logTmp = logPath + '.tmp';
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
