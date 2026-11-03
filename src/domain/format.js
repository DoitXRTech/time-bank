const MINUS_SIGN = '−';

function roundToHundredths(value) {
  return Math.round(value * 100) / 100;
}

function formatMagnitude(value) {
  const rounded = Math.abs(roundToHundredths(value));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, '');
}

/** "+6 h", "−2 h", "0 d" — explicit sign so positive and negative movements read at a glance */
export function formatSignedAmount(value, unit) {
  const rounded = roundToHundredths(value);
  if (rounded === 0) return `0 ${unit}`;
  const sign = rounded < 0 ? MINUS_SIGN : '+';
  return `${sign}${formatMagnitude(rounded)} ${unit}`;
}

/** "5 h", "2.5 d": an amount without a sign, for things not yet in the balance (requests) */
export function formatAmount(value, unit) {
  return `${formatMagnitude(value)} ${unit}`;
}

/** "octubre de 2026" for a YYYY-MM month */
export function formatMonth(isoMonth, locale = 'es-CR') {
  const date = new Date(`${isoMonth}-01T12:00:00`);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Parses a YYYY-MM-DD calendar date without letting the timezone shift the day */
export function formatDate(isoDate, locale = 'es-CR') {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Today as YYYY-MM-DD in the user's local timezone */
export function todayIsoDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
