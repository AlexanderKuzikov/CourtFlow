// packages/scheduler/smoke.ts
// Проверка по одному URL каждого типа суда
// Лог пишется в logs/smoke-last.log (UTF-8) автоматически,
// если в config.json установлен "smokeSaveLog": true

import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { loadConfig } from '../core/config.js';
import { loadUrls } from '../core/urls.js';
import { detectCharset } from '../core/courts.js';
import { ADAPTERS } from '../adapters/registry.js';
import type { CourtType } from '../core/types.js';

function makeLogger(saveLog: boolean) {
  let stream: fs.WriteStream | null = null;
  if (saveLog) {
    const logDir = path.resolve('logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'smoke-last.log');
    stream = fs.createWriteStream(logPath, { encoding: 'utf8', flags: 'w' });
  }

  const write = (line: string) => {
    process.stdout.write(line + '\n');
    stream?.write(line + '\n');
  };

  const close = () => {
    stream?.end();
  };

  return { write, close };
}

async function main() {
  const config = loadConfig();
  const allUrls = loadUrls();
  const saveLog = (config as any).smokeSaveLog === true;

  const log = makeLogger(saveLog);

  // BUG-002: предупреждение если есть magistrate без ключей
  const hasMagistrate = allUrls.some(u => u.courtType === 'magistrate');
  if (hasMagistrate && !config.captcha.primaryKeySet && !config.captcha.fallbackKeySet) {
    log.write('[config] ⚠️  Есть magistrate-дела, но RUCAPTCHA_API_KEY и TWOCAPTCHA_API_KEY не заданы. Капча не будет работать.');
  }

  log.write(`[smoke] Всего URL: ${allUrls.length}`);
  if (saveLog) log.write(`[smoke] Лог сохраняется в logs/smoke-last.log`);

  // Берём по одному URL каждого типа
  const seen = new Set<string>();
  const targets = allUrls.filter(u => {
    if (seen.has(u.courtType)) return false;
    seen.add(u.courtType);
    return true;
  });

  for (const { url, courtType, courtId } of targets) {
    const adapter = ADAPTERS[courtType];
    log.write(`\n─── [smoke] ${courtType.toUpperCase()} — ${courtId}`);
    log.write(`    URL: ${url}`);

    if (courtType === 'magistrate') {
      const cachedPath = path.resolve('logs', 'magistrate-last.html');
      if (fs.existsSync(cachedPath)) {
        log.write('    [тест на cached HTML из logs/magistrate-last.html]');
        try {
          const html = fs.readFileSync(cachedPath, 'utf-8');
          const data = await adapter.parse(html, url);
          log.write(`    [✓] UID:      ${data.uid}`);
          log.write(`         Суд:      ${data.court}`);
          log.write(`         Номер:    ${data.number}`);
          log.write(`         Судья:    ${data.card.judge ?? '—'}`);
          log.write(`         Сторон:   ${data.parties.length}`);
          log.write(`         Событий:  ${data.events.length}`);
          if (data.publishedAt) log.write(`         Опубл.:   ${data.publishedAt}`);
          if (data.modifiedAt)  log.write(`         Изменено: ${data.modifiedAt}`);
        } catch (err) {
          log.write(`    [×] ${err instanceof Error ? err.message : err}`);
        }
      } else {
        log.write('    [пропущено: нет cached HTML — выполни npm run parse]');
      }
      continue;
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(config.retry.timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const charset = detectCharset(res.headers.get('content-type'));
      const buf = await res.arrayBuffer();
      const html = iconv.decode(Buffer.from(buf), charset);
      log.write(`    charset: ${charset}, html длина: ${html.length}`);
      const data = await adapter.parse(html, url);
      log.write(`    [✓] UID:      ${data.uid}`);
      log.write(`         Суд:      ${data.court}`);
      log.write(`         Номер:    ${data.number}`);
      log.write(`         Судья:    ${data.card.judge ?? '—'}`);
      log.write(`         Сторон:   ${data.parties.length}`);
      log.write(`         Событий:  ${data.events.length}`);
      if (data.publishedAt) log.write(`         Опубл.:   ${data.publishedAt}`);
      if (data.modifiedAt)  log.write(`         Изменено: ${data.modifiedAt}`);
    } catch (err) {
      log.write(`    [×] ${err instanceof Error ? err.message : err}`);
    }
  }

  log.write(`\n[smoke] Готово.`);
  log.close();
}

main();
