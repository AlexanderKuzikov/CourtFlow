// packages/adapters/magistrate.ts
// Адаптер для мировых судов (*.msudrf.ru, delo_id=1540005)
// Особенности:
//   - Требует Puppeteer (капча при прямом переходе по URL карточки)
//   - Серверы нестабильны (частые 503)
//   - Капча: кириллический distorted text → rucaptcha → 2captcha fallback

import type { Case, CourtAdapter } from '../core/types.js';

export class MagistrateAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    // TODO: реализовать парсинг после анализа HTML структуры
    // Получение html — через packages/captcha/session.ts (Puppeteer)
    throw new Error('MagistrateAdapter.parse: не реализован');
  }
}
