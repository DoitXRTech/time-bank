import { parseCsv } from '@/domain/import/csv';
import { parseSheetDate, parseSpanishNumber } from '@/domain/import/sheetValues';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes and line breaks inside quotes', () => {
    const rows = parseCsv('a,"b, c","say ""hi""","line1\nline2"\nx,y,z,w\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'line1\nline2'],
      ['x', 'y', 'z', 'w'],
    ]);
  });

  it('keeps empty cells and accepts CRLF and a BOM', () => {
    expect(parseCsv('﻿a,,c\r\n,,\r\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('keeps the last row when the file has no trailing newline', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseSpanishNumber', () => {
  it.each([
    ['7,00', 7],
    ['-2,50', -2.5],
    ['40', 40],
    [' 1,25 ', 1.25],
    ['0,00', 0],
  ])('reads %j as %d', (raw, expected) => {
    expect(parseSpanishNumber(raw)).toBe(expected);
  });

  it.each([['N/A'], ['-'], [''], ['PAGO'], [undefined], ['1,2,3']])('reads %j as null', (raw) => {
    expect(parseSpanishNumber(raw)).toBeNull();
  });
});

describe('parseSheetDate', () => {
  it('reads day-first dates with 2 or 4 digit years', () => {
    expect(parseSheetDate('19/02/26')).toEqual({ iso: '2026-02-19', kind: 'exact' });
    expect(parseSheetDate('2/03/2026')).toEqual({ iso: '2026-03-02', kind: 'exact' });
  });

  it('rejects impossible dates', () => {
    expect(parseSheetDate('31/02/2026')).toBeNull();
  });

  it('assumes the reference year for a day/month without year, and only then', () => {
    expect(parseSheetDate('10/07', { referenceYear: 2026 })).toEqual({ iso: '2026-07-10', kind: 'year-assumed' });
    expect(parseSheetDate('10/07')).toBeNull();
  });

  it('uses the last day of the month for a bare month name (setiembre and septiembre)', () => {
    expect(parseSheetDate('setiembre', { referenceYear: 2026 })).toEqual({ iso: '2026-09-30', kind: 'month-name' });
    expect(parseSheetDate('Febrero 2028')).toEqual({ iso: '2028-02-29', kind: 'month-name' });
  });

  it('reads month abbreviations', () => {
    expect(parseSheetDate('Sept', { referenceYear: 2026 })).toEqual({ iso: '2026-09-30', kind: 'month-name' });
    expect(parseSheetDate('oct', { referenceYear: 2026 })).toEqual({ iso: '2026-10-31', kind: 'month-name' });
  });

  it('uses the first day of a list of days, with the month as a name or a number', () => {
    const options = { referenceYear: 2026 };
    expect(parseSheetDate('19 y 20 de Marzo', options)).toEqual({ iso: '2026-03-19', kind: 'range-first-day' });
    expect(parseSheetDate('Del 11 al 16/06', options)).toEqual({ iso: '2026-06-11', kind: 'range-first-day' });
    expect(parseSheetDate('5-6-9/03', options)).toEqual({ iso: '2026-03-05', kind: 'range-first-day' });
    expect(parseSheetDate('28, 29 y 30/01', options)).toEqual({ iso: '2026-01-28', kind: 'range-first-day' });
    expect(parseSheetDate('18 de junio', options)).toEqual({ iso: '2026-06-18', kind: 'year-assumed' });
    expect(parseSheetDate('Del 16 al 23 de Feb', options)).toEqual({ iso: '2026-02-16', kind: 'range-first-day' });
  });

  it.each([['PAGO'], ['30, 31 y 01'], ['Días Brasil'], ['1403/2026'], ['']])('does not read %j as a date', (raw) => {
    expect(parseSheetDate(raw, { referenceYear: 2026 })).toBeNull();
  });
});
