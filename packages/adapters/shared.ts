// packages/adapters/shared.ts
// Общие утилиты для всех адаптеров. Вынесено из district.ts, appeal.ts, cassation.ts.

import { type CourtType } from '../core/types.js';

export function extractCourtSubdomain(url: string, courtType: CourtType): string {
  try {
    const suffix = courtType === 'magistrate' ? /\.msudrf\.ru$/ : /\.sudrf\.ru$/;
    return new URL(url).hostname.replace(suffix, '');
  } catch {
    return 'unknown';
  }
}

export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parsePublishInfo(text: string): { publishedAt: string | null; modifiedAt: string | null } {
  const pubM = text.match(/опубликован\w*\s+([\d.]+\s+[\d:]+)/);
  const modM = text.match(/изменено\s+([\d.]+\s+[\d:]+)/);
  const toIso = (s: string) => {
    const [date, time] = s.trim().split(/\s+/);
    const d = parseDate(date);
    return d ? `${d}T${time ?? '00:00'}:00` : null;
  };
  return {
    publishedAt: pubM ? toIso(pubM[1]) : null,
    modifiedAt:  modM ? toIso(modM[1]) : null,
  };
}

export function cleanText(text: string | undefined | null): string | null {
  if (!text) return null;
  const value = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return value || null;
}
