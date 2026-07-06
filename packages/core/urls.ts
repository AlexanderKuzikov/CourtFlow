// packages/core/urls.ts
// Источник URL для мониторинга:
//   1. Папка watch/ — любые файлы (текст, JSON, CSV и пр.)
//   2. Fallback: urls.txt
//
// Нормализатор: извлекает все строки содержащие sudrf/msudrf URL
// из любого текста (кавычки, разделители, JSON-синтаксис, без https:// и пр.).
// Удаление файла из watch/ = прекращение мониторинга.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import type { CourtType } from './types.js';

export interface ParsedUrl {
  url: string;
  courtType: CourtType;
  courtId: string;
  sourceFile: string;
}

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
    if (host.includes('.msudrf.ru')) return host.replace('.msudrf.ru', '');
    return host.replace('.sudrf.ru', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Извлекает все валидные sudrf/msudrf URL из произвольного текста.
 * Обрабатывает: .txt, .json, .csv, любые другие форматы.
 * Извлекает URL из JSON-значений, CSV-полей, простого текста.
 */
export function extractUrls(raw: string): string[] {
  // Стрипаем JSON/CSV синтаксис и кавычки
  const cleaned = raw
    .replace(/[\[\]{}:,]/g, ' ')  // JSON синтаксис
    .replace(/["'`]/g, ' ')       // кавычки
    .replace(/\\/g, '/');         // бэкслэшы

  return cleaned
    .split(/[\s;\|\r\n]+/)
    .map(s => s.trim().replace(/\/+$/, ''))  // trailing slashes
    .filter(s => s.length > 10)
    .map(s => {
      if (/^\/\//i.test(s)) return 'https:' + s;
      if (!/^https?:\/\//i.test(s)) return 'https://' + s;
      return s;
    })
    .filter(s => {
      try {
        const u = new URL(s);
        return u.hostname.endsWith('.sudrf.ru') || u.hostname.endsWith('.msudrf.ru');
      } catch {
        return false;
      }
    });
}

/**
 * Загружает все URL из watch/ (рекурсивно). Fallback на urls.txt.
 */
export function loadUrls(cwd = process.cwd()): ParsedUrl[] {
  const watchDir = resolve(cwd, 'watch');

  if (existsSync(watchDir)) {
    const results: ParsedUrl[] = [];
    const seen = new Set<string>();

    const scanDir = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) { scanDir(full); continue; }
        let raw: string;
        try {
          raw = readFileSync(full, 'utf-8');
        } catch {
          continue; // бинарный / нечитаемый — пропускаем
        }
        for (const url of extractUrls(raw)) {
          if (seen.has(url)) continue;
          seen.add(url);
          results.push({ url, courtType: detectCourtType(url), courtId: extractCourtId(url), sourceFile: full });
        }
      }
    };

    scanDir(watchDir);

    if (results.length > 0) {
      const files = new Set(results.map(r => r.sourceFile)).size;
      console.log(`[urls] watch/: ${results.length} URL из ${files} файлов`);
      return results;
    }
    console.warn('[urls] watch/ пуста — fallback на urls.txt');
  }

  const urlsFile = resolve(cwd, 'urls.txt');
  if (!existsSync(urlsFile)) {
    console.warn(`[urls] Файл не найден: ${urlsFile}`);
    return [];
  }

  const raw = readFileSync(urlsFile, 'utf-8');
  const urls = extractUrls(raw);
  console.log(`[urls] urls.txt: ${urls.length} URL`);
  return urls.map(url => ({ url, courtType: detectCourtType(url), courtId: extractCourtId(url), sourceFile: urlsFile }));
}
