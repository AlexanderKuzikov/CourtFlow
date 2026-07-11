import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('blessed', () => ({
  default: {
    screen: () => ({
      key: vi.fn(),
      on: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      fullUnicode: true,
    }),
    box: () => ({
      hide: vi.fn(),
      show: vi.fn(),
      setContent: vi.fn(),
      focus: vi.fn(),
      key: vi.fn(),
      on: vi.fn(),
      setScroll: vi.fn(),
      destroy: vi.fn(),
      setValue: vi.fn(),
      readInput: vi.fn(),
    }),
    list: () => ({
      hide: vi.fn(),
      show: vi.fn(),
      setItems: vi.fn(),
      select: vi.fn(),
      focus: vi.fn(),
      on: vi.fn(),
      selected: 0,
    }),
    textbox: () => ({
      focus: vi.fn(),
      setValue: vi.fn(),
      readInput: vi.fn(),
      destroy: vi.fn(),
    }),
  },
}));

// Утилиты вынесены в начало файла — они не зависят от blessed
import { typeLabel, esc, pad, clip, isoDate, getSep, formatCaseItem, buildHeaderLine, COL } from './tui.js';
import type { Case } from '../core/types.js';

describe('typeLabel', () => {
  it('возвращает русские метки для известных типов', () => {
    expect(typeLabel('district')).toBe('Район');
    expect(typeLabel('appeal')).toBe('Апелл.');
    expect(typeLabel('cassation')).toBe('Касс.');
    expect(typeLabel('magistrate')).toBe('Мир.');
  });

  it('возвращает оригинал для неизвестного типа', () => {
    expect(typeLabel('unknown')).toBe('unknown');
  });
});

describe('esc', () => {
  it('экранирует фигурные скобки', () => {
    expect(esc('{bold}text{/bold}')).toBe('\\{bold\\}text\\{/bold\\}');
  });

  it('заменяет переводы строк на пробелы', () => {
    expect(esc('line1\nline2')).toBe('line1 line2');
  });

  it('возвращает пустую строку для null/undefined', () => {
    expect(esc(null as any)).toBe('');
    expect(esc(undefined as any)).toBe('');
  });
});

describe('pad', () => {
  it('дополняет строку пробелами до нужной ширины', () => {
    expect(pad('abc', 5)).toBe('abc  ');
  });

  it('не обрезает если строка длиннее', () => {
    expect(pad('abcdef', 3)).toBe('abcdef');
  });
});

describe('clip', () => {
  it('обрезает и добавляет ›', () => {
    expect(clip('abcdef', 4)).toBe('abc›');
  });

  it('не обрезает если строка короче', () => {
    expect(clip('abc', 5)).toBe('abc');
  });
});

describe('isoDate', () => {
  it('обрезает ISO до YYYY-MM-DD', () => {
    expect(isoDate('2025-06-15T10:30:00')).toBe('2025-06-15');
  });

  it('возвращает — для null', () => {
    expect(isoDate(null)).toBe('—');
  });
});

describe('getSep', () => {
  it('возвращает │ когда fullUnicode true', () => {
    // Мок установил fullUnicode: true
    expect(getSep()).toBe('│');
  });
});

describe('buildHeaderLine', () => {
  it('формирует строку заголовка с разделителями', () => {
    const line = buildHeaderLine();
    expect(line).toContain('№ дела');
    expect(line).toContain('Тип');
    expect(line).toContain('Суд');
    expect(line).toContain('Судья');
    expect(line).toContain('Соб.');
    expect(line).toContain('Посл.');
    expect(line).toContain('│');
  });
});

describe('formatCaseItem', () => {
  const mockCase: Case = {
    $schema: 'courtflow/case/v1',
    number: '12-345/2025',
    courtType: 'district',
    court: 'perm',
    uid: 'test-uid',
    type: 'cases',
    identifiers: { delo_id: null, case_uid: null, case_type: null },
    publishedAt: null,
    modifiedAt: null,
    card: {
      judge: 'Иванов И.И.',
      result: 'Удовлетворено',
      filingDate: '2025-01-15T00:00:00',
      hearingDate: '2025-06-10T00:00:00',
      category: [],
      proceedingType: null,
    },
    events: [
      { eventDate: '2025-06-10T00:00:00', eventName: 'Заседание', result: 'Отложено', eventTime: null, location: null, reason: null, note: null, publishDate: null },
    ],
    parties: [
      { role: 'Истец', name: 'Петров П.П.', inn: null, kpp: null, ogrn: null, ogrnip: null },
    ],
  };

  it('форматирует дело с разделителями', () => {
    const line = formatCaseItem(mockCase);
    expect(line).toContain('12-345/2025');
    expect(line).toContain('Район');
    expect(line).toContain('│');
  });

  it('не падает с пустыми полями', () => {
    const empty: any = { number: null, courtType: '', court: '', uid: '' };
    expect(() => formatCaseItem(empty)).not.toThrow();
  });
});

describe('COL', () => {
  it('сумма ширин колонок разумна', () => {
    const total = COL.num + COL.type + COL.court + COL.judge + COL.evt + COL.date;
    expect(total).toBeGreaterThan(60);
    expect(total).toBeLessThan(120);
  });
});
