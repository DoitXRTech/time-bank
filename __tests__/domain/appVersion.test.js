import { BUILD_ID_HEADER, isNewVersionAvailable } from '@/domain/appVersion';

describe('isNewVersionAvailable', () => {
  it('is true only when the latest deploy is a different one than the code the tab runs', () => {
    expect(isNewVersionAvailable('abc123', 'def456')).toBe(true);
    expect(isNewVersionAvailable('abc123', 'abc123')).toBe(false);
  });

  it('never reports a mismatch for a local build, or when either id is unknown', () => {
    expect(isNewVersionAvailable('development', 'abc123')).toBe(false);
    expect(isNewVersionAvailable('abc123', 'development')).toBe(false);
    expect(isNewVersionAvailable('development', 'development')).toBe(false);
    expect(isNewVersionAvailable(undefined, 'abc123')).toBe(false);
    expect(isNewVersionAvailable('abc123', undefined)).toBe(false);
    expect(isNewVersionAvailable('abc123', null)).toBe(false);
    expect(isNewVersionAvailable('', 'abc123')).toBe(false);
  });
});

describe('BUILD_ID_HEADER', () => {
  it('is lowercase, the way Node presents incoming headers', () => {
    expect(BUILD_ID_HEADER).toBe('x-app-build');
  });
});
