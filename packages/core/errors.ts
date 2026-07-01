// packages/core/errors.ts

export class CaptchaRequiredError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`CaptchaRequiredError: капча на ${url}`);
    this.name = 'CaptchaRequiredError';
    this.url = url;
  }
}

/**
 * Детектор капчи sudrf.ru / msudrf.ru.
 * Признак — форма с id="kcaptchaForm" (HTTP 200 с телом капчи).
 */
export function isCaptchaPage(html: string): boolean {
  return html.includes('id="kcaptchaForm"');
}
