import { withAuth } from '../../lib/auth-middleware';
import { resolveSignedInEmployee } from '../../lib/services/employeesService';
import { AuthorizationError } from '../../lib/errors';

const mockVerifyIdToken = jest.fn();

jest.mock('../../lib/firebase-admin', () => ({ getAdminAuth: () => ({ verifyIdToken: mockVerifyIdToken }) }));
jest.mock('../../lib/services/employeesService', () => ({ resolveSignedInEmployee: jest.fn() }));
jest.mock('../../lib/monitoring', () => ({ captureException: jest.fn() }));

const admin = { id: 'a1', role: 'admin', name: 'Ana' };
const member = { id: 'm1', role: 'member', name: 'Luis' };

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

const requestWithToken = (token = 'good-token') => ({ headers: { authorization: `Bearer ${token}` }, url: '/api/x', method: 'GET' });

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'Person@Example.com', email_verified: true, name: 'Person' });
  resolveSignedInEmployee.mockResolvedValue(member);
});

describe('withAuth', () => {
  it('lets a signed-in registered person reach the handler, with their employee and a lowercased email', async () => {
    const handler = jest.fn();
    const req = requestWithToken();

    await withAuth(handler)(req, createRes());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ uid: 'uid-1', email: 'person@example.com', employee: member });
    expect(resolveSignedInEmployee).toHaveBeenCalledWith({ uid: 'uid-1', email: 'person@example.com', displayName: 'Person' });
  });

  it.each([
    ['no Authorization header', {}],
    ['a header that is not a bearer token', { authorization: 'Basic abc' }],
  ])('answers 401 with %s and never reaches the handler', async (_label, headers) => {
    const handler = jest.fn();
    const res = createRes();

    await withAuth(handler)({ headers, url: '/api/x' }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers 401 for an invalid or expired token', async () => {
    const handler = jest.fn();
    const res = createRes();
    mockVerifyIdToken.mockRejectedValue(Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }));

    await withAuth(handler)(requestWithToken(), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers 403 when the Google email is not verified', async () => {
    const handler = jest.fn();
    const res = createRes();
    mockVerifyIdToken.mockResolvedValue({ uid: 'u', email: 'a@b.com', email_verified: false });

    await withAuth(handler)(requestWithToken(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: 'EMAIL_NOT_VERIFIED' } }));
    expect(handler).not.toHaveBeenCalled();
    expect(resolveSignedInEmployee).not.toHaveBeenCalled();
  });

  it('answers 403 when the email is not registered on an employee (the whitelist)', async () => {
    const handler = jest.fn();
    const res = createRes();
    resolveSignedInEmployee.mockRejectedValue(new AuthorizationError('Account is not registered', { reason: 'NOT_REGISTERED' }));

    await withAuth(handler)(requestWithToken(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: 'NOT_REGISTERED' } }));
    expect(handler).not.toHaveBeenCalled();
  });

  describe('with requiredRole: admin', () => {
    it('lets an admin through', async () => {
      resolveSignedInEmployee.mockResolvedValue(admin);
      const handler = jest.fn();

      await withAuth(handler, { requiredRole: 'admin' })(requestWithToken(), createRes());

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('answers 403 to a collaborator and never reaches the handler', async () => {
      const handler = jest.fn();
      const res = createRes();

      await withAuth(handler, { requiredRole: 'admin' })(requestWithToken(), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it('does not leak the message of an unexpected error', async () => {
    const res = createRes();
    resolveSignedInEmployee.mockRejectedValue(new Error('firestore exploded: secret detail'));

    await withAuth(jest.fn())(requestWithToken(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });
});
