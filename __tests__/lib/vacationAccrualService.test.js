import { accrueAllEmployees, accrueEmployeeVacation } from '../../lib/services/vacationAccrualService';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    increment: (amount) => ({ increment: amount }),
  },
}));

// In-memory Firestore: employees and movements by path; transactions apply their writes at once
const mockDocs = new Map();
const mockTransactionCalls = { count: 0 };

function makeRef(collection, id) {
  const path = `${collection}/${id}`;
  return { path, id, get: async () => ({ id, exists: mockDocs.has(path), data: () => mockDocs.get(path) }) };
}

function applyUpdate(path, data) {
  const current = { ...mockDocs.get(path) };
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'balances.vacation') {
      current.balances = { ...current.balances, vacation: (current.balances?.vacation ?? 0) + value.increment };
    } else current[key] = value;
  });
  mockDocs.set(path, current);
}

jest.mock('../../lib/collections', () => ({
  employeesCollection: () => ({
    doc: (id) => makeRef('employees', id),
    where: (field, op, value) => ({
      get: async () => {
        const docs = [...mockDocs.entries()]
          .filter(([path, data]) => path.startsWith('employees/') && data[field] === value)
          .map(([path, data]) => ({ id: path.split('/')[1], data: () => data }));
        return { docs };
      },
    }),
  }),
  movementsCollection: () => ({ doc: (id) => makeRef('movements', id) }),
}));

jest.mock('../../lib/firebase-admin', () => ({
  getAdminFirestore: () => ({
    runTransaction: async (callback) => {
      mockTransactionCalls.count += 1;
      const writes = [];
      const result = await callback({
        get: async (ref) => ref.get(),
        create: (ref, data) => {
          if (mockDocs.has(ref.path)) throw new Error(`already exists: ${ref.path}`);
          writes.push(() => mockDocs.set(ref.path, data));
        },
        update: (ref, data) => writes.push(() => applyUpdate(ref.path, data)),
      });
      writes.forEach((write) => write());
      return result;
    },
  }),
}));

jest.mock('../../lib/monitoring', () => ({ captureException: jest.fn() }));

const seedEmployee = (id, fields = {}) =>
  mockDocs.set(`employees/${id}`, {
    name: id,
    active: true,
    employmentType: 'payroll',
    balances: { vacation: 0 },
    vacationStartDate: '2026-06-15',
    vacationAccruedMonths: 0,
    ...fields,
  });
const movementsOf = (employeeId) => [...mockDocs.entries()].filter(([path, data]) => path.startsWith('movements/') && data.employeeId === employeeId);

beforeEach(() => {
  mockDocs.clear();
  mockTransactionCalls.count = 0;
});

