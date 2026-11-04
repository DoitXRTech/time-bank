import { assertClientIsCurrent } from '../../lib/appVersion';
import { ConflictError } from '../../lib/errors';
import versionRoute from '../../src/pages/api/version';

const originalBuildId = process.env.NEXT_PUBLIC_APP_BUILD_ID;

const requestFrom = (method, clientBuildId) => ({ method, headers: clientBuildId === undefined ? {} : { 'x-app-build': clientBuildId } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_BUILD_ID = 'deploy-2';
});

afterAll(() => {
  if (originalBuildId === undefined) delete process.env.NEXT_PUBLIC_APP_BUILD_ID;
  else process.env.NEXT_PUBLIC_APP_BUILD_ID = originalBuildId;
});

describe('assertClientIsCurrent', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('refuses a %s made by a page from an older deploy', (method) => {
    expect(() => assertClientIsCurrent(requestFrom(method, 'deploy-1'))).toThrow(ConflictError);
    expect(() => assertClientIsCurrent(requestFrom(method, 'deploy-1'))).toThrow(expect.objectContaining({ metadata: { reason: 'APP_OUTDATED' }, statusCode: 409 }));
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('lets a %s through even from an older page: reading changes nothing', (method) => {
    expect(() => assertClientIsCurrent(requestFrom(method, 'deploy-1'))).not.toThrow();
  });

  it('lets a change through from a page of the current deploy', () => {
    expect(() => assertClientIsCurrent(requestFrom('POST', 'deploy-2'))).not.toThrow();
  });

  it('lets a change through when the caller does not say which deploy it comes from (older code, scripts)', () => {
    expect(() => assertClientIsCurrent(requestFrom('POST', undefined))).not.toThrow();
    expect(() => assertClientIsCurrent({ method: 'POST' })).not.toThrow();
  });

  it('never refuses anything on a local build', () => {
    process.env.NEXT_PUBLIC_APP_BUILD_ID = 'development';
    expect(() => assertClientIsCurrent(requestFrom('POST', 'deploy-1'))).not.toThrow();

    delete process.env.NEXT_PUBLIC_APP_BUILD_ID;
    expect(() => assertClientIsCurrent(requestFrom('POST', 'deploy-1'))).not.toThrow();
  });
});

describe('GET /api/version', () => {
  const call = async (method) => {
    const res = { headers: {}, setHeader: (key, value) => { res.headers[key] = value; }, status: (code) => { res.statusCode = code; return res; }, json: (body) => { res.body = body; return res; } };
    await versionRoute({ method, headers: {}, url: '/api/version' }, res);
    return res;
  };

  it('answers the id of the latest deploy, to anybody, and never lets it be cached', async () => {
    const res = await call('GET');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ buildId: 'deploy-2' });
    expect(res.headers['Cache-Control']).toBe('no-store, max-age=0');
  });

  it('answers null (not an error) when the build has no id', async () => {
    delete process.env.NEXT_PUBLIC_APP_BUILD_ID;

    expect((await call('GET')).body).toEqual({ buildId: null });
  });

  it('answers 405 to anything but GET', async () => {
    const res = await call('POST');

    expect(res.statusCode).toBe(405);
  });
});
