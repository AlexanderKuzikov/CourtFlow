// packages/viewer/server.ts
// Express-сервер: просмотр дел + control panel.
// Маршруты:
//   GET  /           → UI (public/index.html)
//   GET  /api/cases  → список дел из data/ (с фильтрацией)
//   GET  /api/config → текущий config.json
//   POST /api/config → сохранить config.json (валидация + атомарная запись)
//   POST /api/run    → ручной запуск оркестратора
//   GET  /api/logs   → run-log.json

import express from 'express';
import { loadConfig } from '../core/config.js';

const app = express();
app.use(express.json());
app.use(express.static(new URL('public', import.meta.url).pathname));

const config = loadConfig();

// TODO: реализовать все маршруты
app.get('/api/config', (_req, res) => {
  res.json(loadConfig());
});

app.listen(config.viewer.port, config.viewer.host, () => {
  console.log(`[viewer] http://${config.viewer.host}:${config.viewer.port}`);
});
