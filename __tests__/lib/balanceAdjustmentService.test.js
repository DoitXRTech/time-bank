import { createFakeFirestore } from '../helpers/fakeFirestore';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { adjustBalances } from '../../lib/services/balanceAdjustmentService';

const mockFake = createFakeFirestore();

jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
jest.mock('../../lib/appDate', () => ({ todayInAppTimeZone: () => '2026-11-04' }));

const admin = { id: 'admin-1', role: 'admin' };
const stored = (path) => mockFake.docs.get(path);
const movements = () => [...mockFake.docs.entries()].filter(([path]) => path.startsWith('movements/')).map(([, data]) => data);

beforeEach(() => {
  mockFake.docs.clear();
  mockFake.docs.set('employees/e1', { name: 'Kevin', active: true, role: 'member', emails: ['k@x.com'], balances: { overtime: 132, vacation: 16, holiday: 1, birthday: 0 } });
});

describe('adjustBalances', () => {
  it('sets the balances to the typed values, with one adjustment movement per balance that differs', async () => {
    await adjustBalances(admin, 'e1', { balances: { overtime: '74', vacation: '16', holiday: '0', birthday: '0' }, note: 'El Excel sumó dos veces 2025' });

    expect(stored('employees/e1').balances).toEqual({ overtime: 74, vacation: 16, holiday: 0, birthday: 0 });
    const written = movements();
    expect(written).toHaveLength(2);
    expect(written).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeId: 'e1', type: 'overtime', amount: -58, date: '2026-11-04', note: 'El Excel sumó dos veces 2025', source: 'adjustment', createdBy: 'admin-1', voidedAt: null }),
        expect.objectContaining({ employeeId: 'e1', type: 'holiday', amount: -1, source: 'adjustment' }),
      ]),
    );
  });

  it('returns the employee with the new balances', async () => {
    const employee = await adjustBalances(admin, 'e1', { balances: { birthday: 1 }, note: 'Cumpleaños pendiente' });

    expect(employee).toMatchObject({ id: 'e1', balances: { overtime: 132, vacation: 16, holiday: 1, birthday: 1 } });
  });

  it('keeps the balance equal to the sum of the movements it adds', async () => {
    await adjustBalances(admin, 'e1', { balances: { overtime: 140.25, vacation: 10 }, note: 'Reinicio' });

    const delta = (type) => movements().filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amount, 0);
    expect(stored('employees/e1').balances.overtime).toBe(132 + delta('overtime'));
    expect(stored('employees/e1').balances.vacation).toBe(16 + delta('vacation'));
  });

  it('computes the difference against what is stored now, so the result is exactly what was typed', async () => {
    // The screen showed 132 h, but an approved request made it 136 h in the meantime
    mockFake.docs.set('employees/e1', { name: 'Kevin', active: true, balances: { overtime: 136, vacation: 16, holiday: 1, birthday: 0 } });

    await adjustBalances(admin, 'e1', { balances: { overtime: '100' }, note: 'Reinicio' });

    expect(stored('employees/e1').balances.overtime).toBe(100);
    expect(movements()[0].amount).toBe(-36);
  });

  it('does not stack on a repeated send: the second finds nothing to change and writes nothing more', async () => {
    const input = { balances: { overtime: '100' }, note: 'Reinicio' };
    await adjustBalances(admin, 'e1', input);

    await expect(adjustBalances(admin, 'e1', input)).rejects.toMatchObject({ metadata: { reason: 'NO_CHANGES' } });
    expect(movements()).toHaveLength(1);
  });

  it('handles an employee whose balances were never written', async () => {
    mockFake.docs.set('employees/e1', { name: 'Kevin', active: true });

    await adjustBalances(admin, 'e1', { balances: { vacation: 3 }, note: 'Saldo inicial' });

    expect(stored('employees/e1').balances.vacation).toBe(3);
  });

  it('requires a note and writes nothing without it', async () => {
    await expect(adjustBalances(admin, 'e1', { balances: { overtime: 1 }, note: ' ' })).rejects.toBeInstanceOf(ValidationError);

    expect(movements()).toHaveLength(0);
    expect(stored('employees/e1').balances.overtime).toBe(132);
  });

  it('refuses an inactive or unknown employee', async () => {
    mockFake.docs.set('employees/e2', { name: 'Luis', active: false, balances: {} });

    await expect(adjustBalances(admin, 'e2', { balances: { overtime: 1 }, note: 'x' })).rejects.toBeInstanceOf(ConflictError);
    await expect(adjustBalances(admin, 'ghost', { balances: { overtime: 1 }, note: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(movements()).toHaveLength(0);
  });
});
