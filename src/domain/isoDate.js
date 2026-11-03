const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** True for a real month written as YYYY-MM (year within the accepted range, month 01-12) */
export function isValidIsoMonth(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_MONTH_PATTERN.exec(value);
  if (!match) return false;
  const [year, month] = match.slice(1).map(Number);
  return year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12;
}

/** The month before the one a YYYY-MM-DD date falls in, as YYYY-MM ("2026-01-15" -> "2025-12") */
export function previousIsoMonth(isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The `count` months that already ended before `isoDate`, most recent first */
export function recentFinishedMonths(isoDate, count) {
  const months = [];
  let cursor = isoDate;
  for (let index = 0; index < count; index += 1) {
    const month = previousIsoMonth(cursor);
    months.push(month);
    cursor = `${month}-01`;
  }
  return months;
}

/** The last calendar day of a YYYY-MM month, as YYYY-MM-DD ("2026-02" -> "2026-02-28") */
export function lastDayOfMonth(isoMonth) {
  const [year, month] = isoMonth.split('-').map(Number);
  // Day 0 of the next month is the last day of this one
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${isoMonth}-${String(day).padStart(2, '0')}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects Feb 30, year 1999, non-strings) */
export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  // Date rolls invalid days over (Feb 30 -> Mar 2), so comparing back catches them
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
