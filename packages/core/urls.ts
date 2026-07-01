// packages/core/urls.ts
// Чтение urls.txt и определение типа суда по URL.
// Добавить дело — одна строка в urls.txt, без изменения кода.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { CourtType } from './types.js';

export interface ParsedUrl {
  url: string;
  courtType: CourtType;
  courtId: string;  // поддомен, например "sverdlov--perm" или "35.perm"
}

// Определяем тип суда по delo_id и домену
export function detectCourtType(url: string): CourtType {
  const u = new URL(url);
  const host = u.hostname;
  const deloId = u.searchParams.get('delo_id') ?? u.searchParams.get('new') ?? '';

  if (host.includes('.msudrf.ru')) return 'magistrate';
  if (deloId === '2800001') return 'cassation';
  if (deloId === '5') return 'appeal';
  return 'district';
}

export function extractCourtId(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('.msudrf.ru')) {
      // 35.perm.msudrf.ru → "35.perm"
      return host.replace('.msudrf.ru', '');
    }
    // sverdlov--perm.sudrf.ru → "sverdlov--perm"
    return host.replace('.sudrf.ru', '');
  } catch {
    return 'unknown';
  }
}

export function loadUrls(urlsFile = resolve(process.cwd(), 'urls.txt')): ParsedUrl[] {
  if (!existsSync(urlsFile)) {
    console.warn(`[urls] Файл не найден: ${urlsFile}`);
    return [];
  }

  const lines = readFileSync(urlsFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  return lines.map(url => ({
    url,
    courtType: detectCourtType(url),
    courtId:   extractCourtId(url),
  }));
}
