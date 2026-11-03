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

async function request(method, url, body) {
  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser) throw new ApiError('Not signed in', 401, 'UNAUTHENTICATED');

  const idToken = await currentUser.getIdToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Request failed', response.status, payload.code ?? 'UNKNOWN_ERROR', payload.metadata);
  }
  return payload;
}

export const apiGet = (url) => request('GET', url);
export const apiPost = (url, body) => request('POST', url, body ?? {});
export const apiPatch = (url, body) => request('PATCH', url, body);
