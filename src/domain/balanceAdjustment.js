import { ValidationError } from '../../lib/errors';
import { AMOUNT_STEP, MAX_ABS_AMOUNT, MAX_NOTE_LENGTH, MOVEMENT_TYPE_LIST } from './movementTypes';

// `reason` is a stable code the UI maps to a Spanish message; `message` stays in English for logs
function fail(field, reason, message) {
  throw new ValidationError(message, { field, reason });
}

function roundToHundredths(value) {
  return Math.round(value * 100) / 100;
}

/** The number a field holds ('' and anything unreadable are not numbers, they are not zero) */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/**
 * What would change if each balance in `targets` became the typed value: one `{ type, amount }`
 * per balance that differs, `amount` being the signed difference. Unreadable values are skipped
 * (the screen uses this to preview while the person is still typing).
 * @param {Record<string, string|number>} targets
 * @param {Record<string, number>} currentBalances
 * @returns {{ type: string, amount: number, from: number, to: number }[]}
 */
export function balanceChanges(targets, currentBalances) {
  return MOVEMENT_TYPE_LIST.flatMap((type) => {
    const to = toNumber(targets?.[type]);
    if (!Number.isFinite(to)) return [];
    const amount = roundToHundredths(to - currentBalances[type]);
    return amount === 0 ? [] : [{ type, amount, from: currentBalances[type], to }];
  });
}

function validateTarget(type, rawValue) {
  const field = `balances.${type}`;
  const value = toNumber(rawValue);
  if (!Number.isFinite(value)) fail(field, 'INVALID_TYPE', `${field} must be a number`);
  if (Math.abs(value) > MAX_ABS_AMOUNT) fail(field, 'AMOUNT_TOO_LARGE', `${field} must not exceed ${MAX_ABS_AMOUNT} in absolute value`);
  if (value % AMOUNT_STEP !== 0) fail(field, 'AMOUNT_NOT_STEP', `${field} must be a multiple of ${AMOUNT_STEP}`);
}

/**
 * Plans the "force these balances" correction an admin asks for: how each balance has to end up
 * and a note saying what was done and why. Only the balances present are touched, and only the
 * ones that differ from `currentBalances` produce a change (an adjustment movement each).
 * @param {{ balances?: Record<string, string|number>, note?: string }} input
 * @param {Record<string, number>} currentBalances
 * @returns {{ note: string, changes: { type: string, amount: number, from: number, to: number }[] }}
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function planBalanceAdjustment(input, currentBalances) {
  const targets = input?.balances;
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    fail('balances', 'REQUIRED', 'balances are required');
  }
  Object.keys(targets).forEach((type) => {
    if (!MOVEMENT_TYPE_LIST.includes(type)) fail(`balances.${type}`, 'INVALID_TYPE', `unknown balance: ${type}`);
    validateTarget(type, targets[type]);
  });

  const changes = balanceChanges(targets, currentBalances);
  if (!changes.length) fail('balances', 'NO_CHANGES', 'the balances are already those values');

  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (!note) fail('note', 'REQUIRED', 'a note saying what was done is required');
  if (note.length > MAX_NOTE_LENGTH) fail('note', 'TOO_LONG', `note exceeds ${MAX_NOTE_LENGTH} characters`);

  return { note, changes };
}
