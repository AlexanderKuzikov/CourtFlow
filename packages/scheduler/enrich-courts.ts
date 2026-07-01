// packages/scheduler/enrich-courts.ts
// Обогащение справочника судов по urls.txt

import { loadUrls } from '../core/urls.js';
import { enrichCourts } from '../core/courts.js';

async function run() {
  const urls = loadUrls();
  const uniq = new Map<string, { courtId: string; courtType: any }>();
  for (const u of urls) {
    if (!uniq.has(u.courtId)) uniq.set(u.courtId, { courtId: u.courtId, courtType: u.courtType });
  }
  const result = await enrichCourts([...uniq.values()]);
  console.log(`[courts] Готово. Всего: ${result.total}, добавлено: ${result.added}`);
}

run().catch(err => {
  console.error('[courts] Критическая ошибка:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
