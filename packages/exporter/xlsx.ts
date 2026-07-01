// packages/exporter/xlsx.ts
// Генерация XLSX из массива Case. Вызывается автоматически после json.ts.

import type { Case } from '../core/types.js';

export async function exportXlsx(cases: Case[], outputDir: string, courtId: string): Promise<string> {
  // TODO: использовать exceljs
  // Колонки: uid, number, type, court, judge, filingDate, hearingDate, result, parties
  throw new Error('exportXlsx: не реализован');
}
