// packages/adapters/appeal.ts
// Адаптер для областных/апелляционных судов (oblsud--*.sudrf.ru, delo_id=5)
// HTML-структура может отличаться от district — требует анализа

import type { Case, CourtAdapter } from '../core/types.js';

export class AppealAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    // TODO: проанализировать HTML oblsud--perm.sudrf.ru и реализовать парсинг
    throw new Error('AppealAdapter.parse: не реализован');
  }
}
