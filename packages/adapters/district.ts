// packages/adapters/district.ts
// Адаптер для районных судов (*.sudrf.ru, delo_id=1540005)
// HTML-структура: #cont1 (карточка), #cont2 (движение), #cont3 (стороны)

import type { Case, CourtAdapter } from '../core/types.js';

export class DistrictAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    // TODO: реализовать парсинг
    // Reference: SudRF-Parser/fetch-case.js
    throw new Error('DistrictAdapter.parse: не реализован');
  }
}
