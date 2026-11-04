import { apiGet, apiPost, isAccessLostError, onAccessLost } from '@/lib/apiClient';

jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'id-token' } }) }));

const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const forbidden = (reason) => answer(403, { error: 'no', code: 'FORBIDDEN', metadata: { reason } });

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('apiClient requests', () => {
  it('sends the token and never lets the answer come from a cache', async () => {
    global.fetch.mockReturnValue(answer(200, { ok: true }));

    await apiGet('/api/requests');
    await apiPost('/api/requests', { a: 1 });

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/requests', expect.objectContaining({ method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer id-token' } }));
    expect(global.fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', cache: 'no-store', body: '{"a":1}' });
  });
});

describe('isAccessLostError', () => {
  const error = (statusCode, reason) => ({ statusCode, metadata: { reason } });

  it('is true for a deactivated account and for a removed email, only when refused', () => {
    expect(isAccessLostError(error(403, 'ACCOUNT_DEACTIVATED'))).toBe(true);
    expect(isAccessLostError(error(403, 'NOT_REGISTERED'))).toBe(true);
  });

  it('is false for any other failure, including an ordinary "not allowed"', () => {
    expect(isAccessLostError(error(403, undefined))).toBe(false);
    expect(isAccessLostError(error(403, 'EMAIL_NOT_VERIFIED'))).toBe(false);
    expect(isAccessLostError(error(500, 'ACCOUNT_DEACTIVATED'))).toBe(false);
    expect(isAccessLostError(null)).toBe(false);
    expect(isAccessLostError(new TypeError('network'))).toBe(false);
  });
});

describe('onAccessLost', () => {
  it('tells every listener, whichever call got the refusal, and still rejects that call', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = onAccessLost(first);
    const stopSecond = onAccessLost(second);
    global.fetch.mockReturnValue(forbidden('ACCOUNT_DEACTIVATED'));

    await expect(apiGet('/api/requests')).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(apiPost('/api/requests', {})).rejects.toBeTruthy();

    expect(first).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledWith('ACCOUNT_DEACTIVATED');
    expect(second).toHaveBeenCalledTimes(2);
    stopFirst();
    stopSecond();
  });

  it('is told about a removed email too', async () => {
    const listener = jest.fn();
    const stop = onAccessLost(listener);
    global.fetch.mockReturnValue(forbidden('NOT_REGISTERED'));

    await expect(apiGet('/api/me')).rejects.toBeTruthy();

    expect(listener).toHaveBeenCalledWith('NOT_REGISTERED');
    stop();
  });

  it('is not told about other failures: a 403 for an admin-only route is not a lost account', async () => {
    const listener = jest.fn();
    const stop = onAccessLost(listener);

    global.fetch.mockReturnValueOnce(forbidden(undefined));
    await expect(apiGet('/api/movements')).rejects.toBeTruthy();
    global.fetch.mockReturnValueOnce(answer(500, { code: 'INTERNAL_ERROR' }));
    await expect(apiGet('/api/movements')).rejects.toBeTruthy();
    global.fetch.mockReturnValueOnce(answer(200, {}));
    await apiGet('/api/movements');

    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('stops telling a listener that unsubscribed', async () => {
    const listener = jest.fn();
    onAccessLost(listener)();
    global.fetch.mockReturnValue(forbidden('ACCOUNT_DEACTIVATED'));

    await expect(apiGet('/api/me')).rejects.toBeTruthy();

    expect(listener).not.toHaveBeenCalled();
  });
});
