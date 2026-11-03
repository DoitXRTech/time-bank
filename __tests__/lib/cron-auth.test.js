import { assertCronRequest } from '../../lib/cron-auth';
import { AuthenticationError } from '../../lib/errors';
import { todayInAppTimeZone } from '../../lib/appDate';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('assertCronRequest', () => {
  it('accepts the exact bearer secret', () => {
    process.env.CRON_SECRET = 's3cret-value';
    expect(() => assertCronRequest({ headers: { authorization: 'Bearer s3cret-value' } })).not.toThrow();
  });

  it.each([
    ['a wrong secret', 'Bearer other'],
    ['a secret of the same length', 'Bearer s3cret-valuX'],
    ['no scheme', 's3cret-value'],
    ['an empty header', ''],
    ['no header', undefined],
  ])('rejects %s', (_label, header) => {
    process.env.CRON_SECRET = 's3cret-value';
    expect(() => assertCronRequest({ headers: { authorization: header } })).toThrow(AuthenticationError);
  });

  it('refuses to run (500, not 401) when the secret is not configured, even if a header is sent', () => {
    delete process.env.CRON_SECRET;
    expect(() => assertCronRequest({ headers: { authorization: 'Bearer undefined' } })).toThrow('CRON_SECRET is not configured');
    expect(() => assertCronRequest({ headers: { authorization: 'Bearer ' } })).toThrow('CRON_SECRET is not configured');
  });
});

describe('todayInAppTimeZone', () => {
  it('uses the Costa Rica calendar day, not the server (UTC) day', () => {
    // 03:00 UTC on 2 Nov is still 21:00 of 1 Nov in Costa Rica (UTC-6)
    expect(todayInAppTimeZone(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01');
    expect(todayInAppTimeZone(new Date('2026-11-02T06:00:00Z'))).toBe('2026-11-02');
  });
});
