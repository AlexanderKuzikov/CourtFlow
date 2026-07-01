// packages/exporter/json.ts
// Атомарная запись JSON: пишем во временный файл, затем rename.

import { writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Case } from '../core/types.js';

export function exportJson(cases: Case[], outputDir: string, courtId: string): string {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `cases-${courtId}-${date}.json`;
  const filepath = resolve(outputDir, filename);
  const tmp = filepath + '.tmp';

  writeFileSync(tmp, JSON.stringify(cases, null, 2), 'utf-8');
  renameSync(tmp, filepath);

  console.log(`[json] Сохранено: ${filename} (${cases.length} дел)`);
  return filepath;
}
