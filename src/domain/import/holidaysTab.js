import { parseSpanishNumber } from './sheetValues.js';

/**
 * Reads a "Feriados XX 26" tab: one tab per country, one row per person, one column per holiday.
 *
 * What a cell says (confirmed by the team):
 * - "Lo toma" / "Lo tomo adelantado": the person took the holiday off. No balance.
 * - "Reponer": the holiday was worked, so the COMPANY OWES THE PERSON a day ("nosotros a vos").
 *   Written plain it is pending; STRUCK THROUGH it was already repaid. This is formatting, which a
 *   CSV export loses: the tab has to be read from the .xlsx.
 * - A date (a real date cell): the day taken instead, i.e. already repaid.
 * - "Sábado" / "Domingo": the holiday fell on a weekend. "N/A", "NA", "-": does not apply.
 * - The last column, "Día de Cumpleaños", works the same way for the birthday benefit.
 * - Below the matrix, "Feriados adeudados 2025" lists days still owed from last year.
 */

export const HOLIDAY_CELL = Object.freeze({
  EMPTY: 'empty',
  TAKEN: 'taken',
  PENDING: 'pending',
  SETTLED: 'settled',
  WEEKEND: 'weekend',
  NOT_APPLICABLE: 'not-applicable',
  REPLACED_ON_DATE: 'replaced-on-date',
  UNKNOWN: 'unknown',
});

const MIN_EXCEL_SERIAL = 36526; // 2000-01-01
const MAX_EXCEL_SERIAL = 73415; // 2100-01-01
const CARRYOVER_MARKER = 'feriados adeudados';

function foldText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Excel stores dates as days since 1899-12-30 */
export function excelSerialToIso(serial) {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

const isDateSerial = (cell) => cell?.number !== null && cell?.number !== undefined && cell.number >= MIN_EXCEL_SERIAL && cell.number <= MAX_EXCEL_SERIAL;
const DAY_MONTH_TEXT = /^(\d{1,2})\/(\d{1,2})$/;

export function classifyHolidayCell(cell) {
  if (!cell) return HOLIDAY_CELL.EMPTY;
  if (cell.number !== null && cell.number !== undefined) return HOLIDAY_CELL.REPLACED_ON_DATE;

  const text = foldText(cell.text);
  if (!text) return HOLIDAY_CELL.EMPTY;
  if (text.startsWith('reponer')) return cell.strike ? HOLIDAY_CELL.SETTLED : HOLIDAY_CELL.PENDING;
  if (/^lo tom[oa]/.test(text) || text.startsWith('toma el')) return HOLIDAY_CELL.TAKEN;
  if (text === 'sabado' || text === 'domingo') return HOLIDAY_CELL.WEEKEND;
  if (['n/a', 'na', '-'].includes(text)) return HOLIDAY_CELL.NOT_APPLICABLE;
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(text)) return HOLIDAY_CELL.REPLACED_ON_DATE;
  return HOLIDAY_CELL.UNKNOWN;
}

/** The holiday of a header cell: a date cell (Excel serial) or text "dd/mm" */
function readHeader(cell, defaultYear) {
  if (isDateSerial(cell)) {
    const iso = excelSerialToIso(cell.number);
    return { month: iso.slice(5, 7), day: iso.slice(8, 10), year: Number(iso.slice(0, 4)) };
  }
  const match = DAY_MONTH_TEXT.exec((cell?.text ?? '').trim());
  if (!match) return null;
  return { month: match[2].padStart(2, '0'), day: match[1].padStart(2, '0'), year: defaultYear };
}

function findHeaderRow(rows, defaultYear) {
  const index = rows.findIndex((row) => (row ?? []).slice(1).filter((cell) => readHeader(cell, defaultYear)).length >= 2);
  return index;
}

/** The year most holidays are dated in: one header typed with the wrong year must not move a holiday */
function dominantYear(headers, defaultYear) {
  const counts = new Map();
  headers.forEach(({ year }) => counts.set(year, (counts.get(year) ?? 0) + 1));
  const [year] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [defaultYear];
  return year;
}

