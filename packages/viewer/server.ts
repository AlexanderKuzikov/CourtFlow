// packages/viewer/server.ts
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

function checkPort(port: number, host: string): Promise<boolean> { return new Promise(resolve => { const s = createServer(); s.once('error', () => resolve(false)); s.once('listening', () => s.close(() => resolve(true))); s.listen(port, host); }); }
function identifyProcess(port: number): string { try { if (process.platform === 'win32') { const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true }); const pid = out.match(/LISTENING\s+(\d+)/)?.[1]; if (pid) { const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8', windowsHide: true }); return ` (PID ${pid}, ${task.match(/"([^"]+)"/)?.[1] || pid})`; } } else { const pid = execSync(`lsof -ti :${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf-8' }).trim(); if (pid) return ` (PID ${pid})`; } } catch { /* diagnostic only */ } return ''; }
async function findPort(start: number, host: string): Promise<number> { for (let port = start; port <= start + 100; port++) { if (await checkPort(port, host)) return port; console.log(`[viewer] Порт ${port} занят${identifyProcess(port)}, пробую ${port + 1}…`); } throw new Error('Не удалось найти свободный порт в диапазоне +100'); }

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
function getActiveCourtIds(): Set<string> { return new Set(loadUrls().map(u => u.courtId)); }
app.get('/api/config', (_req, res) => res.json(toSafeConfig(loadConfig())));
app.get('/api/courts', (_req, res) => res.json(loadCourts()));
app.get('/api/active-courts', (_req, res) => { const seen = new Map<string, object>(); for (const u of loadUrls()) if (!seen.has(u.courtId)) seen.set(u.courtId, { courtId: u.courtId, courtType: u.courtType, url: u.url }); res.json([...seen.values()]); });
app.get('/api/cases', (req, res) => { if (!existsSync(DATA_DIR)) return res.json([]); const court = req.query.court as string | undefined; const active = getActiveCourtIds(); try { const files = readdirSync(DATA_DIR).filter(f => f.startsWith('cases-') && f.endsWith('.json')).filter(f => { if (court && !f.includes(`-${court}-`)) return false; const m = f.match(/^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/); return !!m && active.has(m[1]); }).sort().reverse(); const seen = new Set<string>(); const latest = files.filter(f => { const m = f.match(/^cases-(.+)-\d{4}-\d{2}-\d{2}\.json$/); if (!m || seen.has(m[1])) return false; seen.add(m[1]); return true; }); res.json(latest.flatMap(f => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8')))); } catch (err) { res.status(500).json({ error: String(err) }); } });
app.get('/api/logs', (req, res) => { if (!existsSync(LOGS_DIR)) return res.json([]); const days = Math.min(parseInt(req.query.days as string) || 7, 30); try { const files = readdirSync(LOGS_DIR).filter(f => f.startsWith('run-log-') && f.endsWith('.json')).sort().reverse().slice(0, days); res.json(files.flatMap(f => JSON.parse(readFileSync(join(LOGS_DIR, f), 'utf-8')))); } catch (err) { res.status(500).json({ error: String(err) }); } });

let fullPid: number | null = null;
let retryPid: number | null = null;
let enrichPid: number | null = null;
function spawnJob(script: string, args: string[], done: () => void): number | null { const child = spawn(process.execPath, ['--import', 'tsx/esm', script, ...args], { cwd: CWD, detached: false, stdio: 'inherit' }); child.once('close', done); child.once('error', done); return child.pid ?? null; }
app.post('/api/run', (_req, res) => { if (fullPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: fullPid }); fullPid = spawnJob('packages/scheduler/orchestrator.ts', [], () => { fullPid = null; }); res.json({ started: fullPid !== null, pid: fullPid, mode: 'full' }); });
app.post('/api/run/retry', (_req, res) => { if (retryPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: retryPid }); retryPid = spawnJob('packages/scheduler/orchestrator.ts', ['--retry'], () => { retryPid = null; }); res.json({ started: retryPid !== null, pid: retryPid, mode: 'retry' }); });
app.get('/api/run/status', (_req, res) => res.json({ full: { running: fullPid !== null, pid: fullPid }, retry: { running: retryPid !== null, pid: retryPid }, enrich: { running: enrichPid !== null, pid: enrichPid } }));
app.post('/api/run/enrich-courts', (_req, res) => { if (enrichPid !== null) return res.status(409).json({ error: 'Уже запущен', pid: enrichPid }); enrichPid = spawnJob('packages/scheduler/enrich-courts.ts', [], () => { enrichPid = null; }); res.json({ started: enrichPid !== null, pid: enrichPid }); });

async function startServer(): Promise<void> { const actualPort = await findPort(config.viewer.port, config.viewer.host); if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true }); writeFileSync(resolve(LOGS_DIR, '.port'), String(actualPort), 'utf-8'); const server = app.listen(actualPort, config.viewer.host, () => console.log(`[viewer] http://${config.viewer.host}:${actualPort}`)); let stopping = false; const shutdown = (signal: string) => { if (stopping) return; stopping = true; console.log(`[viewer] Получен ${signal}, закрываю сервер…`); for (const pid of [fullPid, retryPid, enrichPid]) if (pid !== null) try { process.kill(pid, 'SIGTERM'); } catch { /* already exited */ } server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000); }; process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT')); }
startServer().catch(err => { console.error('[viewer]', err.message); process.exit(1); });
