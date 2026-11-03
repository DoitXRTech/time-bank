import { createFakeFirestore } from '../helpers/fakeFirestore';
import { SHEET_TABS_BY_GID, SHEET_URL, WORKBOOK_SHEETS } from '../helpers/sheetFixtures';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { linkImportProfile } from '../../lib/services/importLinkService';
import { stageImport } from '../../lib/services/importStagingService';
import { accrueEmployeeVacation } from '../../lib/services/vacationAccrualService';
import { fetchSheetTab, fetchSheetWorkbook } from '../../lib/sheetsClient';

const mockFake = createFakeFirestore();

jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
jest.mock('../../lib/sheetsClient', () => ({ fetchSheetTab: jest.fn(), fetchSheetWorkbook: jest.fn() }));
jest.mock('../../lib/services/vacationAccrualService', () => ({ accrueEmployeeVacation: jest.fn().mockResolvedValue(0) }));

const admin = { id: 'admin-1', role: 'admin' };
const today = '2026-12-10';

const seedEmployee = (id, fields = {}) =>
  mockFake.docs.set(`employees/${id}`, { name: id, active: true, balances: { overtime: 0, vacation: 0, holiday: 0, birthday: 0 }, ...fields });
const movementsOf = (employeeId) => [...mockFake.docs.entries()].filter(([path, data]) => path.startsWith('movements/') && data.employeeId === employeeId);

beforeEach(async () => {
  mockFake.docs.clear();
  jest.clearAllMocks();
  fetchSheetTab.mockImplementation(async (sheetId, gid) => SHEET_TABS_BY_GID[gid]);
  fetchSheetWorkbook.mockResolvedValue([]);
  await stageImport(admin, SHEET_URL, { openingDate: '2026-11-02' });
  seedEmployee('e1', { name: 'Estefania Rojas Vargas' });
});

