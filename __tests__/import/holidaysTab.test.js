import { excelSerial, holidaySheet, numberCell, textCell } from '../helpers/sheetFixtures';
import { classifyHolidayCell, excelSerialToIso, HOLIDAY_CELL, parseHolidaysTab } from '@/domain/import/holidaysTab';

const DATES = ['2026-08-31', '2026-09-15'];
const parse = (people, options) => parseHolidaysTab(holidaySheet('Feriados CR 26', DATES, people, options), { country: 'CR', defaultYear: 2026 });
const byName = (result, name) => result.people.find((person) => person.name === name);

describe('excelSerialToIso', () => {
  it('converts Excel day numbers to dates', () => {
    expect(excelSerialToIso(45658)).toBe('2025-01-01');
    expect(excelSerialToIso(46265)).toBe('2026-08-31');
    expect(excelSerialToIso(excelSerial('2026-02-28'))).toBe('2026-02-28');
  });
});

describe('classifyHolidayCell', () => {
  it.each([
    [textCell('Lo toma'), HOLIDAY_CELL.TAKEN],
    [textCell('Lo tomo adelantado'), HOLIDAY_CELL.TAKEN],
    [textCell('Toma el 08 de enero'), HOLIDAY_CELL.TAKEN],
    [textCell('Reponer'), HOLIDAY_CELL.PENDING],
    [textCell('Reponer '), HOLIDAY_CELL.PENDING],
    [textCell('reponer'), HOLIDAY_CELL.PENDING],
    [textCell('Reponer~'), HOLIDAY_CELL.SETTLED],
    [textCell('Sábado'), HOLIDAY_CELL.WEEKEND],
    [textCell('domingo'), HOLIDAY_CELL.WEEKEND],
    [textCell('N/A'), HOLIDAY_CELL.NOT_APPLICABLE],
    [textCell('NA'), HOLIDAY_CELL.NOT_APPLICABLE],
    [textCell('-'), HOLIDAY_CELL.NOT_APPLICABLE],
    [numberCell(46100), HOLIDAY_CELL.REPLACED_ON_DATE],
    [textCell('19/03'), HOLIDAY_CELL.REPLACED_ON_DATE],
    [textCell('27/3'), HOLIDAY_CELL.REPLACED_ON_DATE],
    [textCell(''), HOLIDAY_CELL.EMPTY],
    [undefined, HOLIDAY_CELL.EMPTY],
    [textCell('Quién sabe'), HOLIDAY_CELL.UNKNOWN],
  ])('classifies %j as %s', (cell, expected) => {
    expect(classifyHolidayCell(cell)).toBe(expected);
  });
});

describe('parseHolidaysTab: "Reponer" means the company owes the person a day', () => {
  const result = parse([
    ['Pendiente Uno', 'Reponer', 'Lo toma'],
    ['Repuesto', 'Reponer~', 'Reponer~'],
    ['Dos Pendientes', 'Reponer', 'Reponer '],
    ['Mixto', 'Reponer~', 'Reponer'],
    ['Fin de Semana', 'Sábado', 'N/A'],
    ['Otro Dia', numberCell(excelSerial('2026-09-03')), 'Lo toma'],
  ]);

  it('lists the holidays with their date and the tab country', () => {
    expect(result.country).toBe('CR');
    expect(result.holidays.map(({ label, iso }) => [label, iso])).toEqual([
      ['31/08', '2026-08-31'],
      ['15/09', '2026-09-15'],
    ]);
  });

  it('counts a plain "Reponer" as owed, on the date of its holiday', () => {
    expect(byName(result, 'Pendiente Uno').pending).toEqual([{ label: '31/08', iso: '2026-08-31' }]);
    expect(byName(result, 'Dos Pendientes').pending.map(({ iso }) => iso)).toEqual(['2026-08-31', '2026-09-15']);
  });

  it('does not count a struck-through "Reponer": it was already repaid', () => {
    expect(byName(result, 'Repuesto')).toMatchObject({ pending: [], settledCount: 2 });
    expect(byName(result, 'Mixto')).toMatchObject({ pending: [{ label: '15/09', iso: '2026-09-15' }], settledCount: 1 });
  });

  it('does not count weekends, "N/A", the days taken, nor a day taken instead on another date', () => {
    expect(byName(result, 'Fin de Semana').pending).toEqual([]);
    expect(byName(result, 'Otro Dia')).toMatchObject({ pending: [], repaidOnDate: 1 });
  });

  it('has no issues for a clean tab', () => {
    expect(result.issues).toEqual([]);
  });
});

