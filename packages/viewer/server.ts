// packages/viewer/server.ts

import express from 'express';
import {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
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
    const server = createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

function identifyProcess(port: number): string {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `netstat -ano | findstr :${port}`,
        { encoding: 'utf-8', windowsHide: true },
      );

      const pid = out.match(/LISTENING\s+(\d+)/)?.[1];

      if (pid) {
        const task = execSync(
          `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
          { encoding: 'utf-8', windowsHide: true },
        );

        const name = task.match(/"([^"]+)"/)?.[1] || pid;
        return ` (PID ${pid}, ${name})`;
      }
    } else {
      const pid = execSync(
        `lsof -ti :${port} -sTCP:LISTEN 2>/dev/null`,
        { encoding: 'utf-8' },
      ).trim();

      if (pid) return ` (PID ${pid})`;
    }
  } catch {
    // Diagnostic only.
  }

  return '';
}

async function findPort(start: number, host: string): Promise<number> {
  for (let port = start; port <= start + 100; port++) {
    if (await checkPort(port, host)) return port;

    console.log(
      `[viewer] Порт ${port} занят${identifyProcess(port)}, пробую ${port + 1}…`,
    );
  }

  throw new Error('Не удалось найти свободный порт в диапазоне +100');
}

// ─── Express ─────────────────────────────────────────────

const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

function getActiveCourtIds(): Set<string> {
  return new Set(loadUrls().map(url => url.courtId));
}

app.get('/api/config', (_req, res) => {
  res.json(toSafeConfig(loadConfig()));
});

app.get('/api/courts', (_req, res) => {
  res.json(loadCourts());
});

app.get('/api/active-courts', (_req, res) => {
  const seen = new Map<string, object>();

  for (const url of loadUrls()) {
    if (!seen.has(url.courtId)) {
      seen.set(url.courtId, {
        courtId: url.courtId,
        courtType: url.courtType,
        url: url.url,
      });
    }
  }

  res.json([...seen.values()]);
});

app.get('/api/cases', (req, res) => {
  if (!existsSync(DATA_DIR)) {
    return res.json([]);
  }

  const court = req.query.court as string | undefined;
  const activeCourtIds = getActiveCourtIds();

  try {
    const files = readdirSync(DATA_DIR)
      .filter(file => file.startsWith('cases-') && file.endsWith('.json'))
      .filter(file => {
        if (court && !file.includes(`-${court}-`)) {
          return false;
        }

        const match = file.match(
          /^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/,
        );

        return Boolean(match && activeCourtIds.has(match[1]));
      })
      .sort()
      .reverse();

    const seenCourts = new Set<string>();

    const latestFiles = files.filter(file => {
      const match = file.match(
        /^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/,
      );

      if (!match || seenCourts.has(match[1])) {
        return false;
      }

      seenCourts.add(match[1]);
      return true;
    });

    const cases = latestFiles.flatMap(file => {
      return JSON.parse(
        readFileSync(join(DATA_DIR, file), 'utf-8'),
      );
    });

    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/logs', (req, res) => {
  if (!existsSync(LOGS_DIR)) {
    return res.json([]);
  }

  const days = Math.min(
    parseInt(req.query.days as string, 10) || 7,
    30,
  );

  try {
    const files = readdirSync(LOGS_DIR)
      .filter(file => {
        return (
          file.startsWith('run-log-') &&
          file.endsWith('.json')
        );
      })
      .sort()
      .reverse()
      .slice(0, days);

    const entries = files.flatMap(file => {
      return JSON.parse(
        readFileSync(join(LOGS_DIR, file), 'utf-8'),
      );
    });

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Background jobs ─────────────────────────────────────

let fullPid: number | null = null;
let retryPid: number | null = null;
let enrichPid: number | null = null;

function spawnJob(
  script: string,
  args: string[],
  onDone: () => void,
): number | null {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx/esm', script, ...args],
    {
      cwd: CWD,
      detached: false,
      stdio: 'inherit',
    },
  );

  child.once('close', onDone);
  child.once('error', onDone);

  return child.pid ?? null;
}

app.post('/api/run', (_req, res) => {
  if (fullPid !== null) {
    return res.status(409).json({
      error: 'Уже запущен',
      pid: fullPid,
    });
  }

  fullPid = spawnJob(
    'packages/scheduler/orchestrator.ts',
    [],
    () => {
      fullPid = null;
    },
  );

  res.json({
    started: fullPid !== null,
    pid: fullPid,
    mode: 'full',
  });
});

app.post('/api/run/retry', (_req, res) => {
  if (retryPid !== null) {
    return res.status(409).json({
      error: 'Уже запущен',
      pid: retryPid,
    });
  }

  retryPid = spawnJob(
    'packages/scheduler/orchestrator.ts',
    ['--retry'],
    () => {
      retryPid = null;
    },
  );

  res.json({
    started: retryPid !== null,
    pid: retryPid,
    mode: 'retry',
  });
});

app.get('/api/run/status', (_req, res) => {
  res.json({
    full: {
      running: fullPid !== null,
      pid: fullPid,
    },
    retry: {
      running: retryPid !== null,
      pid: retryPid,
    },
    enrich: {
      running: enrichPid !== null,
      pid: enrichPid,
    },
  });
});

app.post('/api/run/enrich-courts', (_req, res) => {
  if (enrichPid !== null) {
    return res.status(409).json({
      error: 'Уже запущен',
      pid: enrichPid,
    });
  }

  enrichPid = spawnJob(
    'packages/scheduler/enrich-courts.ts',
    [],
    () => {
      enrichPid = null;
    },
  );

  res.json({
    started: enrichPid !== null,
    pid: enrichPid,
  });
});

// ─── Startup / shutdown ──────────────────────────────────

async function startServer(): Promise<void> {
  const actualPort = await findPort(
    config.viewer.port,
    config.viewer.host,
  );

  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  writeFileSync(
    resolve(LOGS_DIR, '.port'),
    String(actualPort),
    'utf-8',
  );

  const server = app.listen(
    actualPort,
    config.viewer.host,
    () => {
      console.log(
        `[viewer] http://${config.viewer.host}:${actualPort}`,
      );
    },
  );

  let stopping = false;

  function stopChild(pid: number | null): void {
    if (pid === null) return;

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Child already exited.
    }
  }

  function shutdown(signal: string): void {
    if (stopping) return;

    stopping = true;

    console.log(
      `[viewer] Получен ${signal}, закрываю сервер…`,
    );

    stopChild(fullPid);
    stopChild(retryPid);
    stopChild(enrichPid);

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
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