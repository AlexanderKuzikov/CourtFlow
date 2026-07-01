// packages/captcha/session.ts

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import puppeteer from 'puppeteer';
import { isCaptchaPage } from '../core/errors.js';
import { RuCaptchaClient } from './rucaptcha.js';

export interface MagistrateSessionOptions {
  url: string;
  apiKey: string;
  debugDir?: string;
}

export async function fetchMagistrateHtml(options: MagistrateSessionOptions): Promise<string> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let html = await page.content();
    if (!isCaptchaPage(html)) return html;

    if (options.debugDir) ensureDir(options.debugDir);

    const client = new RuCaptchaClient({ apiKey: options.apiKey });
    const imageBase64 = await readCaptchaImageAsBase64(page, options.url);
    const captchaText = await client.solveImage(imageBase64);

    await page.locator('input[name="captcha-response"]').fill(captchaText);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.locator('form#kcaptchaForm button[type="submit"]').click(),
    ]);

    html = await page.content();

    if (options.debugDir) {
      writeFileSync(resolve(options.debugDir, 'magistrate-last.html'), html, 'utf-8');
    }

    if (isCaptchaPage(html)) {
      throw new Error('Captcha loop: после отправки капча показана повторно');
    }

    return html;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function readCaptchaImageAsBase64(page: puppeteer.Page, pageUrl: string): Promise<string> {
  const src = await page.locator('form#kcaptchaForm img').getAttribute('src');
  if (!src) throw new Error('Captcha image src not found');

  const imageUrl = new URL(src, pageUrl).toString();
  const response = await page.goto(imageUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  if (!response?.ok()) throw new Error(`Captcha image fetch failed: HTTP ${response?.status()}`);

  const buffer = Buffer.from(await response.buffer());
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 });
  return buffer.toString('base64');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
