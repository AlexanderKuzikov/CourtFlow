// packages/scheduler/smoke.ts
// Берёт 1 URL каждого enabled типа суда, парсит, выводит в консоль без записи файлов.
// Запуск: npm run test:smoke

import fetch from 'node-fetch';
import iconv from 'iconv-lite';
import { loadConfig, getEnabledCourts } from '../core/config.js';
import { withRetry } from '../core/retry.js';
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

async function main() {
  const config = loadConfig();
  const courts = getEnabledCourts(config);

  // Берём по 1 URL от каждого типа
  const seen = new Set<string>();
  const targets = courts.filter(c => {
    if (seen.has(c.type)) return false;
    seen.add(c.type);
    return true;
  });

  for (const court of targets) {
    const url = court.urls[0];
    const adapter = ADAPTERS[court.type];
    console.log(`\n─── [smoke] ${court.type.toUpperCase()} — ${court.id}`);
    console.log(`    URL: ${url}`);

    if (court.type === 'magistrate') {
      console.log('    [пропущено: magistrate требует Puppeteer-сессию]');
      continue;
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(config.retry.timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const html = iconv.decode(Buffer.from(buf), 'win1251');
      const data = await adapter.parse(html, url);
      console.log('    [✓] UID:', data.uid);
      console.log('    Суд:', data.court);
      console.log('    Номер:', data.number);
      console.log('    Судья:', data.card.judge);
      console.log('    Сторон:', data.parties.length);
      console.log('    Событий:', data.events.length);
    } catch (err) {
      console.error('    [×]', err instanceof Error ? err.message : err);
    }
  }
}

main();
