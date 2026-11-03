import { ValidationError } from '../../lib/errors';
import { isValidIsoDate } from './isoDate';
import {
  AMOUNT_STEP,
  MAX_ABS_AMOUNT,
  MAX_NOTE_LENGTH,
  MAX_VOID_REASON_LENGTH,
  MOVEMENT_TYPE_LIST,
} from './movementTypes';

export { isValidIsoDate };

// `reason` is a stable code the UI maps to a Spanish message; `message` stays in English for logs
function fail(field, reason, message) {
  throw new ValidationError(message, { field, reason });
}

function normalizeText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maxLength) fail(field, 'TOO_LONG', `${field} exceeds ${maxLength} characters`);
  return text;
}

function validateEmployeeId(employeeId) {
  if (typeof employeeId !== 'string' || !employeeId) fail('employeeId', 'REQUIRED', 'employeeId is required');
  return employeeId;
}

function validateType(type) {
  if (!MOVEMENT_TYPE_LIST.includes(type)) {
    fail('type', 'INVALID_TYPE', `type must be one of: ${MOVEMENT_TYPE_LIST.join(', ')}`);
  }
  return type;
}

function validateAmount(rawAmount) {
  const amount = typeof rawAmount === 'string' ? Number(rawAmount) : rawAmount;
  if (!Number.isFinite(amount) || amount === 0) {
    fail('amount', 'AMOUNT_ZERO_OR_INVALID', 'amount must be a non-zero number');
  }
  if (Math.abs(amount) > MAX_ABS_AMOUNT) {
    fail('amount', 'AMOUNT_TOO_LARGE', `amount must not exceed ${MAX_ABS_AMOUNT} in absolute value`);
  }
  if (amount % AMOUNT_STEP !== 0) {
    fail('amount', 'AMOUNT_NOT_STEP', `amount must be a multiple of ${AMOUNT_STEP}`);
  }
  return amount;
}

function validateDate(date) {
  if (!isValidIsoDate(date)) fail('date', 'INVALID_DATE', 'date must be a valid YYYY-MM-DD date');
  return date;
}

/**
 * Validates and normalizes the payload of a new movement.
 * @returns {{ employeeId: string, type: string, amount: number, date: string, note: string }}
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateMovementInput(input) {
  return {
    employeeId: validateEmployeeId(input?.employeeId),
    type: validateType(input?.type),
    amount: validateAmount(input?.amount),
    date: validateDate(input?.date),
    note: normalizeText(input?.note, 'note', MAX_NOTE_LENGTH),
  };
}

/**
 * Validates the fields of a correction. Only the fields present in `input` are validated and
 * returned, each with the same rules as a new movement.
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateMovementPatch(input) {
  const patch = {};
  if (input?.employeeId !== undefined) patch.employeeId = validateEmployeeId(input.employeeId);
  if (input?.type !== undefined) patch.type = validateType(input.type);
  if (input?.amount !== undefined) patch.amount = validateAmount(input.amount);
  if (input?.date !== undefined) patch.date = validateDate(input.date);
  if (input?.note !== undefined) patch.note = normalizeText(input.note, 'note', MAX_NOTE_LENGTH);

  if (!Object.keys(patch).length) fail('body', 'EMPTY_PATCH', 'No updatable fields were provided');
  return patch;
}

export function validateVoidReason(reason) {
  const text = normalizeText(reason, 'reason', MAX_VOID_REASON_LENGTH);
  if (!text) fail('reason', 'REQUIRED', 'A void reason is required');
  return text;
}
