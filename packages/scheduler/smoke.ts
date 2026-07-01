// packages/scheduler/smoke.ts
// Проверка по одному URL каждого типа суда из urls.txt

import iconv from 'iconv-lite';
import { loadConfig } from '../core/config.js';
import { loadUrls } from '../core/urls.js';
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
  const allUrls = loadUrls();

  // BUG-002: предупреждение если есть magistrate без ключей
  const hasMagistrate = allUrls.some(u => u.courtType === 'magistrate');
  if (hasMagistrate && !config.captcha.primaryKeySet && !config.captcha.fallbackKeySet) {
    console.warn('[config] ⚠️  Есть magistrate-дела, но RUCAPTCHA_API_KEY и TWOCAPTCHA_API_KEY не заданы. Капча не будет работать.');
  }

  console.log(`[smoke] Всего URL в urls.txt: ${allUrls.length}`);

  // Берём по одному URL каждого типа
  const seen = new Set<string>();
  const targets = allUrls.filter(u => {
    if (seen.has(u.courtType)) return false;
    seen.add(u.courtType);
    return true;
  });

  for (const { url, courtType, courtId } of targets) {
    const adapter = ADAPTERS[courtType];
    console.log(`\n─── [smoke] ${courtType.toUpperCase()} — ${courtId}`);
    console.log(`    URL: ${url}`);

    if (courtType === 'magistrate') {
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
      console.log(`    [✓] UID:     ${data.uid}`);
      console.log(`         Суд:     ${data.court}`);
      console.log(`         Номер:  ${data.number}`);
      console.log(`         Судья:  ${data.card.judge ?? '—'}`);
      console.log(`         Сторон: ${data.parties.length}`);
      console.log(`         Событий: ${data.events.length}`);
      if (data.publishedAt) console.log(`         Опубл.: ${data.publishedAt}`);
    } catch (err) {
      console.error(`    [×] ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n[smoke] Готово.`);
}

main();
