// packages/viewer/server.ts
// BUG-003: GET /api/config возвращает SafeAppConfig (без секретных ключей)

import express from 'express';
import { loadConfig, toSafeConfig } from '../core/config.js';

const app = express();
app.use(express.json());
app.use(express.static(new URL('public', import.meta.url).pathname));

const config = loadConfig();

app.get('/api/config', (_req, res) => {
  res.json(toSafeConfig(loadConfig()));
});

app.get('/api/logs', (_req, res) => {
  // TODO: читать run-log-*.json из logs/
  res.json({ message: 'TODO' });
});

app.post('/api/run', (_req, res) => {
  // TODO: запуск orchestrator.ts через child_process
  res.json({ message: 'TODO' });
});

app.listen(config.viewer.port, config.viewer.host, () => {
  console.log(`[viewer] http://${config.viewer.host}:${config.viewer.port}`);
});
