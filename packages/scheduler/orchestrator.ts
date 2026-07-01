// packages/scheduler/orchestrator.ts
// Точка входа для cron и ручного запуска.
// Читает config.json при каждом запуске (не кэширует — изменения через UI применяются сразу).
// Запускает адаптеры для всех enabled судов, пишет run-log.json.

import { loadConfig, getEnabledCourts } from '../core/config.js';
import type { RunResult } from '../core/types.js';

async function run() {
  const config = loadConfig();
  const courts = getEnabledCourts(config);

  console.log(`[orchestrator] Запуск. Судов к обработке: ${courts.length}`);

  const results: RunResult[] = [];

  for (const court of courts) {
    for (const url of court.urls) {
      // TODO:
      // 1. Выбрать адаптер по court.type
      // 2. Получить HTML (node-fetch или Puppeteer для magistrate)
      // 3. Вызвать adapter.parse(html, url) с withRetry
      // 4. Передать результат в exporter
      // 5. Записать RunResult в results
      console.log(`[orchestrator] TODO: ${court.id} → ${url}`);
    }
  }

  // TODO: записать results в logs/run-log.json
  console.log(`[orchestrator] Завершено. Обработано: ${results.length}`);
}

run().catch(err => {
  console.error('[orchestrator] Критическая ошибка:', err.message);
  process.exit(1);
});
