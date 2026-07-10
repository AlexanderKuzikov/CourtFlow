import { describe, it, expect } from 'vitest';
import { extractUrls, detectCourtType, extractCourtId } from './urls.js';

describe('extractUrls', () => {
  it('извлекает URL из простого текста', () => {
    const raw = 'https://sverdlov--perm.sudrf.ru/modules.php?name=sud_delo&case_id=123';
    expect(extractUrls(raw)).toEqual([raw]);
  });

  it('извлекает URL без схемы', () => {
    const result = extractUrls('sverdlov--perm.sudrf.ru/modules.php?name=sud_delo&case_id=123');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^https:\/\//);
  });

  it('извлекает URL с // префиксом', () => {
    const result = extractUrls('//sverdlov--perm.sudrf.ru/modules.php?name=sud_delo');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^https:\/\//);
  });

  it('извлекает несколько URL разделённых пробелами и переносами', () => {
    const raw =
      'https://sverdlov--perm.sudrf.ru/a\n' +
      'https://industry--perm.sudrf.ru/b\n' +
      'https://35.perm.msudrf.ru/c';
    const result = extractUrls(raw);
    expect(result).toHaveLength(3);
  });

  it('извлекает URL из JSON-подобного текста', () => {
    const raw = '{"url": "https://sverdlov--perm.sudrf.ru/a"}';
    const result = extractUrls(raw);
    expect(result).toContain('https://sverdlov--perm.sudrf.ru/a');
  });

  it('извлекает URL из CSV', () => {
    const raw = 'name,url\nДело 1,https://sverdlov--perm.sudrf.ru/a';
    const result = extractUrls(raw);
    expect(result).toContain('https://sverdlov--perm.sudrf.ru/a');
  });

  it('возвращает оба URL без дедупликации (дедупликация — в loadUrls)', () => {
    const raw = 'https://sverdlov--perm.sudrf.ru/a\nhttps://sverdlov--perm.sudrf.ru/a';
    const result = extractUrls(raw);
    expect(result).toHaveLength(2);
  });

  it('отфильтровывает не-sudrf домены', () => {
    const result = extractUrls('https://example.com/page https://sverdlov--perm.sudrf.ru/a');
    expect(result).toEqual(['https://sverdlov--perm.sudrf.ru/a']);
  });

  it('отфильтровывает короткие строки (< 10 символов)', () => {
    const result = extractUrls('abc');
    expect(result).toHaveLength(0);
  });

  it('убирает trailing slashes', () => {
    const result = extractUrls('https://sverdlov--perm.sudrf.ru/page/');
    expect(result).toContain('https://sverdlov--perm.sudrf.ru/page');
  });

  it('возвращает пустой массив для пустой строки', () => {
    expect(extractUrls('')).toEqual([]);
  });
});

describe('detectCourtType', () => {
  it('district по дефолту', () => {
    expect(detectCourtType('https://sverdlov--perm.sudrf.ru/modules.php?delo_id=1540005&case_id=1'))
      .toBe('district');
  });

  it('appeal по delo_id=5', () => {
    expect(detectCourtType('https://oblsud--perm.sudrf.ru/modules.php?delo_id=5'))
      .toBe('appeal');
  });

  it('cassation по delo_id=2800001', () => {
    expect(detectCourtType('https://7kas.sudrf.ru/modules.php?delo_id=2800001'))
      .toBe('cassation');
  });

  it('magistrate по домену .msudrf.ru', () => {
    expect(detectCourtType('https://35.perm.msudrf.ru/modules.php?delo_id=1540005'))
      .toBe('magistrate');
  });
});

describe('extractCourtId', () => {
  it('district — поддомен без .sudrf.ru', () => {
    expect(extractCourtId('https://sverdlov--perm.sudrf.ru/page'))
      .toBe('sverdlov--perm');
  });

  it('magistrate — поддомен без .msudrf.ru', () => {
    expect(extractCourtId('https://35.perm.msudrf.ru/page'))
      .toBe('35.perm');
  });

  it('cassation — хост без .sudrf.ru', () => {
    expect(extractCourtId('https://7kas.sudrf.ru/page'))
      .toBe('7kas');
  });

  it('возвращает unknown при ошибке парсинга', () => {
    expect(extractCourtId('not-a-url')).toBe('unknown');
  });
});
