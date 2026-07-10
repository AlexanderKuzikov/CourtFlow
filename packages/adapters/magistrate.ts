// packages/adapters/magistrate.ts
// Адаптер для мировых судов (*.msudrf.ru)
// BUG-017: uid = судебный номер дела (не case_id), events — 5 колонок, filingDate/hearingDate/result

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

    // FIX (CODE_REVIEW #1): decodeEntities удалён — в cheerio 1.x эта опция убрана из CheerioOptions, false является дефолтом.
    const $ = cheerio.load(html);
    const parsedUrl = new URL(url);

    // BUG-017: uid — судебный номер из заголовка h2, fallback — case_id из URL
    const caseNumber = cleanText(
      $('h2').filter((_i, el) => $(el).text().includes('ДЕЛО №')).first().text().replace(/ДЕЛО\s*№/i, '')
    ) ?? parsedUrl.searchParams.get('case_id') ?? '';

    if (!caseNumber) throw new Error('MagistrateAdapter: не удалось определить номер дела');

    const tabs = $('.tab-content');
    if (tabs.length < 3) throw new Error('MagistrateAdapter: не найдены tab-content');

    // Таб 0 — основные сведения
    const rawCard: Record<string, string> = {};
    tabs.eq(0).find('table.tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const key = cleanText(tds.eq(0).text())?.replace(/:$/, '');
      const value = cleanText(tds.eq(1).text());
      if (key) rawCard[key] = value ?? '';
    });

    // Таб 1 — движение дела: 5 колонок (событие, дата, время, результат, судья)
    const events: CaseEvent[] = [];
    tabs.eq(1).find('table.tablcont tr').each((i, el) => {
      if (i < 2) return; // пропускаем заголовок h2-строку и строку с названиями колонок
      const tds = $(el).find('td');
      if (tds.length < 4) return;
      const rawResult = cleanText(tds.eq(3).text());
      // Из результата извлекаем дату публикации решения вида "(DD.MM.YYYY)"
      const publishMatch = rawResult?.match(/\((\d{2}\.\d{2}\.\d{4})\)/);
      events.push({
        eventName: cleanText(tds.eq(0).text()),
        eventDate: parseDate(cleanText(tds.eq(1).text())),
        eventTime: cleanText(tds.eq(2).text()),
        location: null,
        result: rawResult,
        reason: null,
        note: tds.length >= 5 ? cleanText(tds.eq(4).text()) : null, // судья (5-я колонка)
        publishDate: publishMatch ? parseDate(publishMatch[1]) : null,
      });
    });

    // Из событий извлекаем дату первого события (подача) и ближайшее слушание
    const filingDate = events.length > 0 ? events[0].eventDate : null;
    const hearingDate = events
      .map(e => e.eventDate)
      .filter((d): d is string => !!d)
      .sort()
      .find(d => d >= new Date().toISOString().slice(0, 10)) ?? null;

    // Последний результат из событий
    const lastResult = [...events].reverse().find(e => e.result)?.result ?? null;

    // Таб 2 — стороны
    const parties: CaseParty[] = [];
    const partyRows = tabs.eq(2).find('table.tablcont tr');
    if (partyRows.length >= 3) {
      const roles = partyRows.eq(1).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();
      const names = partyRows.eq(2).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();

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
      uid: caseNumber, // судебный номер дела, напр. "2-2808/2026"
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
        filingDate,
        category,
        judge: rawCard['Председательствующий судья'] ?? null,
        hearingDate,
        result: lastResult,
        proceedingType: null,
      },
      events,
      parties,
    };
  }
}
