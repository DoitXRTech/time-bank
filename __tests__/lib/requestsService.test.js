import { createFakeFirestore } from '../helpers/fakeFirestore';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  approveRequest,
  cancelRequest,
  createRequest,
  listEmployeeRequests,
  listPendingRequests,
  rejectRequest,
} from '../../lib/services/requestsService';

const mockFake = createFakeFirestore();

jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
jest.mock('../../lib/appDate', () => ({ todayInAppTimeZone: () => '2026-11-03' }));

const admin = { id: 'admin-1', role: 'admin' };
const ana = { id: 'e1', role: 'member' };
const luis = { id: 'e2', role: 'member' };

const stored = (path) => mockFake.docs.get(path);

function seedRequest(id, overrides = {}) {
  mockFake.docs.set(`requests/${id}`, {
    employeeId: 'e1',
    kind: 'overtime',
    status: 'pending',
    amount: 4,
    date: '2026-10-31',
    period: '2026-10',
    note: 'Cierre',
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    movementId: null,
    ...overrides,
  });
}

beforeEach(() => {
  mockFake.docs.clear();
  mockFake.docs.set('employees/e1', { name: 'Ana', active: true, balances: { overtime: 10, vacation: 5 } });
  mockFake.docs.set('employees/e2', { name: 'Luis', active: true, balances: {} });
});

