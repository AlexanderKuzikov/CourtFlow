// packages/viewer/server.ts
// BUG-003: GET /api/config возвращает SafeAppConfig (без секретных ключей)
// BUG-014: fileURLToPath вместо .pathname — корректный путь на Windows
// reconciliation: /api/cases работает только с активными courtId из watch/ / urls.txt
// port: авто-поиск свободного порта если желаемый занят, результат → logs/.port

import express from 'express';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { createServer } from 'net';
import { loadConfig, toSafeConfig } from '../core/config.js';
import { loadCourts } from '../core/courts.js';
import { loadUrls } from '../core/urls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();

const config = loadConfig();
const DATA_DIR = resolve(CWD, config.outputDir);
const LOGS_DIR = resolve(CWD, 'logs');

// ─── Поиск свободного порта ──────────────────────────────

function checkPort(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(() => resolve(true)); });
    s.listen(port, host);
  });
}

function identifyProcess(port: number): string {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
      const pid = out.match(/LISTENING\s+(\d+)/)?.[1];
      if (pid) {
        const t = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8', windowsHide: true });
        const name = t.match(/"([^"]+)"/)?.[1] || pid;
        return ` (PID ${pid}, ${name})`;
      }
    } else {
      const pid = execSync(`lsof -ti :${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (pid) {
        const comm = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, { encoding: 'utf-8' }).trim();
        return ` (PID ${pid}${comm ? ', ' + comm : ''})`;
      }
    }
  } catch { /* ignore */ }
  return '';
}

async function findPort(start: number, host: string): Promise<number> {
  let port = start;
  while (true) {
    if (await checkPort(port, host)) return port;
    console.log(`[viewer] Порт ${port} занят${identifyProcess(port)}, пробую ${port + 1}…`);
    port++;
    if (port > start + 100) throw new Error('Не удалось найти свободный порт в диапазоне +100');
  }
}

// ─── Express ─────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

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
    { cwd: CWD, detached: false, stdio: 'inherit' }
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
    { cwd: CWD, detached: false, stdio: 'inherit' }
  );
  res.json({ started: true, pid: child.pid ?? null });
});

// ─── Старт с авто-поиском порта ──────────────────────────

async function startServer(): Promise<void> {
  const actualPort = await findPort(config.viewer.port, config.viewer.host);
  const wasSwitched = actualPort !== config.viewer.port;

  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(resolve(LOGS_DIR, '.port'), String(actualPort), 'utf-8');

  const serverInstance = app.listen(actualPort, config.viewer.host, () => {
    const url = `http://${config.viewer.host}:${actualPort}`;
    console.log(`[viewer] ${url}`);
    if (wasSwitched) console.log(`[viewer] ⚠ Порт по умолчанию ${config.viewer.port} был занят`);
  });

  function shutdown(signal: string) {
    console.log(`[viewer] Получен ${signal}, закрываю сервер…`);
    serverInstance.close(() => {
      console.log('[viewer] Сервер закрыт, завершаю процесс');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[viewer] Force exit после таймаута graceful shutdown');
      process.exit(1);
    }, 5000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('[viewer]', err.message);
  process.exit(1);
});
