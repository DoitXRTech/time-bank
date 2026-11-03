import { MOVEMENT_TYPES } from './movementTypes';

// A request is something a collaborator asks for; the kind is the movement it becomes once approved
export const REQUEST_KINDS = Object.freeze({
  OVERTIME: MOVEMENT_TYPES.OVERTIME,
  VACATION: MOVEMENT_TYPES.VACATION,
});

export const REQUEST_KIND_LIST = Object.freeze(Object.values(REQUEST_KINDS));

export const REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const MAX_DECISION_NOTE_LENGTH = 300;
