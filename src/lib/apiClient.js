import { BUILD_ID_HEADER } from '../domain/appVersion';
import { currentBuildId } from './appVersion';
import { getFirebaseAuth } from './firebase';

export class ApiError extends Error {
  constructor(message, statusCode, code, metadata) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata ?? {};
  }
}

// The server refuses everything to an account that was deactivated or whose email was removed
const ACCESS_LOST_REASONS = Object.freeze(['ACCOUNT_DEACTIVATED', 'NOT_REGISTERED']);
const accessLostListeners = new Set();
const appOutdatedListeners = new Set();

/** True for the answer that means "this page is from an older deploy: reload it" */
export function isAppOutdatedError(error) {
  return error?.statusCode === 409 && error.metadata?.reason === 'APP_OUTDATED';
}

/** Calls `listener()` when the server refuses a change because this page's code is out of date */
export function onAppOutdated(listener) {
  appOutdatedListeners.add(listener);
  return () => appOutdatedListeners.delete(listener);
}

/** True for the answer that means "this person has no access any more" (not a failure of one request) */
export function isAccessLostError(error) {
  return error?.statusCode === 403 && ACCESS_LOST_REASONS.includes(error.metadata?.reason);
}

/**
 * Calls `listener(reason)` when any API answer says the account lost its access, wherever the call
 * came from (a click, or a refresh nobody is looking at). Returns the function that unsubscribes.
 */
export function onAccessLost(listener) {
  accessLostListeners.add(listener);
  return () => accessLostListeners.delete(listener);
}

async function request(method, url, body) {
  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser) throw new ApiError('Not signed in', 401, 'UNAUTHENTICATED');

  const idToken = await currentUser.getIdToken();
  const buildId = currentBuildId();
  const response = await fetch(url, {
    method,
    // What people see changes under their feet: never serve it from a cache
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${idToken}`,
      // Which deploy this code is from, so the server can refuse changes made with old code
      ...(buildId ? { [BUILD_ID_HEADER]: buildId } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new ApiError(payload.error ?? 'Request failed', response.status, payload.code ?? 'UNKNOWN_ERROR', payload.metadata);
    if (isAccessLostError(error)) accessLostListeners.forEach((listener) => listener(error.metadata.reason));
    if (isAppOutdatedError(error)) appOutdatedListeners.forEach((listener) => listener());
    throw error;
  }
  return payload;
}

export const apiGet = (url) => request('GET', url);
export const apiPost = (url, body) => request('POST', url, body ?? {});
export const apiPatch = (url, body) => request('PATCH', url, body);