describe('linkImportProfile', () => {
  it('turns the staged movements into real movements of the employee, marked as imported', async () => {
    const { movementsCreated, profile } = await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    expect(movementsCreated).toBe(3);
    expect(movementsOf('e1').map(([, data]) => [data.type, data.amount, data.date, data.source, data.importProfile, data.createdBy]).sort()).toEqual([
      ['overtime', 2, '2026-02-11', 'import', 'estefania-rojas', 'admin-1'],
      ['overtime', 4, '2026-02-10', 'import', 'estefania-rojas', 'admin-1'],
      ['vacation', 20, '2026-11-02', 'import', 'estefania-rojas', 'admin-1'],
    ]);
    expect(profile).toMatchObject({ status: 'linked', linkedEmployeeId: 'e1' });
  });

  it('moves the employee balances by the sum of what was linked', async () => {
    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });
    expect(mockFake.docs.get('employees/e1').balances).toEqual({ overtime: 6, vacation: 20, holiday: 0, birthday: 0 });
  });

  it('carries over the vacation start date and counts only the months after the import as still to accrue', async () => {
    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    // 22 complete months at the import day (2026-11-02) are already inside the 20 imported days
    expect(mockFake.docs.get('employees/e1')).toMatchObject({ vacationStartDate: '2025-01-01', vacationAccruedMonths: 22 });
    expect(accrueEmployeeVacation).toHaveBeenCalledWith('e1', today);
  });

  it('does not touch the start date the employee already has when it is the same one', async () => {
    seedEmployee('e1', { vacationStartDate: '2025-01-01', vacationAccruedMonths: 0 });
    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });
    expect(mockFake.docs.get('employees/e1').vacationAccruedMonths).toBe(0);
  });

  it('fills the employee record from the sheet (team, hire dates, employment type, schedule) where the employee has nothing yet', async () => {
    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });
    expect(mockFake.docs.get('employees/e1')).toMatchObject({
      team: 'Equipo A',
      hireDate: '2025-01-01',
      socialSecurityDate: '2025-01-01',
      employmentType: 'payroll',
      scheduleStart: '8:00',
      scheduleEnd: '5:00',
    });
  });

  it('never overwrites what the employee record already has', async () => {
    seedEmployee('e1', { team: 'Diseño', employmentType: 'professional-services', scheduleStart: '9:00 am' });

    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    const employee = mockFake.docs.get('employees/e1');
    expect(employee).toMatchObject({ team: 'Diseño', employmentType: 'professional-services', scheduleStart: '9:00 am' });
    // ...and still completes what was empty
    expect(employee).toMatchObject({ hireDate: '2025-01-01', scheduleEnd: '5:00' });
  });

  it('links the holidays the company owes the person (feriados por reponer) and the birthday day, and not the repaid ones', async () => {
    fetchSheetWorkbook.mockResolvedValue(WORKBOOK_SHEETS);
    await stageImport(admin, SHEET_URL, { openingDate: '2026-11-02' });

    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    const owed = movementsOf('e1').filter(([, data]) => data.type === 'holiday' || data.type === 'birthday');
    expect(owed.map(([, data]) => [data.type, data.amount, data.date, data.note]).sort()).toEqual([
      ['birthday', 1, '2026-11-02', 'Día de cumpleaños por reponer'],
      ['holiday', 1, '2026-08-31', 'Feriado 31/08 por reponer'],
    ]);
    // The struck-through 15/09 was repaid already: it must not count
    expect(mockFake.docs.get('employees/e1').balances).toMatchObject({ holiday: 1, birthday: 1 });
  });

  it('links last year\'s carried-over holidays as one opening movement', async () => {
    fetchSheetWorkbook.mockResolvedValue(WORKBOOK_SHEETS);
    await stageImport(admin, SHEET_URL, { openingDate: '2026-11-02' });
    seedEmployee('e3');

    await linkImportProfile(admin, 'josefina-montero', 'e3', { today });

    const carried = movementsOf('e3').filter(([, data]) => data.type === 'holiday');
    expect(carried.map(([, data]) => [data.amount, data.date, data.note])).toEqual([[2, '2026-11-02', 'Feriados adeudados de 2025 (saldo inicial importado)']]);
    expect(mockFake.docs.get('employees/e3').balances.holiday).toBe(2);
  });

  it('marks the person as linked and no longer offers it', async () => {
    await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });
    expect(mockFake.docs.get('importProfiles/estefania-rojas')).toMatchObject({ status: 'linked', linkedEmployeeId: 'e1', linkedBy: 'admin-1' });
    await expect(linkImportProfile(admin, 'estefania-rojas', 'e1', { today })).rejects.toMatchObject({ metadata: { reason: 'PROFILE_NOT_PENDING' } });
  });

  it('is safe to repeat after a run stopped halfway: existing movements are skipped and not counted twice', async () => {
    const [firstStaged] = [...mockFake.docs.entries()].filter(([path, data]) => path.startsWith('importMovements/') && data.profileKey === 'estefania-rojas' && data.type === 'overtime' && data.amount === 4);
    // An earlier run already created this one and moved its 4 hours
    mockFake.docs.set('movements/import-estefania-rojas-overtime-3-0', { employeeId: 'e1', type: 'overtime', amount: 4, source: 'import' });
    seedEmployee('e1', { balances: { overtime: 4, vacation: 0, holiday: 0, birthday: 0 } });
    expect(firstStaged[1].importKey).toBe('overtime:3:0');

    const { movementsCreated } = await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    expect(movementsCreated).toBe(2);
    expect(movementsOf('e1')).toHaveLength(3);
    expect(mockFake.docs.get('employees/e1').balances).toMatchObject({ overtime: 6, vacation: 20 });
  });

  it('works in several transactions for a person with many movements', async () => {
    for (let index = 0; index < 450; index += 1) {
      mockFake.docs.set(`importMovements/estefania-rojas__bulk-${index}`, {
        profileKey: 'estefania-rojas',
        importKey: `overtime:bulk:${index}`,
        type: 'overtime',
        amount: 1,
        date: '2026-03-01',
        note: '',
      });
    }

    const { movementsCreated } = await linkImportProfile(admin, 'estefania-rojas', 'e1', { today });

    expect(movementsCreated).toBe(453);
    expect(mockFake.docs.get('employees/e1').balances.overtime).toBe(456);
  });

  it('refuses a different vacation start date: the two would disagree on how the days were counted', async () => {
    seedEmployee('e1', { vacationStartDate: '2024-06-01' });
    await expect(linkImportProfile(admin, 'estefania-rojas', 'e1', { today })).rejects.toMatchObject({ metadata: { reason: 'START_DATE_MISMATCH' } });
    expect(movementsOf('e1')).toHaveLength(0);
  });

  it('refuses when the employee already accrued days: the imported balance would count them twice', async () => {
    seedEmployee('e1', { vacationStartDate: '2025-01-01', vacationAccruedMonths: 3 });
    await expect(linkImportProfile(admin, 'estefania-rojas', 'e1', { today })).rejects.toMatchObject({ metadata: { reason: 'ACCRUAL_ALREADY_RUNNING' } });
    expect(movementsOf('e1')).toHaveLength(0);
    expect(mockFake.docs.get('importProfiles/estefania-rojas').status).toBe('pending');
  });

  it('does not accrue for a person without a start date (interns)', async () => {
    seedEmployee('e2');
    await linkImportProfile(admin, 'pasante-uno', 'e2', { today });
    expect(accrueEmployeeVacation).not.toHaveBeenCalled();
    expect(mockFake.docs.get('employees/e2')).not.toHaveProperty('vacationStartDate');
  });

  it('reports an unknown person, an unknown employee or a person that was discarded', async () => {
    await expect(linkImportProfile(admin, 'ghost', 'e1', { today })).rejects.toBeInstanceOf(NotFoundError);
    await expect(linkImportProfile(admin, 'estefania-rojas', 'ghost', { today })).rejects.toBeInstanceOf(NotFoundError);

    mockFake.docs.set('importProfiles/pasante-uno', { ...mockFake.docs.get('importProfiles/pasante-uno'), status: 'discarded' });
    await expect(linkImportProfile(admin, 'pasante-uno', 'e1', { today })).rejects.toBeInstanceOf(ConflictError);
  });
});
