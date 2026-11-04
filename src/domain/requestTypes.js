import { MOVEMENT_TYPES } from './movementTypes';

// The balance a request is about: the same ids as the movement types
export const REQUEST_KINDS = Object.freeze({
  OVERTIME: MOVEMENT_TYPES.OVERTIME,
  VACATION: MOVEMENT_TYPES.VACATION,
  HOLIDAY: MOVEMENT_TYPES.HOLIDAY,
  BIRTHDAY: MOVEMENT_TYPES.BIRTHDAY,
});

export const REQUEST_KIND_LIST = Object.freeze(Object.values(REQUEST_KINDS));

// What the request does to that balance: `report` adds what was worked (overtime hours of a
// month), `redeem` takes a day off out of it (hours, vacation, a holiday owed, the birthday)
export const REQUEST_ACTIONS = Object.freeze({
  REPORT: 'report',
  REDEEM: 'redeem',
});

// Only worked hours can be reported; every balance can be redeemed
const ALLOWED_ACTIONS = Object.freeze({
  [REQUEST_KINDS.OVERTIME]: [REQUEST_ACTIONS.REPORT, REQUEST_ACTIONS.REDEEM],
  [REQUEST_KINDS.VACATION]: [REQUEST_ACTIONS.REDEEM],
  [REQUEST_KINDS.HOLIDAY]: [REQUEST_ACTIONS.REDEEM],
  [REQUEST_KINDS.BIRTHDAY]: [REQUEST_ACTIONS.REDEEM],
});

/**
 * What a collaborator can pick in the form: one entry per thing they can ask for. `id` is the key of
 * its texts in content/es.js (`requests.options`).
 */
export const REQUEST_OPTIONS = Object.freeze([
  { id: 'overtime-report', kind: REQUEST_KINDS.OVERTIME, action: REQUEST_ACTIONS.REPORT },
  { id: 'overtime-redeem', kind: REQUEST_KINDS.OVERTIME, action: REQUEST_ACTIONS.REDEEM },
  { id: 'vacation', kind: REQUEST_KINDS.VACATION, action: REQUEST_ACTIONS.REDEEM },
  { id: 'holiday', kind: REQUEST_KINDS.HOLIDAY, action: REQUEST_ACTIONS.REDEEM },
  { id: 'birthday', kind: REQUEST_KINDS.BIRTHDAY, action: REQUEST_ACTIONS.REDEEM },
]);

export const REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const MAX_DECISION_NOTE_LENGTH = 300;

export function allowedActions(kind) {
  return ALLOWED_ACTIONS[kind] ?? [];
}

/**
 * Requests written before redeeming existed have no `action`: back then overtime was always a
 * report of worked hours and everything else a day taken.
 */
export function defaultAction(kind) {
  return kind === REQUEST_KINDS.OVERTIME ? REQUEST_ACTIONS.REPORT : REQUEST_ACTIONS.REDEEM;
}

export function requestAction(request) {
  return request.action ?? defaultAction(request.kind);
}

/** The form option a stored request corresponds to (for its label) */
export function requestOptionId(request) {
  const action = requestAction(request);
  return REQUEST_OPTIONS.find((option) => option.kind === request.kind && option.action === action)?.id;
}
