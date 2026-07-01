// packages/adapters/district.ts
// Адаптер для районных судов (*.sudrf.ru, delo_id=1540005)

import * as cheerio from 'cheerio';
import type { Case, CaseEvent, CaseParty, CourtAdapter } from '../core/types.js';

function extractCourtSubdomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/\.sudrf\.ru$/, '');
  } catch {
    return 'unknown';
  }
}

function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export class DistrictAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    const $ = cheerio.load(html, { decodeEntities: false });

    // BUG-009: uid ищем в HTML, fallback — case_uid из URL
    const parsedUrl = new URL(url);
    const uidFromHtml = $('#cont1 a[href*="judicial_uid"]').text().trim()
      || $('a[href*="judicial_uid"]').first().text().trim();
    const uid = uidFromHtml || parsedUrl.searchParams.get('case_uid') || parsedUrl.searchParams.get('case_id') || '';

    if (!uid) throw new Error(`DistrictAdapter: не удалось определить UID`);

    const type = $('div.title, h1.case-title, .delo_name').first().text().trim();
    const number = $('div.casenumber, .case-num, span[class*="number"]').first().text().replace(/ДЕЛО\s*№/i, '').trim();

    // Карточка дела
    const rawCard: Record<string, string> = {};
    $('#cont1 table tr, #tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 2) {
        const key = tds.eq(0).text().replace(':', '').trim();
        if (key) rawCard[key] = tds.eq(1).html() ?? '';
      }
    });

    const categoryRaw = rawCard['Категория дела'] ?? '';
    const category = categoryRaw
      .split(/<br\s*\/?>/i)
      .map(s => cheerio.load(s).text().replace(/&rarr;/g, '').trim())
      .filter(Boolean);

    // Движение дела
    const events: CaseEvent[] = [];
    $('#cont2 table tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 6) return;
      const col = (j: number) => tds.eq(j).text().trim() || null;
      events.push({
        eventName:   col(0),
        eventDate:   parseDate(col(1)),
        eventTime:   col(2),
        location:    col(3),
        result:      col(4),
        reason:      col(5),
        note:        tds.length > 6 ? col(6) : null,
        publishDate: tds.length > 7 ? parseDate(col(7)) : null,
      });
    });

    // Стороны
    const parties: CaseParty[] = [];
    $('#cont3 table tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const col = (j: number) => tds.eq(j)?.text().trim() || null;
      parties.push({
        role:   col(0),
        name:   col(1),
        inn:    col(2) ?? null,
        kpp:    col(3) ?? null,
        ogrn:   col(4) ?? null,
        ogrnip: col(5) ?? null,
      });
    });

    const strip = (s: string | undefined) => s?.replace(/<[^>]+>/g, '').trim() || null;

    return {
      $schema:   'courtflow/case/v1',
      uid,
      type,
      number,
      court:     extractCourtSubdomain(url),
      courtType: 'district',
      identifiers: {
        delo_id:   parsedUrl.searchParams.get('delo_id'),
        case_uid:  parsedUrl.searchParams.get('case_uid'),
        case_type: parsedUrl.searchParams.get('case_type'),
      },
      publishedAt: null,
      modifiedAt:  null,
      card: {
        filingDate:     parseDate(strip(rawCard['Дата поступления'])),
        category,
        judge:          strip(rawCard['Судья']),
        hearingDate:    parseDate(strip(rawCard['Дата рассмотрения'])),
        result:         strip(rawCard['Результат рассмотрения']),
        proceedingType: strip(rawCard['Признак рассмотрения дела']),
      },
      events,
      parties,
    };
  }
}
