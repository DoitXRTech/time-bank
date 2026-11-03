import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { createMovement, updateMovement, voidMovement } from '../../lib/services/movementsService';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    increment: (amount) => ({ increment: amount }),
    arrayUnion: (entry) => ({ arrayUnion: entry }),
  },
  Timestamp: { now: () => 'NOW' },
}));

const mockStore = {};
const mockWrites = [];

function snapshot(id, data) {
  return { id, exists: data !== undefined, data: () => data };
}

function ref(collection, id) {
  return { collection, id, get: async () => snapshot(id, mockStore[`${collection}/${id}`]) };
}

jest.mock('../../lib/collections', () => ({
  employeesCollection: () => ({ doc: (id) => ref('employees', id) }),
  movementsCollection: () => ({ doc: (id = 'new-movement') => ref('movements', id) }),
}));

jest.mock('../../lib/firebase-admin', () => ({
  getAdminFirestore: () => ({
    runTransaction: async (callback) => {
      const transaction = {
        get: async (target) => target.get(),
        create: (target, data) => mockWrites.push({ op: 'create', path: `${target.collection}/${target.id}`, data }),
        update: (target, data) => mockWrites.push({ op: 'update', path: `${target.collection}/${target.id}`, data }),
      };
      return callback(transaction);
    },
  }),
}));

const admin = { id: 'admin-1', role: 'admin' };
const validInput = { employeeId: 'e1', type: 'overtime', amount: 3, date: '2026-08-10', note: 'Campaign close' };

beforeEach(() => {
  mockWrites.length = 0;
  Object.keys(mockStore).forEach((key) => delete mockStore[key]);
  mockStore['employees/e1'] = { name: 'Ana', active: true };
});

