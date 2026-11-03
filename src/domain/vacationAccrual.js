/**
 * Vacation accrual: 1 day per COMPLETE month since a start date, exactly like the team's
 * spreadsheet (`DATEDIF(start, TODAY(), "m")`). Dates are YYYY-MM-DD strings (calendar days,
 * no timezone). Explicit `.js` imports and no framework code so plain Node scripts can load it.
 */

function parseIso(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Complete months between two dates. A month is complete on the same day-of-month it started:
 * from the 15th, the first month is complete on the 15th of the next month (never before).
 * From the 31st, a short month never completes, so it completes on the 1st of the following one.
 */
export function completedMonths(startIso, todayIso) {
  const start = parseIso(startIso);
  const today = parseIso(todayIso);
  const months = (today.year - start.year) * 12 + (today.month - start.month) - (today.day < start.day ? 1 : 0);
  return Math.max(0, months);
}

/** The date on which month number `monthNumber` (1, 2, 3…) is complete: when its day is credited */
export function accrualDate(startIso, monthNumber) {
  const start = parseIso(startIso);
  const monthIndex = start.month - 1 + monthNumber;
  const year = start.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;

  if (start.day <= daysInMonth(year, month)) return `${year}-${pad(month)}-${pad(start.day)}`;

  // The month is too short for the start day (31st -> February): credited on the 1st of the next one
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${pad(nextMonth)}-01`;
}

/**
 * Months that still have to be credited: from the one after `accruedMonths` up to the last
 * complete one. Each comes with the date it was earned.
 * @returns {Array<{ month: number, date: string }>}
 */
export function monthsToCredit(startIso, todayIso, accruedMonths) {
  const due = completedMonths(startIso, todayIso);
  const pending = [];
  for (let month = accruedMonths + 1; month <= due; month += 1) {
    pending.push({ month, date: accrualDate(startIso, month) });
  }
  return pending;
}
