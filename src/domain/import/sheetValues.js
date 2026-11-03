import { isValidIsoDate } from '../isoDate.js';

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  // Abbreviations and truncations found in the sheet ("Sept", "oct", "de En")
  en: 1,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  jun: 6,
  jul: 7,
  ago: 8,
  agos: 8,
  sep: 9,
  sept: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

// "19 y 20", "5-6-9", "Del 11 al 16": the first number is the first day, the rest is ignored
const DAY_LIST = String.raw`(\d{1,2})(?:\s*(?:,|-|y|al)\s*\d{1,2})*`;
const FULL_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/;
const DAY_MONTH_PATTERN = /^(\d{1,2})\/(\d{1,2})$/;
const DAYS_OF_MONTH_NAME_PATTERN = new RegExp(String.raw`^(?:del\s+)?${DAY_LIST}\s+de\s+([a-záéíóú]+)$`, 'i');
const DAYS_OF_MONTH_NUMBER_PATTERN = new RegExp(String.raw`^(?:del\s+)?${DAY_LIST}\/(\d{1,2})$`, 'i');
const MONTH_NAME_PATTERN = /^(?:de\s+)?([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?$/i;

/** "7,00" -> 7, "-2,50" -> -2.5. Anything else ("N/A", "-", "") -> null. */
export function parseSpanishNumber(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return null;
  return Number(text.replace(',', '.'));
}

function toIso(year, month, day) {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads the date formats found in the team's spreadsheet (day first, as in Costa Rica).
 *
 * @param {string} raw cell text
 * @param {{ referenceYear?: number|null }} [options] year to assume when the cell has none
 * @returns {{ iso: string, kind: 'exact'|'year-assumed'|'month-name'|'range-first-day' }|null}
 *   `null` when the text is not a usable date (free text such as "PAGO" or "30, 31 y 01")
 */
export function parseSheetDate(raw, { referenceYear = null } = {}) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;

  const full = FULL_DATE_PATTERN.exec(text);
  if (full) {
    const year = full[3].length === 2 ? 2000 + Number(full[3]) : Number(full[3]);
    const iso = toIso(year, Number(full[2]), Number(full[1]));
    return iso ? { iso, kind: 'exact' } : null;
  }

  const dayMonth = DAY_MONTH_PATTERN.exec(text);
  if (dayMonth && referenceYear) {
    const iso = toIso(referenceYear, Number(dayMonth[2]), Number(dayMonth[1]));
    return iso ? { iso, kind: 'year-assumed' } : null;
  }

  // "18 de junio", "19 y 20 de Marzo", "Del 11 al 16/06": the first day of the list
  const daysWithName = DAYS_OF_MONTH_NAME_PATTERN.exec(text);
  const daysWithNumber = DAYS_OF_MONTH_NUMBER_PATTERN.exec(text);
  const listed = daysWithName ?? daysWithNumber;
  const listedMonth = daysWithName ? MONTHS[daysWithName[2].toLowerCase()] : Number(daysWithNumber?.[2]);
  if (listed && listedMonth && referenceYear) {
    const iso = toIso(referenceYear, listedMonth, Number(listed[1]));
    const dayCount = (text.replace(/\/\d{1,2}$/, '').match(/\d{1,2}/g) ?? []).length;
    return iso ? { iso, kind: dayCount > 1 ? 'range-first-day' : 'year-assumed' } : null;
  }

  // A bare month ("setiembre") means "that month": the last day is used as its date
  const named = MONTH_NAME_PATTERN.exec(text);
  const month = named ? MONTHS[named[1].toLowerCase()] : undefined;
  const year = named?.[2] ? Number(named[2]) : referenceYear;
  if (month && year) {
    const iso = toIso(year, month, lastDayOfMonth(year, month));
    return iso ? { iso, kind: 'month-name' } : null;
  }

  return null;
}