describe('createMovement', () => {
  it('creates the movement and increments the matching balance in the same transaction', async () => {
    mockStore['movements/new-movement'] = { ...validInput, createdBy: admin.id };

    await createMovement(admin, validInput);

    expect(mockWrites).toEqual([
      {
        op: 'create',
        path: 'movements/new-movement',
        data: expect.objectContaining({ ...validInput, createdBy: 'admin-1', voidedAt: null }),
      },
      {
        op: 'update',
        path: 'employees/e1',
        data: expect.objectContaining({ 'balances.overtime': { increment: 3 } }),
      },
    ]);
  });

  it('decrements the balance for negative amounts', async () => {
    mockStore['movements/new-movement'] = {};
    await createMovement(admin, { ...validInput, type: 'vacation', amount: -1.25 });
    expect(mockWrites[1].data['balances.vacation']).toEqual({ increment: -1.25 });
  });

  it('rejects invalid input before touching the database', async () => {
    await expect(createMovement(admin, { ...validInput, amount: 0.3 })).rejects.toBeInstanceOf(ValidationError);
    expect(mockWrites).toHaveLength(0);
  });

  it('rejects an unknown employee', async () => {
    await expect(createMovement(admin, { ...validInput, employeeId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockWrites).toHaveLength(0);
  });

  it('rejects an inactive employee', async () => {
    mockStore['employees/e1'] = { name: 'Ana', active: false };
    await expect(createMovement(admin, validInput)).rejects.toMatchObject({ metadata: { reason: 'EMPLOYEE_INACTIVE' } });
    expect(mockWrites).toHaveLength(0);
  });
});

describe('updateMovement', () => {
  const stored = { employeeId: 'e1', type: 'overtime', amount: 6, date: '2026-02-19', note: 'Expo', voidedAt: null };

  beforeEach(() => {
    mockStore['employees/e2'] = { name: 'Luis', active: true };
    mockStore['movements/m1'] = { ...stored };
  });

  const writeTo = (path) => mockWrites.find((write) => write.path === path)?.data;

  it('changes the amount and moves the balance by the difference, keeping what was there before', async () => {
    await updateMovement(admin, 'm1', { amount: 4 });

    expect(writeTo('movements/m1')).toMatchObject({
      amount: 4,
      editedBy: 'admin-1',
      editHistory: { arrayUnion: { at: 'NOW', by: 'admin-1', changes: { amount: { from: 6, to: 4 } } } },
    });
    // -6 (old) + 4 (new) = -2 on the same balance, in one update
    expect(writeTo('employees/e1')).toMatchObject({ 'balances.overtime': { increment: -2 } });
    expect(mockWrites.filter((write) => write.path.startsWith('employees/'))).toHaveLength(1);
  });

  it('does not touch any balance when only the note or date changes', async () => {
    await updateMovement(admin, 'm1', { note: 'Expo WM', date: '2026-02-20' });

    expect(writeTo('movements/m1').editHistory.arrayUnion.changes).toEqual({
      note: { from: 'Expo', to: 'Expo WM' },
      date: { from: '2026-02-19', to: '2026-02-20' },
    });
    expect(mockWrites.some((write) => write.path.startsWith('employees/'))).toBe(false);
  });

  it('moves a movement to another person: takes it out of one balance and puts it into the other', async () => {
    await updateMovement(admin, 'm1', { employeeId: 'e2' });

    expect(writeTo('employees/e1')).toMatchObject({ 'balances.overtime': { increment: -6 } });
    expect(writeTo('employees/e2')).toMatchObject({ 'balances.overtime': { increment: 6 } });
  });

  it('moves the amount between balances when the type changes', async () => {
    await updateMovement(admin, 'm1', { type: 'holiday', amount: 1 });

    expect(writeTo('employees/e1')).toMatchObject({
      'balances.overtime': { increment: -6 },
      'balances.holiday': { increment: 1 },
    });
  });

  it('writes nothing when the values are the same as before', async () => {
    await updateMovement(admin, 'm1', { amount: 6, note: 'Expo' });
    expect(mockWrites).toHaveLength(0);
  });

  it('refuses to edit a voided movement', async () => {
    mockStore['movements/m1'] = { ...stored, voidedAt: 'already' };
    await expect(updateMovement(admin, 'm1', { amount: 1 })).rejects.toMatchObject({ metadata: { reason: 'MOVEMENT_VOIDED' } });
    expect(mockWrites).toHaveLength(0);
  });

  it('refuses to move a movement to an inactive or unknown employee', async () => {
    mockStore['employees/e2'] = { name: 'Luis', active: false };
    await expect(updateMovement(admin, 'm1', { employeeId: 'e2' })).rejects.toMatchObject({ metadata: { reason: 'EMPLOYEE_INACTIVE' } });
    await expect(updateMovement(admin, 'm1', { employeeId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockWrites).toHaveLength(0);
  });

  it('validates the fields like a new movement and rejects an empty patch', async () => {
    await expect(updateMovement(admin, 'm1', { amount: 0.3 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateMovement(admin, 'm1', { date: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateMovement(admin, 'm1', {})).rejects.toMatchObject({ metadata: { reason: 'EMPTY_PATCH' } });
  });

  it('rejects an unknown movement', async () => {
    await expect(updateMovement(admin, 'ghost', { amount: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('voidMovement', () => {
  beforeEach(() => {
    mockStore['movements/m1'] = { employeeId: 'e1', type: 'overtime', amount: 6, voidedAt: null };
  });

  it('marks the movement as voided with who and why, and reverses the balance', async () => {
    await voidMovement(admin, 'm1', ' Typo in the amount ');

    expect(mockWrites).toEqual([
      {
        op: 'update',
        path: 'movements/m1',
        data: { voidedAt: 'SERVER_TIMESTAMP', voidedBy: 'admin-1', voidReason: 'Typo in the amount' },
      },
      {
        op: 'update',
        path: 'employees/e1',
        data: expect.objectContaining({ 'balances.overtime': { increment: -6 } }),
      },
    ]);
  });

  it('reverses negative movements by adding them back', async () => {
    mockStore['movements/m1'] = { employeeId: 'e1', type: 'vacation', amount: -2, voidedAt: null };
    await voidMovement(admin, 'm1', 'Wrong person');
    expect(mockWrites[1].data['balances.vacation']).toEqual({ increment: 2 });
  });

  it('requires a reason', async () => {
    await expect(voidMovement(admin, 'm1', '  ')).rejects.toBeInstanceOf(ValidationError);
    expect(mockWrites).toHaveLength(0);
  });

  it('refuses to void twice (would reverse the balance twice)', async () => {
    mockStore['movements/m1'] = { employeeId: 'e1', type: 'overtime', amount: 6, voidedAt: 'already' };
    await expect(voidMovement(admin, 'm1', 'again')).rejects.toBeInstanceOf(ConflictError);
    expect(mockWrites).toHaveLength(0);
  });

  it('rejects an unknown movement', async () => {
    await expect(voidMovement(admin, 'ghost', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});
