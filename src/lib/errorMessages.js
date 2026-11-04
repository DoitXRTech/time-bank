import es from '../content/es';

const FORBIDDEN_REASON_MESSAGES = {
  NOT_REGISTERED: es.errors.notRegistered,
  ACCOUNT_DEACTIVATED: es.errors.accountDeactivated,
  EMAIL_NOT_VERIFIED: es.errors.emailNotVerified,
};

const CONFLICT_REASON_MESSAGES = {
  SELF_LOCKOUT: es.errors.selfLockout,
  OWN_EMAIL_REMOVAL: es.errors.ownEmailRemoval,
  EMAIL_TAKEN: es.errors.emailTaken,
  EMPLOYEE_INACTIVE: es.errors.employeeInactive,
  ALREADY_VOIDED: es.errors.alreadyVoided,
  MOVEMENT_VOIDED: es.errors.movementVoided,
  PROFILE_NOT_PENDING: es.errors.profileNotPending,
  START_DATE_MISMATCH: es.errors.startDateMismatch,
  ACCRUAL_ALREADY_RUNNING: es.errors.accrualAlreadyRunning,
  REQUEST_NOT_PENDING: es.errors.requestNotPending,
  NO_EMPLOYEES_IN_COUNTRY: es.errors.noEmployeesInCountry,
};

const FIREBASE_AUTH_MESSAGES = {
  'auth/popup-closed-by-user': es.errors.popupClosed,
  'auth/cancelled-popup-request': es.errors.popupClosed,
};

/**
 * Turns any error (ApiError, Firebase auth error, network failure) into a Spanish message.
 * The server only sends stable codes and reasons; the wording lives in content/es.js.
 */
export function getErrorMessage(error) {
  const { code, metadata } = error ?? {};
  const reason = metadata?.reason;

  if (typeof code === 'string' && code.startsWith('auth/')) {
    return FIREBASE_AUTH_MESSAGES[code] ?? es.errors.generic;
  }

  switch (code) {
    case 'VALIDATION_ERROR':
      return es.errors.validation[reason] ?? es.errors.generic;
    case 'FORBIDDEN':
      return FORBIDDEN_REASON_MESSAGES[reason] ?? es.errors.forbidden;
    case 'CONFLICT':
      return CONFLICT_REASON_MESSAGES[reason] ?? es.errors.generic;
    case 'EXTERNAL_SERVICE_ERROR':
      return reason === 'SHEET_NOT_READABLE' ? es.errors.sheetNotReadable : es.errors.generic;
    case 'UNAUTHENTICATED':
      return es.errors.unauthenticated;
    case 'NOT_FOUND':
      return es.errors.notFound;
    default:
      return error instanceof TypeError ? es.errors.network : es.errors.generic;
  }
}
