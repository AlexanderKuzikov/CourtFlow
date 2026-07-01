// packages/adapters/appeal.ts
// Адаптер для областных/апелляционных судов (oblsud--*.sudrf.ru, delo_id=5)
//
// Структура отличается от district — 5 вкладок вместо 3-4:
//   #cont1 — ДЕЛО
//   #cont2 — РАССМОТРЕНИЕ В НИЖЕСТОЯЩЕМ СУДЕ
//   #cont3 — ДВИЖЕНИЕ ДЕЛА  (у district это #cont2)
//   #cont4 — УЧАСТНИКИ     (у district это #cont3)
//   #cont5 — СУДЕБНЫЕ АКТЫ  (publishInfo здесь)

import * as cheerio from 'cheerio';
import type { Case, CaseEvent, CaseParty, CourtAdapter } from '../core/types.js';
import { CaptchaRequiredError, isCaptchaPage } from '../core/errors.js';

function extractCourtSubdomain(url: string): string {
  try { return new URL(url).hostname.replace(/\.sudrf\.ru$/, ''); } catch { return 'unknown'; }
}

function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parsePublishInfo(text: string): { publishedAt: string | null; modifiedAt: string | null } {
  const pubM = text.match(/опубликован\s+([\d.]+\s+[\d:]+)/);
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

export class AppealAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    if (isCaptchaPage(html)) throw new CaptchaRequiredError(url);

    const $ = cheerio.load(html, { decodeEntities: false });
    const parsedUrl = new URL(url);

    // UID
    const uidFromHtml = $('#cont1 a[href*="judicial_uid"]').text().trim()
      || $('a[href*="judicial_uid"]').first().text().trim();
    const uid = uidFromHtml
      || parsedUrl.searchParams.get('case_uid')
      || parsedUrl.searchParams.get('case_id')
      || '';
    if (!uid) throw new Error('AppealAdapter: не удалось определить UID');

    const type   = $('div.title').first().text().trim();
    const number = $('div.casenumber').first().text().replace(/ДЕЛО\s*№/i, '').trim();

    // publishedAt / modifiedAt — из #cont5 .publishInfo
    const publishInfo = parsePublishInfo($('#cont5 .publishInfo').text());

    // Карточка дела (#cont1)
    const rawCard: Record<string, string> = {};
    $('#cont1 table#tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 2) {
        const key = tds.eq(0).text().replace(':', '').trim();
        if (key) rawCard[key] = tds.eq(1).html() ?? '';
      }
    });

    // Рассмотрение в нижестоящем суде (#cont2)
    const lowerCourt: Record<string, string> = {};
    $('#cont2 table#tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 2) {
        const key = tds.eq(0).text().replace(':', '').trim();
        if (key) lowerCourt[key] = tds.eq(1).text().trim();
      }
    });

    const strip = (s: string | undefined) => s?.replace(/<[^>]+>/g, '').trim() || null;

    const category = (rawCard['Категория дела'] ?? '')
      .split(/<br\s*\/?>/i)
      .map(s => cheerio.load(s).text().replace(/&rarr;/g, '').trim())
      .filter(Boolean);

    // Движение дела (#cont3 — НЕ #cont2!)
    const events: CaseEvent[] = [];
    $('#cont3 table#tablcont tr').each((i, el) => {
      if (i < 2) return; // шапка colspan + заголовки
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

    // Участники (#cont4 — НЕ #cont3!)
    const parties: CaseParty[] = [];
    $('#cont4 table#tablcont tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const col = (j: number) => tds.eq(j)?.text().trim() || null;
      parties.push({ role: col(0), name: col(1), inn: col(2) ?? null, kpp: col(3) ?? null, ogrn: col(4) ?? null, ogrnip: col(5) ?? null });
    });

    return {
      $schema: 'courtflow/case/v1',
      uid, type, number,
      court: extractCourtSubdomain(url),
      courtType: 'appeal',
      identifiers: {
        delo_id:   parsedUrl.searchParams.get('delo_id'),
        case_uid:  parsedUrl.searchParams.get('case_uid'),
        case_type: parsedUrl.searchParams.get('case_type'),
      },
      publishedAt: publishInfo.publishedAt,
      modifiedAt:  publishInfo.modifiedAt,
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
    } as Case;
  }
}