describe('createRequest', () => {
  const overtime = { kind: 'overtime', month: '2026-10', amount: 4, note: 'Cierre' };

  it('files a pending request for the person who is signed in and moves no balance', async () => {
    const request = await createRequest(ana, overtime);

    expect(request).toMatchObject({ employeeId: 'e1', kind: 'overtime', status: 'pending', amount: 4, date: '2026-10-31', period: '2026-10', note: 'Cierre' });
    expect(stored(`requests/${request.id}`)).toMatchObject({ status: 'pending', decidedBy: null, movementId: null });
    expect(stored('employees/e1').balances).toEqual({ overtime: 10, vacation: 5 });
    expect(mockFake.count('movements')).toBe(0);
  });

  it('never files it under someone else, whatever the body says', async () => {
    const request = await createRequest(ana, { ...overtime, employeeId: 'e2', status: 'approved' });

    expect(request.employeeId).toBe('e1');
    expect(request.status).toBe('pending');
  });

  it('rejects invalid input before writing anything', async () => {
    await expect(createRequest(ana, { ...overtime, month: '2026-11' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createRequest(ana, { ...overtime, amount: -1 })).rejects.toBeInstanceOf(ValidationError);
    expect(mockFake.count('requests')).toBe(0);
  });
});

describe('approveRequest', () => {
  it('registers the overtime as a movement, adds the hours and marks the request approved', async () => {
    seedRequest('r1');

    const request = await approveRequest(admin, 'r1');

    expect(request).toMatchObject({ status: 'approved', decidedBy: 'admin-1', movementId: 'request-r1' });
    expect(stored('movements/request-r1')).toMatchObject({
      employeeId: 'e1',
      type: 'overtime',
      amount: 4,
      date: '2026-10-31',
      note: 'Cierre',
      source: 'request',
      requestId: 'r1',
      createdBy: 'admin-1',
      voidedAt: null,
    });
    expect(stored('employees/e1').balances.overtime).toBe(14);
  });

  it('registers a vacation as days taken (negative) and takes them out of the balance', async () => {
    seedRequest('r2', { kind: 'vacation', amount: 3, date: '2026-11-17', period: null });

    await approveRequest(admin, 'r2');

    expect(stored('movements/request-r2')).toMatchObject({ type: 'vacation', amount: -3, date: '2026-11-17' });
    expect(stored('employees/e1').balances.vacation).toBe(2);
  });

  it('cannot be approved twice: the hours are never counted two times', async () => {
    seedRequest('r1');
    await approveRequest(admin, 'r1');

    await expect(approveRequest(admin, 'r1')).rejects.toMatchObject({ metadata: { reason: 'REQUEST_NOT_PENDING' } });
    expect(stored('employees/e1').balances.overtime).toBe(14);
    expect(mockFake.count('movements')).toBe(1);
  });

  it.each(['rejected', 'cancelled'])('refuses a request that was already %s', async (status) => {
    seedRequest('r1', { status });

    await expect(approveRequest(admin, 'r1')).rejects.toBeInstanceOf(ConflictError);
    expect(mockFake.count('movements')).toBe(0);
    expect(stored('employees/e1').balances.overtime).toBe(10);
  });

  it('keeps the request pending when the person is inactive or gone, and writes nothing', async () => {
    mockFake.docs.set('employees/e1', { name: 'Ana', active: false, balances: { overtime: 10 } });
    seedRequest('r1');
    await expect(approveRequest(admin, 'r1')).rejects.toMatchObject({ metadata: { reason: 'EMPLOYEE_INACTIVE' } });

    seedRequest('r3', { employeeId: 'ghost' });
    await expect(approveRequest(admin, 'r3')).rejects.toBeInstanceOf(NotFoundError);

    expect(stored('requests/r1').status).toBe('pending');
    expect(stored('requests/r3').status).toBe('pending');
    expect(mockFake.count('movements')).toBe(0);
  });

  it('rejects an unknown request', async () => {
    await expect(approveRequest(admin, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('rejectRequest', () => {
  it('records who turned it down and why, without touching any balance', async () => {
    seedRequest('r1');

    const request = await rejectRequest(admin, 'r1', '  Ese mes ya se pagó ');

    expect(request).toMatchObject({ status: 'rejected', decidedBy: 'admin-1', decisionNote: 'Ese mes ya se pagó', movementId: null });
    expect(mockFake.count('movements')).toBe(0);
    expect(stored('employees/e1').balances.overtime).toBe(10);
  });

  it('requires a reason, because the collaborator reads it', async () => {
    seedRequest('r1');

    await expect(rejectRequest(admin, 'r1', '  ')).rejects.toBeInstanceOf(ValidationError);
    expect(stored('requests/r1').status).toBe('pending');
  });

  it('cannot undo an approval by rejecting it afterwards', async () => {
    seedRequest('r1');
    await approveRequest(admin, 'r1');

    await expect(rejectRequest(admin, 'r1', 'Me equivoqué')).rejects.toMatchObject({ metadata: { reason: 'REQUEST_NOT_PENDING' } });
    expect(stored('requests/r1').status).toBe('approved');
  });
});

describe('cancelRequest', () => {
  it('lets the owner withdraw a pending request', async () => {
    seedRequest('r1');

    const request = await cancelRequest(ana, 'r1');

    expect(request).toMatchObject({ status: 'cancelled', decidedBy: 'e1' });
    expect(mockFake.count('movements')).toBe(0);
  });

  it("does not let a collaborator cancel somebody else's request", async () => {
    seedRequest('r1');

    await expect(cancelRequest(luis, 'r1')).rejects.toBeInstanceOf(AuthorizationError);
    expect(stored('requests/r1').status).toBe('pending');
  });

  it('cannot withdraw a request that was already approved', async () => {
    seedRequest('r1');
    await approveRequest(admin, 'r1');

    await expect(cancelRequest(ana, 'r1')).rejects.toMatchObject({ metadata: { reason: 'REQUEST_NOT_PENDING' } });
    expect(stored('requests/r1').status).toBe('approved');
  });
});

describe('listing', () => {
  beforeEach(() => {
    seedRequest('r1');
    seedRequest('r2', { status: 'approved' });
    seedRequest('r3', { employeeId: 'e2' });
  });

  it('the inbox only has what is still pending, from everybody', async () => {
    const pending = await listPendingRequests();

    expect(pending.map((request) => request.id).sort()).toEqual(['r1', 'r3']);
  });

  it('one person only gets their own requests, in any status', async () => {
    const own = await listEmployeeRequests('e1');

    expect(own.map((request) => request.id).sort()).toEqual(['r1', 'r2']);
  });
});
