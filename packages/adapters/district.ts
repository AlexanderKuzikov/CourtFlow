// packages/adapters/district.ts
// Адаптер для районных судов (*.sudrf.ru, delo_id=1540005)
// HTML-структура: #cont1 (карточка), #cont2 (движение дела), #cont3 (стороны)

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

function parseDateTime(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/);
  const date = parseDate(parts[0]);
  if (!date) return null;
  const time = parts[1] ?? '00:00';
  return `${date}T${time}:00`;
}

export class DistrictAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    const $ = cheerio.load(html, { decodeEntities: false });

    // UID
    const uid = $('#cont1 a[href*="judicial_uid"]').text().trim();
    if (!uid) throw new Error(`DistrictAdapter: UID не найден (возможно капча или пустая страница)`);

    const type = $('div.title').text().trim();
    const number = $('div.casenumber').text().replace('ДЕЛО №', '').trim();
    const publishInfo = $('div.publishInfo').text().trim();
    const publishedAt = parseDateTime(publishInfo, /опубликовано\s+([\d.]+\s*[\d:]*)/);
    const modifiedAt = parseDateTime(publishInfo, /изменено\s+([\d.]+\s*[\d:]*)/);

    // Карточка
    const rawCard: Record<string, string> = {};
    $('#cont1 table#tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length === 2) {
        const key = tds.eq(0).find('b').text().replace(':', '').trim();
        rawCard[key] = tds.eq(1).html() ?? '';
      }
    });

    const category = rawCard['Категория дела']
      ? rawCard['Категория дела']
          .replace(/&rarr;/g, '')
          .split(/<br\s*\/?>/i)
          .map(s => cheerio.load(s).text().trim())
          .filter(Boolean)
      : [];

    // Движение дела
    const events: CaseEvent[] = [];
    $('#cont2 table#tablcont tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 8) return;
      const col = (j: number) => tds.eq(j).text().trim() || null;
      events.push({
        eventName:   col(0),
        eventDate:   parseDate(col(1) ?? ''),
        eventTime:   col(2),
        location:    col(3),
        result:      col(4),
        reason:      col(5),
        note:        col(6),
        publishDate: parseDate(col(7) ?? ''),
      });
    });

    // Стороны
    const parties: CaseParty[] = [];
    $('#cont3 table#tablcont tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 6) return;
      const col = (j: number) => tds.eq(j).text().trim() || null;
      parties.push({
        role:    col(0),
        name:    col(1),
        inn:     col(2),
        kpp:     col(3),
        ogrn:    col(4),
        ogrnip:  col(5),
      });
    });

    const parsedUrl = new URL(url);

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
      publishedAt,
      modifiedAt,
      card: {
        filingDate:      parseDate(rawCard['Дата поступления']),
        category,
        judge:           rawCard['Судья']?.replace(/<[^>]+>/g, '').trim() || null,
        hearingDate:     parseDate(rawCard['Дата рассмотрения']),
        result:          rawCard['Результат рассмотрения']?.replace(/<[^>]+>/g, '').trim() || null,
        proceedingType:  rawCard['Признак рассмотрения дела']?.replace(/<[^>]+>/g, '').trim() || null,
      },
      events,
      parties,
    };
  }
}
