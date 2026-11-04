import { ValidationError } from '../../lib/errors';
import { COUNTRY_LIST } from './countries';
import { MAX_NOTE_LENGTH, MOVEMENT_TYPES } from './movementTypes';
import { normalizeText, validateDate } from './movementValidation';

// One batch is a month's worth of days, at most
export const MAX_DATES_PER_BATCH = 31;

// Each date of a country batch is a holiday: one day owed to everybody there. The client does not
// choose the type or the amount, so the number of dates is the number of days.
export const COUNTRY_HOLIDAY = Object.freeze({ type: MOVEMENT_TYPES.HOLIDAY, amount: 1 });

// `reason` is a stable code the UI maps to a Spanish message; `message` stays in English for logs
function fail(field, reason, message) {
  throw new ValidationError(message, { field, reason });
}

function validateCountry(value) {
  if (value === undefined || value === null || value === '') fail('country', 'REQUIRED', 'country is required');
  if (!COUNTRY_LIST.includes(value)) fail('country', 'INVALID_COUNTRY', `country must be one of: ${COUNTRY_LIST.join(', ')}`);
  return value;
}

/** The days, each a valid date, without repeats and in order (they need not be consecutive) */
function validateDates(value) {
  if (!Array.isArray(value) || value.length === 0) fail('dates', 'REQUIRED', 'at least one date is required');
  const dates = [...new Set(value.map(validateDate))].sort();
  if (dates.length > MAX_DATES_PER_BATCH) fail('dates', 'TOO_MANY_DATES', `at most ${MAX_DATES_PER_BATCH} dates at once`);
  return dates;
}

/**
 * Validates the holidays of a country: a day (`+1` "Feriados por canjear") for everybody there on
 * each date. The note is required because it touches many people at once and is what explains it in
 * each of their histories. A type or an amount sent by a client is ignored.
 * @returns {{ country: string, type: string, amount: number, dates: string[], note: string }}
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateCountryMovementInput(input) {
  const note = normalizeText(input?.note, 'note', MAX_NOTE_LENGTH);
  if (!note) fail('note', 'REQUIRED', 'a note is required');

  return {
    country: validateCountry(input?.country),
    ...COUNTRY_HOLIDAY,
    dates: validateDates(input?.dates),
    note,
  };
}
