export const MOVEMENT_TYPES = Object.freeze({
  OVERTIME: 'overtime',
  VACATION: 'vacation',
  HOLIDAY: 'holiday',
  // Birthday day off: a benefit of its own, separate from vacations and holidays
  BIRTHDAY: 'birthday',
});

export const MOVEMENT_TYPE_LIST = Object.freeze(Object.values(MOVEMENT_TYPES));

// Overtime is tracked in hours, vacation and holidays in days
export const MOVEMENT_UNITS = Object.freeze({
  [MOVEMENT_TYPES.OVERTIME]: 'h',
  [MOVEMENT_TYPES.VACATION]: 'd',
  [MOVEMENT_TYPES.HOLIDAY]: 'd',
  [MOVEMENT_TYPES.BIRTHDAY]: 'd',
});

// Quarter steps are exactly representable as floats, so sums never drift
export const AMOUNT_STEP = 0.25;
export const MAX_ABS_AMOUNT = 1000;
export const MAX_NOTE_LENGTH = 500;
export const MAX_VOID_REASON_LENGTH = 300;

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MEMBER: 'member',
});

export const ROLE_LIST = Object.freeze(Object.values(ROLES));