describe('accrueEmployeeVacation', () => {
  it('credits one day for each complete month, dated when it was earned, and moves the balance and the counter', async () => {
    seedEmployee('ana');

    const credited = await accrueEmployeeVacation('ana', '2026-11-02');

    expect(credited).toBe(4);
    expect(movementsOf('ana').map(([, data]) => [data.date, data.amount, data.type, data.source, data.accrualMonth])).toEqual([
      ['2026-07-15', 1, 'vacation', 'accrual', 1],
      ['2026-08-15', 1, 'vacation', 'accrual', 2],
      ['2026-09-15', 1, 'vacation', 'accrual', 3],
      ['2026-10-15', 1, 'vacation', 'accrual', 4],
    ]);
    expect(mockDocs.get('employees/ana')).toMatchObject({ balances: { vacation: 4 }, vacationAccruedMonths: 4 });
  });

  it('is idempotent: a second run the same day credits nothing', async () => {
    seedEmployee('ana');
    await accrueEmployeeVacation('ana', '2026-11-02');

    expect(await accrueEmployeeVacation('ana', '2026-11-02')).toBe(0);
    expect(mockDocs.get('employees/ana').balances.vacation).toBe(4);
    expect(movementsOf('ana')).toHaveLength(4);
  });

  it('credits only the new month when it is run again after the next cumplemes', async () => {
    seedEmployee('ana');
    await accrueEmployeeVacation('ana', '2026-11-02');

    expect(await accrueEmployeeVacation('ana', '2026-11-15')).toBe(1);
    expect(mockDocs.get('employees/ana')).toMatchObject({ balances: { vacation: 5 }, vacationAccruedMonths: 5 });
  });

  it('catches up every missed month after days without running', async () => {
    seedEmployee('ana', { vacationAccruedMonths: 1, balances: { vacation: 1 } });
    expect(await accrueEmployeeVacation('ana', '2026-12-20')).toBe(5);
    expect(mockDocs.get('employees/ana').vacationAccruedMonths).toBe(6);
  });

  it('does not credit again a month that an admin voided (the counter already passed it)', async () => {
    seedEmployee('ana');
    await accrueEmployeeVacation('ana', '2026-11-02');
    mockDocs.set('movements/accrual-ana-2', { ...mockDocs.get('movements/accrual-ana-2'), voidedAt: 'x' });

    expect(await accrueEmployeeVacation('ana', '2026-11-02')).toBe(0);
  });

  it('does nothing for an employee without a start date, an inactive one or an unknown one', async () => {
    seedEmployee('no-date', { vacationStartDate: null });
    seedEmployee('gone', { active: false });

    expect(await accrueEmployeeVacation('no-date', '2026-11-02')).toBe(0);
    expect(await accrueEmployeeVacation('gone', '2026-11-02')).toBe(0);
    expect(await accrueEmployeeVacation('ghost', '2026-11-02')).toBe(0);
    expect(movementsOf('no-date')).toHaveLength(0);
  });

  it('credits professional services like payroll, but never an intern or someone with no contract type, even with a start date', async () => {
    seedEmployee('freelancer', { employmentType: 'professional-services' });
    seedEmployee('intern', { employmentType: 'internship' });
    seedEmployee('undefined-type', { employmentType: undefined });

    expect(await accrueEmployeeVacation('freelancer', '2026-11-02')).toBe(4);
    expect(await accrueEmployeeVacation('intern', '2026-11-02')).toBe(0);
    expect(await accrueEmployeeVacation('undefined-type', '2026-11-02')).toBe(0);
    expect(movementsOf('intern')).toHaveLength(0);
    expect(mockDocs.get('employees/intern').balances.vacation).toBe(0);
  });

  it('splits a long catch-up into several transactions instead of one huge write', async () => {
    seedEmployee('veteran', { vacationStartDate: '2005-01-01' }); // 250+ months

    const credited = await accrueEmployeeVacation('veteran', '2026-11-02');

    expect(credited).toBe(262);
    expect(movementsOf('veteran')).toHaveLength(262);
    expect(mockTransactionCalls.count).toBeGreaterThan(2);
  });
});

describe('accrueAllEmployees', () => {
  it('tops up every active employee with a start date and reports a summary', async () => {
    seedEmployee('ana');
    seedEmployee('luis', { vacationStartDate: '2026-08-26' });
    seedEmployee('intern', { vacationStartDate: null });
    seedEmployee('trainee', { employmentType: 'internship' });
    seedEmployee('gone', { active: false });

    const summary = await accrueAllEmployees('2026-11-02');

    expect(summary).toEqual({ today: '2026-11-02', employeesChecked: 2, monthsCredited: 6, failedEmployeeIds: [] });
  });

  it('keeps going when one employee fails and lists the failure', async () => {
    seedEmployee('ana');
    seedEmployee('luis', { vacationStartDate: '2026-08-26' });
    // A leftover movement with the id of luis\'s first month makes his transaction fail
    mockDocs.set('movements/accrual-luis-1', { employeeId: 'luis' });

    const summary = await accrueAllEmployees('2026-11-02');

    expect(summary.failedEmployeeIds).toEqual(['luis']);
    expect(summary.monthsCredited).toBe(4);
  });
});
