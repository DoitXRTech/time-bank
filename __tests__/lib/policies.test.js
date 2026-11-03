import { AuthorizationError } from '../../lib/errors';
import { assertAdmin, assertCanViewEmployee, canViewEmployee } from '../../lib/policies';

const admin = { id: 'a1', role: 'admin' };
const member = { id: 'm1', role: 'member' };

describe('canViewEmployee', () => {
  it('lets admins see everyone', () => {
    expect(canViewEmployee(admin, 'm1')).toBe(true);
    expect(canViewEmployee(admin, 'someone-else')).toBe(true);
  });

  it('lets members see only themselves', () => {
    expect(canViewEmployee(member, 'm1')).toBe(true);
    expect(canViewEmployee(member, 'm2')).toBe(false);
  });
});

describe('assertCanViewEmployee', () => {
  it('throws a 403 when a member asks for someone else', () => {
    expect(() => assertCanViewEmployee(member, 'm2')).toThrow(AuthorizationError);
  });

  it('passes for the member themself', () => {
    expect(() => assertCanViewEmployee(member, 'm1')).not.toThrow();
  });
});

describe('assertAdmin', () => {
  it('rejects members and accepts admins', () => {
    expect(() => assertAdmin(member)).toThrow(AuthorizationError);
    expect(() => assertAdmin(admin)).not.toThrow();
  });
});
