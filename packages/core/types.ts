// packages/core/types.ts
// Центральные типы CourtFlow. Все адаптеры и экспортёры работают через эти интерфейсы.

export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

export interface Case {
  $schema: 'courtflow/case/v1';
  uid: string;
  type: string;
  number: string;
  court: string;        // поддомен без суффикса (.sudrf.ru, .msudrf.ru)
  courtType: CourtType;
  identifiers: {
    delo_id: string | null;
    case_uid: string | null;
    case_type: string | null;
  };
  publishedAt: string | null;  // ISO 8601
  modifiedAt: string | null;
  card: {
    filingDate: string | null;  // YYYY-MM-DD
    category: string[];
    judge: string | null;
    hearingDate: string | null;
    result: string | null;
    proceedingType: string | null;
  };
  events: CaseEvent[];
  parties: CaseParty[];
}

export interface CaseEvent {
  eventName: string | null;
  eventDate: string | null;   // YYYY-MM-DD
  eventTime: string | null;
  location: string | null;
  result: string | null;
  reason: string | null;
  note: string | null;
  publishDate: string | null;
}

export interface CaseParty {
  role: string | null;
  name: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  ogrnip: string | null;
}

// Контракт адаптера — все адаптеры реализуют этот интерфейс
export interface CourtAdapter {
  parse(html: string, url: string): Promise<Case>;
}

// Результат одного запуска парсинга для run-log
export interface RunResult {
  courtId: string;
  courtType: CourtType;
  url: string;
  success: boolean;
  uid?: string;
  error?: string;
  duration: number;  // ms
  timestamp: string; // ISO 8601
}
