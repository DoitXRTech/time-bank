import { ValidationError } from '../../lib/errors';
import { isValidIsoDate, isValidIsoMonth, lastDayOfMonth } from './isoDate';
import { MAX_NOTE_LENGTH } from './movementTypes';
import { validateAmount, validateMovementInput } from './movementValidation';
import {
  allowedActions,
  defaultAction,
  MAX_DECISION_NOTE_LENGTH,
  REQUEST_ACTIONS,
  REQUEST_KIND_LIST,
  requestAction,
} from './requestTypes';

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

// A client from before redeeming existed sends no action: it means what it always meant
function validateAction(kind, rawAction) {
  const action = rawAction ?? defaultAction(kind);
  if (!allowedActions(kind).includes(action)) {
    fail('action', 'INVALID_TYPE', `action must be one of: ${allowedActions(kind).join(', ')}`);
  }
  return action;
}

// A request always asks for something: the sign of the movement comes from its action, not from the person
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

function validateDay(date) {
  if (!isValidIsoDate(date)) fail('date', 'INVALID_DATE', 'date must be a valid YYYY-MM-DD date');
  return date;
}

/**
 * Validates and normalizes what a collaborator sends. Two shapes:
 * - report the overtime of a finished month: `{ kind: 'overtime', action: 'report', month: 'YYYY-MM', amount }`
 * - redeem a balance on a day (overtime hours, vacation, a holiday owed, the birthday):
 *   `{ kind, action: 'redeem', date: 'YYYY-MM-DD', amount }`
 * @param {object} input
 * @param {string} today YYYY-MM-DD in the company time zone
 * @returns {{ kind: string, action: string, amount: number, date: string, period: string|null, note: string }}
 *   `date` is the day the movement will carry: the last day of the month for a report, the day taken (the
 *   first one, for vacation) for a redeem.
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateRequestInput(input, today) {
  const kind = validateKind(input?.kind);
  const action = validateAction(kind, input?.action);
  const amount = validateRequestedAmount(input?.amount);
  const note = normalizeText(input?.note, 'note', MAX_NOTE_LENGTH);

  if (action === REQUEST_ACTIONS.REPORT) {
    const period = validateReportedMonth(input?.month, today);
    return { kind, action, amount, date: lastDayOfMonth(period), period, note };
  }
  return { kind, action, amount, date: validateDay(input?.date), period: null, note };
}

/** Why a request was turned down; the collaborator reads it, so it is required */
export function validateDecisionReason(reason) {
  const text = normalizeText(reason, 'reason', MAX_DECISION_NOTE_LENGTH);
  if (!text) fail('reason', 'REQUIRED', 'A reason is required');
  return text;
}

/**
 * The movement an approved request becomes: a report adds hours to the bank, a redeem takes the
 * amount out of the balance it is about. Goes through the same validation as a movement typed by an admin.
 */
export function movementFromRequest(request) {
  const sign = requestAction(request) === REQUEST_ACTIONS.REPORT ? 1 : -1;
  return validateMovementInput({
    employeeId: request.employeeId,
    type: request.kind,
    amount: sign * request.amount,
    date: request.date,
    note: request.note,
  });
}
