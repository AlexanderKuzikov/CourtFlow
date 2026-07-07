// packages/scheduler/orchestrator.ts
// BUG-011: node-fetch удалён, используем встроенный fetch (Node 22)
// BUG-007: lock-файл для защиты от параллельного запуска
// BUG-005: run-log-YYYY-MM-DD.json (история хранится)
// BUG-012: charset из Content-Type заголовка ответа
// BUG-010: CaptchaRequiredError логируется отдельно, не как FAIL
//
// FIX (CODE_REVIEW #2): CourtType assignability — ADAPTERS, courtGroups, loadCaseHtml теперь используют CourtType, не string
// FIX (CODE_REVIEW #6): stale lock — проверка PID через process.kill(pid,0), stale lock после SIGKILL/OOM больше не блокирует запуск
// Режимы запуска:
//   npm run parse          — полный прогон всех URL
//   npm run parse --retry  — только stale URL (lastSuccess > staleThresholdH часов назад)

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import iconv from 'iconv-lite';
import { loadConfig } from '../core/config.js';
import { loadUrls } from '../core/urls.js';
import { withRetry } from '../core/retry.js';
import { CaptchaRequiredError } from '../core/errors.js';
import type { RunResult, CourtAdapter, CourtType } from '../core/types.js';
import { DistrictAdapter } from '../adapters/district.js';
import { AppealAdapter } from '../adapters/appeal.js';
import { CassationAdapter } from '../adapters/cassation.js';
import { MagistrateAdapter } from '../adapters/magistrate.js';
import { fetchMagistrateHtml } from '../captcha/session.js';
import { exportJson } from '../exporter/json.js';

const ADAPTERS: Record<CourtType, CourtAdapter> = {
  district:   new DistrictAdapter(),
  appeal:     new AppealAdapter(),
  cassation:  new CassationAdapter(),
  magistrate: new MagistrateAdapter(),
};

const IS_RETRY = process.argv.includes('--retry');

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

async function loadCaseHtml(url: string, courtType: CourtType, timeoutMs: number, apiKey: string): Promise<string> {
  if (courtType === 'magistrate') {
    if (!apiKey) throw new Error('RUCAPTCHA_API_KEY is not set');
    return fetchMagistrateHtml({
      url,
      apiKey,
      debugDir: resolve(process.cwd(), 'logs'),
    });
  }
  return fetchHtml(url, timeoutMs);
}

/**
 * Читает все run-log-*.json и возвращает Map<url, lastSuccessTimestamp>.
 */
function buildLastSuccessMap(logsDir: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!existsSync(logsDir)) return map;

  const files = readdirSync(logsDir)
    .filter(f => f.startsWith('run-log-') && f.endsWith('.json'))
    .sort();

  for (const f of files) {
    try {
      const entries: RunResult[] = JSON.parse(readFileSync(join(logsDir, f), 'utf-8'));
      for (const e of entries) {
        if (e.success && e.url) {
          const ts = new Date(e.timestamp).getTime();
          const prev = map.get(e.url) ?? 0;
          if (ts > prev) map.set(e.url, ts);
        }
      }
    } catch { /* пропускаем повреждённый лог */ }
  }
  return map;
}

async function run() {
  const config = loadConfig();
  const allUrls = loadUrls();
  const logsDir = resolve(process.cwd(), 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  const lockPath = resolve(logsDir, 'orchestrator.lock');
    // FIX (CODE_REVIEW #6): проверяем жив ли процесс-владелец lock (stale lock после SIGKILL/OOM)
      if (existsSync(lockPath)) {
        const rawPid = readFileSync(lockPath, 'utf-8').trim();
            const pid = parseInt(rawPid, 10);
            let alive = false;
            if (!Number.isNaN(pid)) { try { process.kill(pid, 0); alive = true; } catch {} }
            if (alive) { console.warn(`[orchestrator] Уже запущен (PID ${pid} жив). Выход.`); process.exit(0); }
            console.warn(`[orchestrator] Stale lock (PID ${rawPid} не отвечает). Перезаписываю.`);
    }
  writeFileSync(lockPath, String(process.pid));

  // В режиме --retry фильтруем только stale URL
  let urlsToProcess = allUrls;
  if (IS_RETRY) {
    const staleMs = (config.staleThresholdH ?? 24) * 3600 * 1000;
    const lastSuccess = buildLastSuccessMap(logsDir);
    const now = Date.now();
    urlsToProcess = allUrls.filter(({ url }) => {
      const last = lastSuccess.get(url) ?? 0;
      return (now - last) > staleMs;
    });
    console.log(`[orchestrator] RETRY режим. Stale (>${config.staleThresholdH}ч): ${urlsToProcess.length}/${allUrls.length} URL`);
    if (urlsToProcess.length === 0) {
      console.log('[orchestrator] Все URL свежие. Выход.');
      try { unlinkSync(lockPath); } catch {}
      process.exit(0);
    }
  }

  const courtGroups = new Map<string, { type: CourtType; urls: string[] }>();
  for (const { url, courtType, courtId } of urlsToProcess) {
    if (!courtGroups.has(courtId)) courtGroups.set(courtId, { type: courtType, urls: [] });
    courtGroups.get(courtId)!.urls.push(url);
  }

  const totalUrls = urlsToProcess.length;
  console.log(`[orchestrator] ${IS_RETRY ? '[RETRY] ' : ''}Судов: ${courtGroups.size}, URL: ${totalUrls}`);

  const results: RunResult[] = [];

  try {
    for (const [courtId, { type, urls }] of courtGroups) {
      const adapter = ADAPTERS[type];
      if (!adapter) {
        console.warn(`[orchestrator] Нет адаптера для: ${type}`);
        continue;
      }

      const cases = [];

      for (const url of urls) {
        const start = Date.now();
        const caseId = new URL(url).searchParams.get('case_id') ?? url;
        const label = `${courtId} → ${caseId}`;
        try {
          const html = await withRetry(
            () => loadCaseHtml(url, type, config.retry.timeoutMs, config.captcha.apiKey),
            config.retry,
            label
          );
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
          if (err instanceof CaptchaRequiredError) {
            results.push({
              courtId, courtType: type, url,
              success: false, error: 'CAPTCHA',
              duration: Date.now() - start,
              timestamp: new Date().toISOString(),
            });
            console.warn(`[CAPTCHA] ${label}`);
            continue;
          }
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
    try { unlinkSync(lockPath); } catch {}
  }

  const date = new Date().toISOString().slice(0, 10);
  const logPath = resolve(logsDir, `run-log-${date}.json`);
  const logTmp = logPath + '.tmp';
  const existing: RunResult[] = existsSync(logPath)
    ? JSON.parse(readFileSync(logPath, 'utf-8'))
    : [];
  writeFileSync(logTmp, JSON.stringify([...existing, ...results], null, 2), 'utf-8');
  renameSync(logTmp, logPath);

  const ok      = results.filter(r => r.success).length;
  const fail    = results.filter(r => !r.success && r.error !== 'CAPTCHA').length;
  const captcha = results.filter(r => r.error === 'CAPTCHA').length;
  console.log(`[orchestrator] Готово. OK: ${ok}, FAIL: ${fail}, CAPTCHA: ${captcha}`);
}

run().catch(err => {
  console.error('[orchestrator] Критическая ошибка:', err.message);
  process.exit(1);
});