function parseCarryover(rows, startIndex, country) {
  const blocks = [];
  let current = null;

  rows.slice(startIndex + 1).forEach((row, offset) => {
    const sourceRow = startIndex + offset + 2;
    const cells = row ?? [];
    const hasContent = cells.some((cell) => cell && (cell.text.trim() || cell.number !== null));
    if (!hasContent) {
      current = null;
      return;
    }

    const name = (cells[0]?.text ?? '').trim();
    if (name) {
      current = { name, sourceRow, numbers: [], datesListed: 0 };
      blocks.push(current);
    }
    if (!current) return;

    cells.slice(1).forEach((cell) => {
      if (!cell) return;
      // A date cell ("8 de diciembre" typed as a date) is a day owed, not a quantity
      if (isDateSerial(cell)) {
        current.datesListed += 1;
        return;
      }
      const number = cell.number ?? parseSpanishNumber(cell.text);
      if (number !== null) current.numbers.push(number);
      else if (cell.text.trim()) current.datesListed += 1;
    });
  });

  // A running count ("15", "13", "12") ends at its last figure; without any figure, each listed day counts
  return blocks.map((block) => ({
    country,
    name: block.name,
    sourceRow: block.sourceRow,
    remaining: block.numbers.length ? block.numbers[block.numbers.length - 1] : block.datesListed,
    countedFromDates: block.numbers.length === 0,
  }));
}

/**
 * @param {{ name: string, rows: Array, hiddenRows?: Set<number> }} sheet a sheet read by readWorkbook
 * @param {{ country: string, defaultYear: number }} options country code of the tab; year for text headers
 */
export function parseHolidaysTab(sheet, { country, defaultYear }) {
  const issues = [];
  const rows = sheet.rows;
  const hiddenRows = sheet.hiddenRows ?? new Set();

  const headerIndex = findHeaderRow(rows, defaultYear);
  if (headerIndex === -1) return { country, holidays: [], people: [], carryover: [], issues: [{ code: 'HOLIDAY_HEADER_NOT_FOUND', detail: sheet.name }] };

  const headerCells = rows[headerIndex];
  const raw = headerCells.map((cell, column) => ({ column, header: column === 0 ? null : readHeader(cell, defaultYear) })).filter(({ header }) => header);
  const year = dominantYear(raw.map(({ header }) => header), defaultYear);

  const holidays = raw.map(({ column, header }) => ({ column, label: `${header.day}/${header.month}`, iso: `${year}-${header.month}-${header.day}` }));
  raw.filter(({ header }) => header.year !== year).forEach(({ header }) => {
    issues.push({ code: 'HOLIDAY_YEAR_ADJUSTED', detail: `${header.day}/${header.month} is dated ${header.year} in the header; ${year} was used` });
  });
  const birthdayColumn = headerCells.findIndex((cell) => foldText(cell?.text).includes('cumple'));

  const people = [];
  let carryoverStart = -1;

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const cells = rows[index] ?? [];
    const name = (cells[0]?.text ?? '').trim();
    if (foldText(name).startsWith(CARRYOVER_MARKER)) {
      carryoverStart = index;
      break;
    }
    if (!name) {
      if (cells.some((cell) => cell && cell.text.trim())) continue;
      // The matrix ends at the first empty row, unless more rows with names follow shortly
      continue;
    }

    const sourceRow = index + 1;
    const person = { name, sourceRow, hidden: hiddenRows.has(sourceRow), pending: [], settledCount: 0, repaidOnDate: 0, birthday: null };

    holidays.forEach(({ column, label, iso }) => {
      const kind = classifyHolidayCell(cells[column]);
      if (kind === HOLIDAY_CELL.PENDING) person.pending.push({ label, iso });
      else if (kind === HOLIDAY_CELL.SETTLED) person.settledCount += 1;
      else if (kind === HOLIDAY_CELL.REPLACED_ON_DATE) person.repaidOnDate += 1;
      else if (kind === HOLIDAY_CELL.UNKNOWN) {
        issues.push({ code: 'HOLIDAY_STATUS_UNKNOWN', row: sourceRow, name, detail: `"${cells[column].text.trim()}" under ${label}` });
      }
    });

    if (birthdayColumn > 0) {
      const kind = classifyHolidayCell(cells[birthdayColumn]);
      if (kind === HOLIDAY_CELL.PENDING) person.birthday = 'pending';
      else if (kind === HOLIDAY_CELL.SETTLED || kind === HOLIDAY_CELL.TAKEN || kind === HOLIDAY_CELL.REPLACED_ON_DATE) person.birthday = 'done';
      else if (kind === HOLIDAY_CELL.UNKNOWN) {
        issues.push({ code: 'HOLIDAY_STATUS_UNKNOWN', row: sourceRow, name, detail: `"${cells[birthdayColumn].text.trim()}" under the birthday column` });
      }
    }
    people.push(person);
  }

  const carryover = carryoverStart === -1 ? [] : parseCarryover(rows, carryoverStart, country);
  carryover.filter((block) => block.countedFromDates).forEach((block) => {
    issues.push({ code: 'CARRYOVER_COUNTED_FROM_DATES', row: block.sourceRow, name: block.name, detail: `no figure, ${block.remaining} listed day(s) counted` });
  });

  return { country, holidays, people, carryover, issues };
}