describe('parseHolidaysTab: the birthday benefit', () => {
  it('reads the birthday column the same way: plain "Reponer" is owed, "Toma el ..." is done', () => {
    const result = parse([
      ['Debe', 'Lo toma', 'Lo toma', 'Reponer'],
      ['Ya Lo Tomo', 'Lo toma', 'Lo toma', 'Toma el 08 de enero'],
      ['Repuesto', 'Lo toma', 'Lo toma', 'Reponer~'],
      ['Nada', 'Lo toma', 'Lo toma'],
    ]);

    expect(byName(result, 'Debe').birthday).toBe('pending');
    expect(byName(result, 'Ya Lo Tomo').birthday).toBe('done');
    expect(byName(result, 'Repuesto').birthday).toBe('done');
    expect(byName(result, 'Nada').birthday).toBeNull();
  });
});

describe('parseHolidaysTab: data problems', () => {
  it('uses the year most holidays are dated in when one header has the wrong year, and says so', () => {
    const sheet = holidaySheet('Feriados CR 26', ['2025-01-01', '2026-08-31', '2026-09-15'], [['Ana', 'Reponer', 'Lo toma', 'Lo toma']]);
    const result = parseHolidaysTab(sheet, { country: 'CR', defaultYear: 2026 });

    expect(result.holidays.map(({ iso }) => iso)).toEqual(['2026-01-01', '2026-08-31', '2026-09-15']);
    expect(result.people[0].pending).toEqual([{ label: '01/01', iso: '2026-01-01' }]);
    expect(result.issues).toEqual([{ code: 'HOLIDAY_YEAR_ADJUSTED', detail: '01/01 is dated 2025 in the header; 2026 was used' }]);
  });

  it('reports a status it does not understand instead of guessing, with the person and the holiday', () => {
    const result = parse([['Ana', 'Quién sabe', 'Lo toma']]);

    expect(result.issues).toEqual([{ code: 'HOLIDAY_STATUS_UNKNOWN', row: 2, name: 'Ana', detail: '"Quién sabe" under 31/08' }]);
    expect(result.people[0].pending).toEqual([]);
  });

  it('flags people whose row is hidden in the sheet', () => {
    const result = parse([['Visible', 'Lo toma', 'Lo toma'], ['Oculta', 'Lo toma', 'Lo toma']], { hiddenRows: [3] });
    expect(byName(result, 'Visible').hidden).toBe(false);
    expect(byName(result, 'Oculta').hidden).toBe(true);
  });

  it('reports a tab without a row of holiday dates instead of failing', () => {
    const result = parseHolidaysTab({ name: 'Feriados XX 26', rows: [[textCell('nada')]] }, { country: 'XX', defaultYear: 2026 });
    expect(result.people).toEqual([]);
    expect(result.issues[0].code).toBe('HOLIDAY_HEADER_NOT_FOUND');
  });
});

describe('parseHolidaysTab: "Feriados adeudados" (days still owed from last year)', () => {
  it('takes the last figure of a running count and ignores the dates listed', () => {
    const sheet = holidaySheet('Feriados AR 26', DATES, [['Ana', 'Lo toma', 'Lo toma']]);
    sheet.rows.push(
      [],
      [textCell('Feriados adeudados 2025')],
      [textCell('Eli'), textCell('9 de julio'), textCell('10 de octubre'), undefined, undefined, numberCell(2)],
      [textCell('Fede'), textCell('Pendientes por reponer'), undefined, undefined, undefined, numberCell(15)],
      [undefined, textCell('1-2 oct'), undefined, undefined, undefined, numberCell(13)],
      [undefined, textCell('23 de oct'), undefined, undefined, undefined, numberCell(12)],
    );
    const result = parseHolidaysTab(sheet, { country: 'AR', defaultYear: 2026 });

    expect(result.carryover.map(({ name, remaining }) => [name, remaining])).toEqual([
      ['Eli', 2],
      ['Fede', 12],
    ]);
    expect(result.issues).toEqual([]);
  });

  it('counts the days listed when there is no figure (a date typed as a date is a day, not a quantity), and says so', () => {
    const sheet = holidaySheet('Feriados CO 26', DATES, [['Ana', 'Lo toma', 'Lo toma']]);
    sheet.rows.push([], [textCell('Feriados adeudados 2025')], [textCell('Valentina'), numberCell(excelSerial('2026-12-08'))]);
    const result = parseHolidaysTab(sheet, { country: 'CO', defaultYear: 2026 });

    expect(result.carryover).toMatchObject([{ name: 'Valentina', remaining: 1, countedFromDates: true }]);
    expect(result.issues[0]).toMatchObject({ code: 'CARRYOVER_COUNTED_FROM_DATES', name: 'Valentina' });
  });

  it('has no carry-over when the tab has no such section', () => {
    expect(parse([['Ana', 'Lo toma', 'Lo toma']]).carryover).toEqual([]);
  });
});
