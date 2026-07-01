// packages/scheduler/smoke.ts
// BUG-011: node-fetch удалён, используем встроенный fetch (Node 22)

import iconv from 'iconv-lite';
import { loadConfig, getEnabledCourts } from '../core/config.js';
import { DistrictAdapter } from '../adapters/district.js';
import { AppealAdapter } from '../adapters/appeal.js';
import { CassationAdapter } from '../adapters/cassation.js';
import { MagistrateAdapter } from '../adapters/magistrate.js';
import type { CourtAdapter } from '../core/types.js';

const ADAPTERS: Record<string, CourtAdapter> = {
  district:   new DistrictAdapter(),
  appeal:     new AppealAdapter(),
  cassation:  new CassationAdapter(),
  magistrate: new MagistrateAdapter(),
};

function detectCharset(contentType: string | null): string {
  const m = contentType?.match(/charset=([\w-]+)/i);
  const cs = m?.[1]?.toLowerCase();
  return (cs === 'utf-8' || cs === 'utf8') ? 'utf8' : 'win1251';
}

async function main() {
  const config = loadConfig();
  const courts = getEnabledCourts(config);

  const seen = new Set<string>();
  const targets = courts.filter(c => { if (seen.has(c.type)) return false; seen.add(c.type); return true; });

  for (const court of targets) {
    const url = court.urls[0];
    const adapter = ADAPTERS[court.type];
    console.log(`\n─── [smoke] ${court.type.toUpperCase()} — ${court.id}`);
    console.log(`    URL: ${url}`);

    if (court.type === 'magistrate') {
      console.log('    [пропущено: magistrate требует Puppeteer]');
      continue;
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(config.retry.timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const charset = detectCharset(res.headers.get('content-type'));
      const buf = await res.arrayBuffer();
      const html = iconv.decode(Buffer.from(buf), charset);
      console.log(`    charset: ${charset}, html длина: ${html.length}`);
      const data = await adapter.parse(html, url);
      console.log('    [✓] UID:    ', data.uid);
      console.log('         Суд:    ', data.court);
      console.log('         Номер: ', data.number);
      console.log('         Судья:', data.card.judge);
      console.log('         Сторон:', data.parties.length);
      console.log('         Событий:', data.events.length);
    } catch (err) {
      console.error('    [×]', err instanceof Error ? err.message : err);
    }
  }
}

main();
