import { ValidationError } from '../../lib/errors';
import { isValidIsoDate, isValidIsoMonth, lastDayOfMonth } from './isoDate';
import { MAX_NOTE_LENGTH } from './movementTypes';
import { validateAmount, validateMovementInput } from './movementValidation';
import { MAX_DECISION_NOTE_LENGTH, REQUEST_KIND_LIST, REQUEST_KINDS } from './requestTypes';

// `reason` is a stable code the UI maps to a Spanish message; `message` stays in English for logs
function fail(field, reason, message) {
  throw new ValidationError(message, { field, reason });
}

function normalizeText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maxLength) fail(field, 'TOO_LONG', `${field} exceeds ${maxLength} characters`);
  return text;
}

function validateKind(kind) {
  if (!REQUEST_KIND_LIST.includes(kind)) {
    fail('kind', 'INVALID_TYPE', `kind must be one of: ${REQUEST_KIND_LIST.join(', ')}`);
  }
  return kind;
}

// A request always asks for something: the sign of the movement is decided by its kind, not by the person
function validateRequestedAmount(rawAmount) {
  const amount = validateAmount(rawAmount);
  if (amount < 0) fail('amount', 'AMOUNT_NOT_POSITIVE', 'amount must be greater than zero');
  return amount;
}

/** Overtime is reported for a month that already ended (a month still running has hours left to work) */
function validateReportedMonth(month, today) {
  if (!isValidIsoMonth(month)) fail('month', 'INVALID_MONTH', 'month must be a valid YYYY-MM month');
  if (month >= today.slice(0, 7)) fail('month', 'MONTH_NOT_FINISHED', 'month must be before the current month');
  return month;
}

function validateStartDate(date) {
  if (!isValidIsoDate(date)) fail('date', 'INVALID_DATE', 'date must be a valid YYYY-MM-DD date');
  return date;
}

/**
 * Validates and normalizes what a collaborator sends: either the overtime hours of a finished
 * month (`{ kind: 'overtime', month: 'YYYY-MM', amount }`) or vacation days starting on a date
 * (`{ kind: 'vacation', date: 'YYYY-MM-DD', amount }`).
 * @param {object} input
 * @param {string} today YYYY-MM-DD in the company time zone
 * @returns {{ kind: string, amount: number, date: string, period: string|null, note: string }}
 *   `date` is the day the movement will carry: the last day of the month for overtime, the first day for vacation.
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateRequestInput(input, today) {
  const kind = validateKind(input?.kind);
  const amount = validateRequestedAmount(input?.amount);
  const note = normalizeText(input?.note, 'note', MAX_NOTE_LENGTH);

  if (kind === REQUEST_KINDS.OVERTIME) {
    const period = validateReportedMonth(input?.month, today);
    return { kind, amount, date: lastDayOfMonth(period), period, note };
  }
  return { kind, amount, date: validateStartDate(input?.date), period: null, note };
}

/** Why a request was turned down; the collaborator reads it, so it is required */
export function validateDecisionReason(reason) {
  const text = normalizeText(reason, 'reason', MAX_DECISION_NOTE_LENGTH);
  if (!text) fail('reason', 'REQUIRED', 'A reason is required');
  return text;
}

/**
 * The movement an approved request becomes: overtime adds hours to the bank, vacation takes days out.
 * Goes through the same validation as a movement typed by an admin.
 */
export function movementFromRequest(request) {
  const sign = request.kind === REQUEST_KINDS.VACATION ? -1 : 1;
  return validateMovementInput({
    employeeId: request.employeeId,
    type: request.kind,
    amount: sign * request.amount,
    date: request.date,
    note: request.note,
  });
}
