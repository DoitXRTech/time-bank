import { AuthorizationError, ConflictError, NotFoundError } from '../../lib/errors';
import { accrueEmployeeVacation } from '../../lib/services/vacationAccrualService';
import {
  createEmployee,
  resolveSignedInEmployee,
  updateEmployee,
} from '../../lib/services/employeesService';

jest.mock('../../lib/services/vacationAccrualService', () => ({ accrueEmployeeVacation: jest.fn().mockResolvedValue(0) }));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    delete: () => Symbol.for('delete'),
  },
}));

// Minimal in-memory Firestore: collection of docs, `where` with == and array-contains, limit,
// and a transaction that applies its writes immediately.
const mockStore = new Map();
let mockAutoId = 0;

function makeDoc(id) {
  const ref = {
    id,
    get: async () => makeSnapshot(id),
    create: async (data) => {
      if (mockStore.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      mockStore.set(id, { ...data });
    },
    update: async (data) => applyUpdate(id, data),
  };
  return ref;
}

function makeSnapshot(id) {
  const data = mockStore.get(id);
  return { id, exists: data !== undefined, data: () => data, ref: makeDoc(id) };
}

function applyUpdate(id, data) {
  const current = mockStore.get(id);
  const next = { ...current };
  Object.entries(data).forEach(([key, value]) => {
    if (value === Symbol.for('delete')) delete next[key];
    else next[key] = value;
  });
  mockStore.set(id, next);
}

function makeQuery(filters, max) {
  return {
    filters,
    where: (field, op, value) => makeQuery([...filters, { field, op, value }], max),
    limit: (n) => makeQuery(filters, n),
    orderBy: () => makeQuery(filters, max),
    get: async () => runQuery({ filters, max }),
  };
}

function runQuery({ filters, max }) {
  const matches = [...mockStore.entries()].filter(([, data]) =>
    filters.every(({ field, op, value }) =>
      op === '==' ? data[field] === value : Array.isArray(data[field]) && data[field].includes(value),
    ),
  );
  const docs = matches.slice(0, max ?? matches.length).map(([id]) => makeSnapshot(id));
  return { empty: docs.length === 0, docs };
}

jest.mock('../../lib/collections', () => ({
  employeesCollection: () => ({
    doc: (id = `auto-${++mockAutoId}`) => makeDoc(id),
    where: (field, op, value) => makeQuery([{ field, op, value }]),
    orderBy: () => makeQuery([]),
  }),
}));

jest.mock('../../lib/firebase-admin', () => ({
  getAdminFirestore: () => ({
    runTransaction: async (callback) =>
      callback({
        get: async (target) => target.get(),
        create: (ref, data) => {
          if (mockStore.has(ref.id)) throw new Error('exists');
          mockStore.set(ref.id, { ...data });
        },
        update: (ref, data) => applyUpdate(ref.id, data),
      }),
  }),
}));

const originalEnv = { ...process.env };

function seedEmployee(id, overrides = {}) {
  mockStore.set(id, {
    name: id,
    jobTitle: '',
    emails: [`${id}@effekktive.com`],
    role: 'member',
    active: true,
    balances: { overtime: 0, vacation: 0, holiday: 0, birthday: 0 },
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockAutoId = 0;
  process.env = { ...originalEnv, INITIAL_ADMIN_EMAILS: 'boss@gmail.com' };
});
afterAll(() => {
  process.env = originalEnv;
});

describe('resolveSignedInEmployee (the whitelist)', () => {
  const identity = (email) => ({ uid: 'uid-1', email, displayName: 'Someone' });

  it('lets in any email registered on an active employee, personal or company, any domain', async () => {
    seedEmployee('ana', { emails: ['ana@effekktive.com', 'ana.personal@gmail.com'] });

    await expect(resolveSignedInEmployee(identity('ana@effekktive.com'))).resolves.toMatchObject({ id: 'ana' });
    await expect(resolveSignedInEmployee(identity('ana.personal@gmail.com'))).resolves.toMatchObject({ id: 'ana' });
  });

  it('rejects an email that is not registered, even from a company domain', async () => {
    seedEmployee('ana');
    await expect(resolveSignedInEmployee(identity('stranger@effekktive.com'))).rejects.toMatchObject({
      metadata: { reason: 'NOT_REGISTERED' },
    });
    await expect(resolveSignedInEmployee(identity('stranger@gmail.com'))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects a deactivated employee on all of their emails', async () => {
    seedEmployee('ana', { active: false, emails: ['ana@effekktive.com', 'ana@gmail.com'] });
    await expect(resolveSignedInEmployee(identity('ana@gmail.com'))).rejects.toMatchObject({
      metadata: { reason: 'ACCOUNT_DEACTIVATED' },
    });
  });

  it('bootstraps an admin only for emails in INITIAL_ADMIN_EMAILS', async () => {
    const admin = await resolveSignedInEmployee(identity('boss@gmail.com'));
    expect(admin).toMatchObject({ role: 'admin', emails: ['boss@gmail.com'] });
    await expect(resolveSignedInEmployee(identity('other@gmail.com'))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('does not bootstrap a second admin record when the admin signs in again', async () => {
    await resolveSignedInEmployee(identity('boss@gmail.com'));
    await resolveSignedInEmployee(identity('boss@gmail.com'));
    expect(mockStore.size).toBe(1);
  });

  it('migrates a pre-multi-email document on sign-in', async () => {
    mockStore.set('legacy', { name: 'Kevin', email: 'kevin@x.com', role: 'admin', active: true, balances: {} });

    const employee = await resolveSignedInEmployee(identity('kevin@x.com'));

    expect(employee.emails).toEqual(['kevin@x.com']);
    expect(mockStore.get('legacy')).toMatchObject({ emails: ['kevin@x.com'] });
    expect(mockStore.get('legacy')).not.toHaveProperty('email');
  });

  it('refuses to guess when two employees list the same email', async () => {
    seedEmployee('a', { emails: ['same@x.com'] });
    seedEmployee('b', { emails: ['same@x.com'] });
    await expect(resolveSignedInEmployee(identity('same@x.com'))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('createEmployee', () => {
  const admin = { id: 'admin-1', role: 'admin' };

  it('stores the emails list and starts with zero balances', async () => {
    const employee = await createEmployee(admin, { name: 'Luis', emails: ['Luis@Gmail.com', 'luis@effekktive.com'] });
    expect(employee).toMatchObject({ name: 'Luis', emails: ['luis@gmail.com', 'luis@effekktive.com'], active: true });
    expect(employee.balances).toEqual({ overtime: 0, vacation: 0, holiday: 0, birthday: 0 });
  });

  it('rejects an email that already belongs to another employee', async () => {
    seedEmployee('ana', { emails: ['ana@gmail.com'] });
    await expect(createEmployee(admin, { name: 'Impostor', emails: ['ANA@gmail.com'] })).rejects.toMatchObject({
      metadata: { reason: 'EMAIL_TAKEN' },
    });
  });

  it('also detects an email held by a pre-multi-email document', async () => {
    mockStore.set('legacy', { name: 'Kevin', email: 'kevin@x.com' });
    await expect(createEmployee(admin, { name: 'Other', emails: ['kevin@x.com'] })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('vacation start date', () => {
  const admin = { id: 'admin-1', role: 'admin' };
  const context = { signedInEmail: 'admin@effekktive.com', today: '2026-11-02' };

  beforeEach(() => {
    seedEmployee('admin-1', { role: 'admin', emails: ['admin@effekktive.com'] });
    seedEmployee('ana');
  });

  it('on creation, can credit the months already completed: the counter starts at 0 and the job pays them', async () => {
    const created = await createEmployee(admin, { name: 'Luis', emails: ['luis@x.com'], vacationStartDate: '2025-01-01', creditPastMonths: true }, { today: '2026-11-02' });

    expect(created.vacationStartDate).toBe('2025-01-01');
    expect(mockStore.get(`auto-${mockAutoId}`).vacationAccruedMonths).toBe(0);
    expect(mockStore.get(`auto-${mockAutoId}`)).not.toHaveProperty('creditPastMonths');
    expect(accrueEmployeeVacation).toHaveBeenCalledWith(`auto-${mockAutoId}`, '2026-11-02');
  });

  it('on creation, can start counting from now: past months are considered already in the balance', async () => {
    await createEmployee(admin, { name: 'Luis', emails: ['luis@x.com'], vacationStartDate: '2025-01-01' }, { today: '2026-11-02' });
    expect(mockStore.get(`auto-${mockAutoId}`).vacationAccruedMonths).toBe(22);
  });

  it('without a start date there is no accrual at all', async () => {
    await createEmployee(admin, { name: 'Intern', emails: ['intern@x.com'] }, { today: '2026-11-02' });
    expect(mockStore.get(`auto-${mockAutoId}`)).not.toHaveProperty('vacationAccruedMonths');
    expect(accrueEmployeeVacation).not.toHaveBeenCalled();
  });

  it('setting the first start date with credit starts the counter at 0 and runs the accrual right away', async () => {
    await updateEmployee(admin, 'ana', { vacationStartDate: '2026-06-15', creditPastMonths: true }, context);

    expect(mockStore.get('ana')).toMatchObject({ vacationStartDate: '2026-06-15', vacationAccruedMonths: 0 });
    expect(mockStore.get('ana')).not.toHaveProperty('creditPastMonths');
    expect(accrueEmployeeVacation).toHaveBeenCalledWith('ana', '2026-11-02');
  });

  it('setting the first start date without credit marks the past months as already counted', async () => {
    await updateEmployee(admin, 'ana', { vacationStartDate: '2026-06-15' }, context);
    expect(mockStore.get('ana').vacationAccruedMonths).toBe(4);
  });

  it('correcting an existing start date keeps the counter: the job only tops up, it never takes back', async () => {
    seedEmployee('luis', { vacationStartDate: '2026-06-15', vacationAccruedMonths: 4 });

    await updateEmployee(admin, 'luis', { vacationStartDate: '2026-05-15', creditPastMonths: true }, context);

    expect(mockStore.get('luis')).toMatchObject({ vacationStartDate: '2026-05-15', vacationAccruedMonths: 4 });
    expect(accrueEmployeeVacation).toHaveBeenCalledTimes(1);
  });

  it('saving the same start date again, or other fields, does not run the accrual', async () => {
    seedEmployee('luis', { vacationStartDate: '2026-06-15', vacationAccruedMonths: 4 });

    await updateEmployee(admin, 'luis', { vacationStartDate: '2026-06-15', name: 'Luis P' }, context);

    expect(accrueEmployeeVacation).not.toHaveBeenCalled();
    expect(mockStore.get('luis').vacationAccruedMonths).toBe(4);
  });

  it('clearing the start date stops the accrual', async () => {
    seedEmployee('luis', { vacationStartDate: '2026-06-15', vacationAccruedMonths: 4 });

    await updateEmployee(admin, 'luis', { vacationStartDate: null }, context);

    expect(mockStore.get('luis').vacationStartDate).toBeNull();
    expect(accrueEmployeeVacation).not.toHaveBeenCalled();
  });
});

describe('updateEmployee', () => {
  const admin = { id: 'admin-1', role: 'admin' };
  const context = { signedInEmail: 'admin@effekktive.com' };

  beforeEach(() => {
    seedEmployee('admin-1', { role: 'admin', emails: ['admin@effekktive.com', 'admin@gmail.com'] });
    seedEmployee('ana', { emails: ['ana@effekktive.com'] });
  });

  it('adds a second email to an employee', async () => {
    const updated = await updateEmployee(admin, 'ana', { emails: ['ana@effekktive.com', 'ana@gmail.com'] }, context);
    expect(updated.emails).toEqual(['ana@effekktive.com', 'ana@gmail.com']);
  });

  it('rejects an email that another employee already has', async () => {
    await expect(updateEmployee(admin, 'ana', { emails: ['ana@effekktive.com', 'admin@gmail.com'] }, context)).rejects.toMatchObject({
      metadata: { reason: 'EMAIL_TAKEN' },
    });
    expect(mockStore.get('ana').emails).toEqual(['ana@effekktive.com']);
  });

  it('lets an employee keep their own emails in the new list', async () => {
    await expect(updateEmployee(admin, 'ana', { emails: ['ana@effekktive.com'] }, context)).resolves.toBeDefined();
  });

  it('does not let an admin remove the email they are signed in with', async () => {
    await expect(updateEmployee(admin, 'admin-1', { emails: ['admin@gmail.com'] }, context)).rejects.toMatchObject({
      metadata: { reason: 'OWN_EMAIL_REMOVAL' },
    });
  });

  it('lets an admin remove their other email', async () => {
    const updated = await updateEmployee(admin, 'admin-1', { emails: ['admin@effekktive.com'] }, context);
    expect(updated.emails).toEqual(['admin@effekktive.com']);
  });

  it('does not let an admin deactivate or demote themselves', async () => {
    await expect(updateEmployee(admin, 'admin-1', { active: false }, context)).rejects.toMatchObject({
      metadata: { reason: 'SELF_LOCKOUT' },
    });
    await expect(updateEmployee(admin, 'admin-1', { role: 'member' }, context)).rejects.toMatchObject({
      metadata: { reason: 'SELF_LOCKOUT' },
    });
  });

  it('removes the legacy single-email field when the list is rewritten', async () => {
    mockStore.set('legacy', { name: 'Old', email: 'old@x.com', role: 'member', active: true });
    await updateEmployee(admin, 'legacy', { emails: ['old@x.com', 'old@gmail.com'] }, context);
    expect(mockStore.get('legacy')).not.toHaveProperty('email');
  });

  it('rejects an unknown employee', async () => {
    await expect(updateEmployee(admin, 'ghost', { active: false }, context)).rejects.toBeInstanceOf(NotFoundError);
  });
});
