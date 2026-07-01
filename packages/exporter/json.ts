// packages/exporter/json.ts
// BUG-006: мержинг по uid — повторный запуск не стирает данные.
// Файл: cases-{courtId}-{date}.json. Новые данные обновляют существующие записи по uid.

import { writeFileSync, readFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Case } from '../core/types.js';

export function exportJson(cases: Case[], outputDir: string, courtId: string): string {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `cases-${courtId}-${date}.json`;
  const filepath = resolve(outputDir, filename);
  const tmp = filepath + '.tmp';

  // BUG-006: читаем существующие данные, мержим по uid
  const existing: Case[] = existsSync(filepath)
    ? JSON.parse(readFileSync(filepath, 'utf-8'))
    : [];

  const byUid = new Map<string, Case>(existing.map(c => [c.uid, c]));
  for (const c of cases) byUid.set(c.uid, c);
  const merged = Array.from(byUid.values());

  writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf-8');
  renameSync(tmp, filepath);

  const updated = cases.filter(c => existing.some(e => e.uid === c.uid)).length;
  const added   = cases.length - updated;
  console.log(`[json] ${filename}: +${added} новых, ~${updated} обновлено, всего ${merged.length} дел`);
  return filepath;
}
