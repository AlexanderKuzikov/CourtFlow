// packages/viewer/server.ts
// BUG-003: GET /api/config возвращает SafeAppConfig (без секретных ключей)
// BUG-014: fileURLToPath вместо .pathname — корректный путь на Windows
// reconciliation: /api/cases работает только с активными courtId из watch/ / urls.txt

import express from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { loadConfig, toSafeConfig } from '../core/config.js';
import { loadCourts } from '../core/courts.js';
import { loadUrls } from '../core/urls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const config = loadConfig();
const DATA_DIR = resolve(process.cwd(), config.outputDir);
const LOGS_DIR = resolve(process.cwd(), 'logs');

function getActiveCourtIds(): Set<string> {
  return new Set(loadUrls().map(u => u.courtId));
}

app.get('/api/config', (_req, res) => {
  res.json(toSafeConfig(loadConfig()));
});

app.get('/api/courts', (_req, res) => {
  res.json(loadCourts());
});

app.get('/api/active-courts', (_req, res) => {
  const active = loadUrls();
  const seen = new Map<string, object>();
  for (const u of active) {
    if (!seen.has(u.courtId)) seen.set(u.courtId, { courtId: u.courtId, courtType: u.courtType, url: u.url });
  }
  res.json([...seen.values()]);
});

app.get('/api/cases', (_req, res) => {
  if (!existsSync(DATA_DIR)) return res.json([]);
  const court = _req.query.court as string | undefined;
  const activeCourtIds = getActiveCourtIds();

  try {
    const files = readdirSync(DATA_DIR)
      .filter(f => f.startsWith('cases-') && f.endsWith('.json'))
      .filter(f => {
        if (court && !f.includes(`-${court}-`)) return false;
        const m = f.match(/^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/);
        return m ? activeCourtIds.has(m[1]) : false;
      })
      .sort()
      .reverse();

    const seenCourt = new Set<string>();
    const latestFiles: string[] = [];
    for (const f of files) {
      const m = f.match(/^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/);
      if (m && !seenCourt.has(m[1])) {
        seenCourt.add(m[1]);
        latestFiles.push(f);
      }
    }

    const cases = latestFiles.flatMap(f =>
      JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'))
    );
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/logs', (_req, res) => {
  if (!existsSync(LOGS_DIR)) return res.json([]);
  const days = Math.min(parseInt(_req.query.days as string) || 7, 30);

  try {
    const files = readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('run-log-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, days);

    const entries = files.flatMap(f =>
      JSON.parse(readFileSync(join(LOGS_DIR, f), 'utf-8'))
    );
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Активные запуски: full-прогон и retry-прогон — раздельные PID
let fullPid: number | null = null;
let retryPid: number | null = null;

function spawnOrchestrator(args: string[], onDone: () => void): number | null {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx/esm', 'packages/scheduler/orchestrator.ts', ...args],
    { cwd: process.cwd(), detached: false, stdio: 'inherit' }
  );
  child.on('close', onDone);
  return child.pid ?? null;
}

app.post('/api/run', (_req, res) => {
  if (fullPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: fullPid });
  fullPid = spawnOrchestrator([], () => { fullPid = null; });
  res.json({ started: true, pid: fullPid, mode: 'full' });
});

app.post('/api/run/retry', (_req, res) => {
  if (retryPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: retryPid });
  retryPid = spawnOrchestrator(['--retry'], () => { retryPid = null; });
  res.json({ started: true, pid: retryPid, mode: 'retry' });
});

app.get('/api/run/status', (_req, res) => {
  res.json({
    full:  { running: fullPid  !== null, pid: fullPid },
    retry: { running: retryPid !== null, pid: retryPid },
  });
});

app.post('/api/run/enrich-courts', (_req, res) => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx/esm', 'packages/scheduler/enrich-courts.ts'],
    { cwd: process.cwd(), detached: false, stdio: 'inherit' }
  );
  res.json({ started: true, pid: child.pid ?? null });
});

// FIX (CODE_REVIEW #15): graceful shutdown — pm2 шлёт SIGTERM при restart/stop
const serverInstance = app.listen(config.viewer.port, config.viewer.host, () => {
  console.log(`[viewer] http://${config.viewer.host}:${config.viewer.port}`);
});
