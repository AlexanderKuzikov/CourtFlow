// packages/adapters/cassation.ts
// Адаптер для кассационных судов (7kas.sudrf.ru, delo_id=2800001)
// HTML-структура может отличаться от district — требует анализа

import type { Case, CourtAdapter } from '../core/types.js';

export class CassationAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    // TODO: проанализировать HTML 7kas.sudrf.ru и реализовать парсинг
    throw new Error('CassationAdapter.parse: не реализован');
  }
}
