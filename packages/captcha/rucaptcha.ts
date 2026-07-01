// packages/captcha/rucaptcha.ts

const RUCAPTCHA_IN_URL = 'https://rucaptcha.com/in.php';
const RUCAPTCHA_RES_URL = 'https://rucaptcha.com/res.php';

export interface RuCaptchaClientOptions {
  apiKey: string;
  pollingIntervalMs?: number;
  timeoutMs?: number;
}

export class RuCaptchaClient {
  private readonly apiKey: string;
  private readonly pollingIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: RuCaptchaClientOptions) {
    this.apiKey = options.apiKey;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  async solveImage(imageBase64: string): Promise<string> {
    const captchaId = await this.submit(imageBase64);
    return this.pollResult(captchaId);
  }

  private async submit(imageBase64: string): Promise<string> {
    const body = new URLSearchParams({
      key: this.apiKey,
      method: 'base64',
      body: imageBase64,
      json: '0',
      language: '2',
      regsense: '0',
    });

    const res = await fetch(RUCAPTCHA_IN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = (await res.text()).trim();
    if (!text.startsWith('OK|')) {
      throw new Error(`RuCaptcha submit failed: ${text}`);
    }

    return text.slice(3);
  }

  private async pollResult(captchaId: string): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, this.pollingIntervalMs));

      const url = new URL(RUCAPTCHA_RES_URL);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('action', 'get');
      url.searchParams.set('id', captchaId);
      url.searchParams.set('json', '0');

      const res = await fetch(url);
      const text = (await res.text()).trim();

      if (text === 'CAPCHA_NOT_READY') continue;
      if (!text.startsWith('OK|')) {
        throw new Error(`RuCaptcha poll failed: ${text}`);
      }

      return text.slice(3);
    }

    throw new Error('RuCaptcha timeout');
  }
}
