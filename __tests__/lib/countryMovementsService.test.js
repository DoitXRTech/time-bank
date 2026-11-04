import { createFakeFirestore } from '../helpers/fakeFirestore';
import { ConflictError, ValidationError } from '../../lib/errors';
import { captureException } from '../../lib/monitoring';
import { createCountryMovements } from '../../lib/services/countryMovementsService';

const mockFake = createFakeFirestore();

jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
jest.mock('../../lib/monitoring', () => ({ captureException: jest.fn() }));

const admin = { id: 'admin-1', role: 'admin' };
const input = { country: 'CR', dates: ['2026-11-02', '2026-11-19'], note: 'Feriados de noviembre' };

const balances = (overrides = {}) => ({ overtime: 0, vacation: 0, holiday: 0, birthday: 0, ...overrides });
const movements = () => [...mockFake.docs.entries()].filter(([path]) => path.startsWith('movements/')).map(([, data]) => data);
const movementsOf = (employeeId) => movements().filter((movement) => movement.employeeId === employeeId);
const balanceOf = (employeeId, type = 'holiday') => mockFake.docs.get(`employees/${employeeId}`).balances[type];

const seed = (id, fields = {}) => mockFake.docs.set(`employees/${id}`, { name: id, active: true, country: 'CR', balances: balances(), ...fields });

beforeEach(() => {
  jest.clearAllMocks();
  mockFake.docs.clear();
  seed('ana');
  seed('luis', { balances: balances({ holiday: 2 }) });
  seed('colombiano', { country: 'CO' });
  seed('sin-pais', { country: undefined });
  seed('antiguo', { active: false });
});

describe('createCountryMovements', () => {
  it('registers every date for every active person of the country, and only them', async () => {
    const result = await createCountryMovements(admin, input);

    expect(result).toMatchObject({ people: 2, created: 4, skipped: 0, failedEmployeeIds: [] });
    expect(movementsOf('ana').map((movement) => movement.date).sort()).toEqual(['2026-11-02', '2026-11-19']);
    expect(movementsOf('luis')).toHaveLength(2);
    ['colombiano', 'sin-pais', 'antiguo'].forEach((id) => expect(movementsOf(id)).toHaveLength(0));
  });

  it('moves each balance by the amount times the number of dates', async () => {
    await createCountryMovements(admin, input);

    expect(balanceOf('ana')).toBe(2);
    expect(balanceOf('luis')).toBe(4);
    expect(balanceOf('colombiano')).toBe(0);
    expect(balanceOf('antiguo')).toBe(0);
  });

  it('writes normal movements that say where they came from and carry the note, the country and a shared batch', async () => {
    const { batchId } = await createCountryMovements(admin, input);

    movements().forEach((movement) => {
      expect(movement).toMatchObject({
        type: 'holiday',
        amount: 1,
        note: 'Feriados de noviembre',
        source: 'country',
        country: 'CR',
        batchId,
        createdBy: 'admin-1',
        voidedAt: null,
      });
    });
    expect(batchId).toBeTruthy();
  });

  it('is always one day of "Feriados por canjear" per date, whatever a client sends', async () => {
    await createCountryMovements(admin, { ...input, type: 'vacation', amount: -5, dates: ['2026-12-24'] });

    expect(balanceOf('ana', 'holiday')).toBe(1);
    expect(balanceOf('ana', 'vacation')).toBe(0);
    expect(movementsOf('ana')[0]).toMatchObject({ type: 'holiday', amount: 1 });
  });

  it('can be run again without crediting anything twice, and reports what it skipped', async () => {
    await createCountryMovements(admin, input);

    const again = await createCountryMovements(admin, input);

    expect(again).toMatchObject({ people: 0, created: 0, skipped: 4 });
    expect(movements()).toHaveLength(4);
    expect(balanceOf('ana')).toBe(2);
  });

  it('only registers the days that are missing when a new date is added to the same batch', async () => {
    await createCountryMovements(admin, input);

    const result = await createCountryMovements(admin, { ...input, dates: ['2026-11-19', '2026-12-08'] });

    expect(result).toMatchObject({ people: 2, created: 2, skipped: 2 });
    expect(balanceOf('ana')).toBe(3);
  });

  it('registers again a day whose earlier movement was voided', async () => {
    await createCountryMovements(admin, { ...input, dates: ['2026-11-02'] });
    mockFake.docs.forEach((data, path) => {
      if (path.startsWith('movements/') && data.employeeId === 'ana') mockFake.docs.set(path, { ...data, voidedAt: 'VOIDED' });
    });

    const result = await createCountryMovements(admin, { ...input, dates: ['2026-11-02'] });

    // Only Ana's was voided: Luis already has his, so he is skipped
    expect(result).toMatchObject({ people: 1, created: 1, skipped: 1 });
    expect(movementsOf('ana').filter((movement) => !movement.voidedAt)).toHaveLength(1);
    expect(movementsOf('luis')).toHaveLength(1);
  });

  it('does not take another type or another country on the same day for an earlier registration', async () => {
    mockFake.docs.set('movements/other-type', { employeeId: 'ana', type: 'birthday', date: '2026-11-02', source: 'country', country: 'CR', voidedAt: null });
    mockFake.docs.set('movements/other-country', { employeeId: 'luis', type: 'holiday', date: '2026-11-02', source: 'country', country: 'CO', voidedAt: null });

    const result = await createCountryMovements(admin, { ...input, dates: ['2026-11-02'] });

    expect(result).toMatchObject({ created: 2, skipped: 0 });
  });

  it('refuses a country with nobody active in it, and writes nothing', async () => {
    await expect(createCountryMovements(admin, { ...input, country: 'AR' })).rejects.toBeInstanceOf(ConflictError);
    await expect(createCountryMovements(admin, { ...input, country: 'AR' })).rejects.toMatchObject({ metadata: { reason: 'NO_EMPLOYEES_IN_COUNTRY' } });
    expect(movements()).toHaveLength(0);
  });

  it('rejects invalid input before touching anything', async () => {
    await expect(createCountryMovements(admin, { ...input, note: ' ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCountryMovements(admin, { ...input, country: 'MX' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCountryMovements(admin, { ...input, dates: [] })).rejects.toBeInstanceOf(ValidationError);
    expect(movements()).toHaveLength(0);
    expect(balanceOf('ana')).toBe(0);
  });

  it('keeps going when one person fails, reports them, and a rerun finishes the job', async () => {
    const realTransaction = mockFake.db.runTransaction;
    mockFake.db.runTransaction = jest.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(realTransaction);

    try {
      const result = await createCountryMovements(admin, input);

      expect(result.failedEmployeeIds).toHaveLength(1);
      expect(result).toMatchObject({ people: 1, created: 2 });
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ job: 'country-movements' }));
    } finally {
      mockFake.db.runTransaction = realTransaction;
    }

    const rerun = await createCountryMovements(admin, input);
    expect(rerun).toMatchObject({ people: 1, created: 2, skipped: 2, failedEmployeeIds: [] });
    expect(movements()).toHaveLength(4);
  });
});
