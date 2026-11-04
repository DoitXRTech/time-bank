import { apiGet, apiPost, isAppOutdatedError, onAppOutdated } from '@/lib/apiClient';

jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'id-token' } }) }));

const originalBuildId = process.env.NEXT_PUBLIC_APP_BUILD_ID;
const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const outdated = () => answer(409, { error: 'old', code: 'CONFLICT', metadata: { reason: 'APP_OUTDATED' } });

beforeEach(() => {
  global.fetch = jest.fn();
  process.env.NEXT_PUBLIC_APP_BUILD_ID = 'deploy-1';
});

afterAll(() => {
  if (originalBuildId === undefined) delete process.env.NEXT_PUBLIC_APP_BUILD_ID;
  else process.env.NEXT_PUBLIC_APP_BUILD_ID = originalBuildId;
});

describe('which deploy a call comes from', () => {
  it('tells the server in every call, so it can refuse changes made with old code', async () => {
    global.fetch.mockReturnValue(answer(200, {}));

    await apiGet('/api/requests');
    await apiPost('/api/requests', { a: 1 });

    expect(global.fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer id-token', 'x-app-build': 'deploy-1' });
    expect(global.fetch.mock.calls[1][1].headers).toMatchObject({ 'x-app-build': 'deploy-1' });
  });

  it('sends none when the build has no id (a local build)', async () => {
    delete process.env.NEXT_PUBLIC_APP_BUILD_ID;
    global.fetch.mockReturnValue(answer(200, {}));

    await apiGet('/api/requests');

    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('x-app-build');
  });
});

describe('onAppOutdated', () => {
  it('is told when the server refuses a change because the page is old, and the call still fails', async () => {
    const listener = jest.fn();
    const stop = onAppOutdated(listener);
    global.fetch.mockReturnValue(outdated());

    await expect(apiPost('/api/requests', {})).rejects.toMatchObject({ statusCode: 409, metadata: { reason: 'APP_OUTDATED' } });

    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('is not told about any other conflict, nor after unsubscribing', async () => {
    const listener = jest.fn();
    const stop = onAppOutdated(listener);

    global.fetch.mockReturnValueOnce(answer(409, { code: 'CONFLICT', metadata: { reason: 'REQUEST_NOT_PENDING' } }));
    await expect(apiPost('/api/requests/x/approve', {})).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();

    stop();
    global.fetch.mockReturnValueOnce(outdated());
    await expect(apiPost('/api/requests', {})).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('isAppOutdatedError', () => {
  it('recognises only the refusal for an old page', () => {
    expect(isAppOutdatedError({ statusCode: 409, metadata: { reason: 'APP_OUTDATED' } })).toBe(true);
    expect(isAppOutdatedError({ statusCode: 409, metadata: { reason: 'ALREADY_VOIDED' } })).toBe(false);
    expect(isAppOutdatedError({ statusCode: 403, metadata: { reason: 'APP_OUTDATED' } })).toBe(false);
    expect(isAppOutdatedError(null)).toBe(false);
  });
});
