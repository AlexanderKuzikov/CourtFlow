// packages/viewer/server.ts
// BUG-003: GET /api/config возвращает SafeAppConfig (без секретных ключей)
// BUG-014: fileURLToPath вместо .pathname — корректный путь на Windows
// reconciliation: /api/cases и /api/active-courts работают только с активными courtId из watch/ или urls.txt

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

/** Возвращает Set активных courtId из watch/ или urls.txt */
function getActiveCourtIds(): Set<string> {
  return new Set(loadUrls().map(u => u.courtId));
}

app.get('/api/config', (_req, res) => {
  res.json(toSafeConfig(loadConfig()));
});

app.get('/api/courts', (_req, res) => {
  res.json(loadCourts());
});

// Возвращает список активных courtId (для UI — точный счётчик судов)
app.get('/api/active-courts', (_req, res) => {
  const active = loadUrls();
  const courts = Object.fromEntries(
    active.map(u => [u.courtId, { courtId: u.courtId, courtType: u.courtType, url: u.url }])
  );
  res.json(Object.values(courts));
});

app.get('/api/cases', (_req, res) => {
  if (!existsSync(DATA_DIR)) return res.json([]);
  const court = _req.query.court as string | undefined;

  // reconciliation: только активные суды
  const activeCourtIds = getActiveCourtIds();

  try {
    const files = readdirSync(DATA_DIR)
      .filter(f => f.startsWith('cases-') && f.endsWith('.json'))
      .filter(f => {
        // Фильтр по запрошенному суду (если задан)
        if (court && !f.includes(`-${court}-`)) return false;
        // Reconciliation: исключаем суды которых нет в watch/ / urls.txt
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

let runningPid: number | null = null;

app.post('/api/run', (_req, res) => {
  if (runningPid !== null) {
    return res.status(409).json({ error: 'Уже запущен', pid: runningPid });
  }
  const child = spawn(
    process.execPath,
    ['--import', 'tsx/esm', 'packages/scheduler/orchestrator.ts'],
    { cwd: process.cwd(), detached: false, stdio: 'inherit' }
  );
  runningPid = child.pid ?? null;
  child.on('close', () => { runningPid = null; });
  res.json({ started: true, pid: runningPid });
});

app.get('/api/run/status', (_req, res) => {
  res.json({ running: runningPid !== null, pid: runningPid });
});

app.listen(config.viewer.port, config.viewer.host, () => {
  console.log(`[viewer] http://${config.viewer.host}:${config.viewer.port}`);
});
