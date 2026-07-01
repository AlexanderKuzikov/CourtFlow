// packages/viewer/server.ts
// BUG-003: GET /api/config возвращает SafeAppConfig (без секретных ключей)

import express from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { spawn } from 'child_process';
import { loadConfig, toSafeConfig } from '../core/config.js';

const app = express();
app.use(express.json());
app.use(express.static(new URL('public', import.meta.url).pathname));

const config = loadConfig();
const DATA_DIR = resolve(process.cwd(), config.outputDir);
const LOGS_DIR = resolve(process.cwd(), 'logs');

// GET /api/config — без ключей
app.get('/api/config', (_req, res) => {
  res.json(toSafeConfig(loadConfig()));
});

// GET /api/cases — список дел из последнего JSON по каждому суду
// ?court=sverdlov--perm — фильтр по поддомену
app.get('/api/cases', (_req, res) => {
  if (!existsSync(DATA_DIR)) return res.json([]);
  const court = _req.query.court as string | undefined;

  try {
    const files = readdirSync(DATA_DIR)
      .filter(f => f.startsWith('cases-') && f.endsWith('.json'))
      .filter(f => !court || f.includes(`-${court}-`))
      .sort()
      .reverse();

    // Для каждого суда — только последний файл
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

// GET /api/logs — последние N записей из run-log-*.json
// ?days=7 (default 7)
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

// POST /api/run — запуск orchestrator через child_process (fire & forget)
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

// GET /api/run/status
app.get('/api/run/status', (_req, res) => {
  res.json({ running: runningPid !== null, pid: runningPid });
});

app.listen(config.viewer.port, config.viewer.host, () => {
  console.log(`[viewer] http://${config.viewer.host}:${config.viewer.port}`);
});
