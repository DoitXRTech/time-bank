import { getInitialAdminEmails } from '../../lib/config';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getInitialAdminEmails', () => {
  it('parses, trims and lowercases the list', () => {
    process.env.INITIAL_ADMIN_EMAILS = ' Kevin@x.com ,ana@x.com,';
    expect(getInitialAdminEmails()).toEqual(['kevin@x.com', 'ana@x.com']);
  });

  it('returns an empty list when unset', () => {
    delete process.env.INITIAL_ADMIN_EMAILS;
    expect(getInitialAdminEmails()).toEqual([]);
  });
});
