// packages/core/urls.ts
// Источник URL для мониторинга:
//   1. Папка watch/ — любые файлы, любой формат (нормализатор разберёт)
//   2. Fallback: urls.txt (обратная совместимость)
//
// Нормализатор: снимает кавычки, разделители (пробел/запятая/точка с запятой),
// добавляет https:// если нет схемы, валидирует через new URL().
// Удаление файла из watch/ = прекращение мониторинга URL из него.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import type { CourtType } from './types.js';

export interface ParsedUrl {
  url: string;
  courtType: CourtType;
  courtId: string;
  sourceFile: string; // из какого файла взят URL (для отладки)
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
 * Снимает кавычки, разбивает по любым разделителям, добавляет схему если нет.
 */
export function extractUrls(raw: string): string[] {
  return raw
    .replace(/["'`]/g, '')
    .split(/[\s,;\|\r\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .map(s => {
      // Нормализуем слэши (обратные → прямые)
      s = s.replace(/\\/g, '/');
      // Добавляем схему если отсутствует
      if (/^///i.test(s)) s = 'https:' + s;
      else if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
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
 * Загружает все URL из папки watch/ (рекурсивно, любые файлы).
 * Если watch/ не существует — fallback на urls.txt.
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
        if (stat.isDirectory()) {
          scanDir(full);
          continue;
        }
        let raw: string;
        try {
          raw = readFileSync(full, 'utf-8');
        } catch {
          // Бинарный или нечитаемый файл — пропускаем
          continue;
        }
        for (const url of extractUrls(raw)) {
          if (seen.has(url)) continue;
          seen.add(url);
          results.push({
            url,
            courtType: detectCourtType(url),
            courtId:   extractCourtId(url),
            sourceFile: full,
          });
        }
      }
    };

    scanDir(watchDir);

    if (results.length > 0) {
      console.log(`[urls] watch/: ${results.length} URL из ${[...new Set(results.map(r => r.sourceFile))].length} файлов`);
      return results;
    }
    console.warn('[urls] watch/ пуста — fallback на urls.txt');
  }

  // Fallback: urls.txt
  const urlsFile = resolve(cwd, 'urls.txt');
  if (!existsSync(urlsFile)) {
    console.warn(`[urls] Файл не найден: ${urlsFile}`);
    return [];
  }

  const raw = readFileSync(urlsFile, 'utf-8');
  const urls = extractUrls(raw);
  console.log(`[urls] urls.txt: ${urls.length} URL`);
  return urls.map(url => ({
    url,
    courtType: detectCourtType(url),
    courtId:   extractCourtId(url),
    sourceFile: urlsFile,
  }));
}
