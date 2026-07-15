// packages/core/courts.ts
// Справочник судов: courts.json + автозаполнение с главной страницы суда.

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { resolve } from 'path';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import https from 'https';
import type { CourtType } from './types.js';

export interface CourtDirectoryItem {
  courtId: string;
  courtType: CourtType;
  name: string;
  shortName: string;
  address: string | null;
  phones: string[];
  email: string | null;
  vnkod: string | null;
  fetchedAt: string;
  sourceUrl: string;
}

const COURTS_PATH = resolve(process.cwd(), 'courts.json');

export function loadCourts(): Record<string, CourtDirectoryItem> {
  if (!existsSync(COURTS_PATH)) return {};
  return JSON.parse(readFileSync(COURTS_PATH, 'utf-8'));
}

export function saveCourts(courts: Record<string, CourtDirectoryItem>) {
  const tmp = COURTS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(courts, null, 2), 'utf-8');
  renameSync(tmp, COURTS_PATH);
}

export function detectCharset(contentType: string | null): string {
  if (!contentType) return 'win1251';
  const m = contentType.match(/charset=([\w-]+)/i);
  const cs = m?.[1]?.toLowerCase();
  if (cs === 'utf-8' || cs === 'utf8') return 'utf8';
  return 'win1251';
}

async function fetchHtml(url: string, timeoutMs = 15000): Promise<string> {
  // *.msudrf.ru — самоподписанные wildcard-сертификаты, нужен rejectUnauthorized: false
  const isInsecure = url.includes('.msudrf.ru');
  if (isInsecure) {
    return new Promise<string>((resolve, reject) => {
      const parsed = new URL(url);
      const chunks: any[] = [];
      let ctype = 'charset=win1251';
      https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' },
      }, (res) => {
        const hdr = res.headers['content-type'];
        if (typeof hdr === 'string') ctype = hdr;
        else if (Array.isArray(hdr)) ctype = hdr[0] ?? ctype;
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const charset = detectCharset(ctype);
          const raw = Buffer.concat(chunks);
          resolve(iconv.decode(raw, charset));
        });
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const charset = detectCharset(res.headers.get('content-type'));
  const buf = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buf), charset);
}

function normalizeText(s: string): string {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchCourtDirectoryItem(courtId: string, courtType: CourtType): Promise<CourtDirectoryItem> {
  const sourceUrl = courtType === 'magistrate'
    ? `https://${courtId}.msudrf.ru/`
    : `https://${courtId}.sudrf.ru/`;

  const html = await fetchHtml(sourceUrl);
      // FIX (CODE_REVIEW #1): decodeEntities удалён — в cheerio 1.x эта опция убрана из CheerioOptions.
      const $ = cheerio.load(html);

  const name = courtType === 'magistrate'
    ? normalizeText($('span#court_name').first().text()) || normalizeText($('footer p').first().text()) || courtId
    : normalizeText($('h5.heading.heading_title').first().text()) || courtId;
  let address: string | null = null;
  let email: string | null = null;
  let phones: string[] = [];

  if (courtType === 'magistrate') {
    // Magistrate: другая структура — адрес под h2 "Адрес", телефоны у сотрудников
    $('h2').each((_i, el) => {
      if ($(el).text().trim() === 'Адрес') {
        const addrP = $(el).next('p');
        if (addrP.length) address = normalizeText(addrP.text());
      }
    });
    // Все unique email из mailto-ссылок
    const emailSet = new Set<string>();
    $('a[href^="mailto:"]').each((_i, el) => {
      const m = $(el).attr('href')?.replace(/^mailto:/i, '').trim();
      if (m) emailSet.add(m);
    });
    email = [...emailSet][0] ?? null;
    // Телефоны — собираем все упоминания
    const bodyText = $('.content').text();
    const phoneMatches = [...bodyText.matchAll(/Телефон:\s*([\d\s()\-–,]+)/g)];
    phones = phoneMatches.map(m => normalizeText(m[0]));
  } else {
    // District/appeal/cassation: стандартная структура с #show
    const addrHtml = $('#show').html() ?? '';
    const parts = addrHtml.split(/<br\s*\/?>/i).map(s => normalizeText(cheerio.load(s).text())).filter(Boolean);
    address = parts[0] ?? null;
    email = $('#show a[href^="mailto:"]').attr('href')?.replace(/^mailto:/i, '').trim() ?? null;
    phones = parts.slice(1).filter(line => !/@/.test(line) && !/^mailto:/i.test(line));
  }

  return {
    courtId,
    courtType,
    name,
    shortName: name,
    address,
    phones,
    email,
    vnkod: null,
    fetchedAt: new Date().toISOString(),
    sourceUrl,
  };
}

export async function enrichCourts(items: Array<{ courtId: string; courtType: CourtType }>) {
  const courts = loadCourts();
  let added = 0;

  for (const { courtId, courtType } of items) {
    if (courts[courtId]) continue;
    try {
      courts[courtId] = await fetchCourtDirectoryItem(courtId, courtType);
      added++;
      console.log(`[courts] + ${courtId} → ${courts[courtId].name}`);
    } catch (err) {
      console.warn(`[courts] FAIL ${courtId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  saveCourts(courts);
  return { total: Object.keys(courts).length, added };
}