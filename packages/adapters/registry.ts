// packages/adapters/registry.ts
// Центральный реестр адаптеров — единый источник для orchestrator, smoke и др.

import type { CourtAdapter, CourtType } from '../core/types.js';
import { DistrictAdapter } from './district.js';
import { AppealAdapter } from './appeal.js';
import { CassationAdapter } from './cassation.js';
import { MagistrateAdapter } from './magistrate.js';

export const ADAPTERS: Record<CourtType, CourtAdapter> = {
  district:   new DistrictAdapter(),
  appeal:     new AppealAdapter(),
  cassation:  new CassationAdapter(),
  magistrate: new MagistrateAdapter(),
};
