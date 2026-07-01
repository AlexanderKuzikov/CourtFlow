// packages/adapters/magistrate.ts
// Адаптер для мировых судов (*.msudrf.ru)

import * as cheerio from 'cheerio';
import type { Case, CaseEvent, CaseParty, CourtAdapter } from '../core/types.js';
import { CaptchaRequiredError, isCaptchaPage } from '../core/errors.js';

function extractCourtSubdomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/\.msudrf\.ru$/, '');
  } catch {
    return 'unknown';
  }
}

function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function cleanText(text: string | undefined | null): string | null {
  if (!text) return null;
  const value = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return value || null;
}

export class MagistrateAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    if (isCaptchaPage(html)) throw new CaptchaRequiredError(url);

    const $ = cheerio.load(html, { decodeEntities: false });
    const parsedUrl = new URL(url);

    const caseNumber = cleanText(
      $('h2').filter((_i, el) => $(el).text().includes('ДЕЛО №')).first().text().replace(/ДЕЛО\s*№/i, '')
    ) ?? '';

    if (!caseNumber) throw new Error('MagistrateAdapter: не удалось определить номер дела');

    const tabs = $('.tab-content');
    if (tabs.length < 3) throw new Error('MagistrateAdapter: не найдены tab-content');

    const rawCard: Record<string, string> = {};
    tabs.eq(0).find('table.tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const key = cleanText(tds.eq(0).text())?.replace(/:$/, '');
      const value = cleanText(tds.eq(1).text());
      if (key) rawCard[key] = value ?? '';
    });

    const events: CaseEvent[] = [];
    tabs.eq(1).find('table.tablcont tr').each((i, el) => {
      if (i < 1) return;
      const tds = $(el).find('td');
      if (tds.length < 4) return;
      events.push({
        eventName: cleanText(tds.eq(0).text()),
        eventDate: parseDate(cleanText(tds.eq(1).text())),
        eventTime: null,
        location: null,
        result: cleanText(tds.eq(2).text()),
        reason: null,
        note: cleanText(tds.eq(3).text()),
        publishDate: null,
      });
    });

    const parties: CaseParty[] = [];
    const partyRows = tabs.eq(2).find('table.tablcont tr');
    if (partyRows.length >= 3) {
      const roles = partyRows.eq(0).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();
      const names = partyRows.eq(1).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();

      for (let i = 0; i < Math.max(roles.length, names.length); i++) {
        if (!roles[i] && !names[i]) continue;
        parties.push({
          role: roles[i] ?? null,
          name: names[i] ?? null,
          inn: null,
          kpp: null,
          ogrn: null,
          ogrnip: null,
        });
      }
    }

    const category = rawCard['Категория'] ? [rawCard['Категория']] : [];

    return {
      $schema: 'courtflow/case/v1',
      uid: parsedUrl.searchParams.get('case_id') || caseNumber,
      type: 'Гражданское дело',
      number: caseNumber,
      court: extractCourtSubdomain(url),
      courtType: 'magistrate',
      identifiers: {
        delo_id: parsedUrl.searchParams.get('delo_id'),
        case_uid: null,
        case_type: parsedUrl.searchParams.get('op'),
      },
      publishedAt: null,
      modifiedAt: null,
      card: {
        filingDate: null,
        category,
        judge: rawCard['Председательствующий судья'] ?? null,
        hearingDate: null,
        result: null,
        proceedingType: null,
      },
      events,
      parties,
    };
  }
}
