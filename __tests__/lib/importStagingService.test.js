import { createFakeFirestore } from '../helpers/fakeFirestore';
import { OVERTIME_ROWS, overtimeRow, SHEET_TABS_BY_GID, SHEET_URL, WORKBOOK_SHEETS } from '../helpers/sheetFixtures';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  discardImportProfile,
  listImportProfiles,
  previewImport,
  stageImport,
  suggestImportProfiles,
} from '../../lib/services/importStagingService';
import { fetchSheetTab, fetchSheetWorkbook } from '../../lib/sheetsClient';

const mockFake = createFakeFirestore();

jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
jest.mock('../../lib/sheetsClient', () => ({ fetchSheetTab: jest.fn(), fetchSheetWorkbook: jest.fn() }));

const admin = { id: 'admin-1', role: 'admin' };
const options = { openingDate: '2026-11-02' };

function serveSheet(overtimeRows = OVERTIME_ROWS) {
  fetchSheetTab.mockImplementation(async (sheetId, gid) => {
    if (Number(gid) === 1900223631) return overtimeRows;
    return SHEET_TABS_BY_GID[gid];
  });
  fetchSheetWorkbook.mockResolvedValue(WORKBOOK_SHEETS);
}

beforeEach(() => {
  mockFake.docs.clear();
  jest.clearAllMocks();
  serveSheet();
});

describe('previewImport', () => {
  it('reads the sheet and reports what would be saved without writing anything', async () => {
    const preview = await previewImport(SHEET_URL, options);

    expect(preview).toMatchObject({ openingDate: '2026-11-02', people: 6, mergedNames: 2, needReview: 2 });
    // Holidays the company owes: Estef 1 + Jos 2 + 2 carried over from last year = 5 days, 3 people
    expect(preview).toMatchObject({ holidayDaysOwed: 5, peopleWithHolidaysOwed: 3 });
    // The vacations tab has the row of Josefina Montero hidden
    expect(preview.hiddenInSheet).toBe(1);
    expect(preview.profiles.find((profile) => profile.name === 'Estefania Rojas').aliases).toEqual([{ name: 'Estef', match: 'fuzzy' }]);
    expect(mockFake.docs.size).toBe(0);
  });

  it('rejects anything that is not a Google Sheets link, before fetching anything', async () => {
    await expect(previewImport('https://evil.example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz', options)).rejects.toMatchObject({
      metadata: { reason: 'INVALID_SHEET_URL' },
    });
    await expect(previewImport('not a url', options)).rejects.toBeInstanceOf(ValidationError);
    expect(fetchSheetTab).not.toHaveBeenCalled();
  });

  it('reads the two tabs of the sheet id found in the link', async () => {
    await previewImport(SHEET_URL, options);
    expect(fetchSheetTab).toHaveBeenCalledWith('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', '896284519');
    expect(fetchSheetTab).toHaveBeenCalledWith('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', '1900223631');
  });
});

describe('stageImport', () => {
  it('saves every person as pending, with the other names they were found under, and their movements', async () => {
    const result = await stageImport(admin, SHEET_URL, options);

    expect(result.saved).toEqual({ created: 6, updated: 0, alreadyLinked: 0 });
    expect(mockFake.count('importProfiles')).toBe(6);

    const estefania = mockFake.docs.get('importProfiles/estefania-rojas');
    expect(estefania).toMatchObject({
      name: 'Estefania Rojas',
      status: 'pending',
      aliases: [{ name: 'Estef', match: 'fuzzy' }],
      vacationStartDate: '2025-01-01',
      openingDate: '2026-11-02',
      linkedEmployeeId: null,
      stagedBy: 'admin-1',
      totals: { vacation: 20, overtime: 6, holiday: 1, birthday: 1 },
      movementCount: 5,
    });
    // Nothing is tied to an employee: no real movements and no employees were created
    expect(mockFake.count('movements')).toBe(0);
    expect(mockFake.count('employees')).toBe(0);
  });

  it('stages the movements of each person under their own key', async () => {
    await stageImport(admin, SHEET_URL, options);
    const staged = [...mockFake.docs.entries()].filter(([path, data]) => path.startsWith('importMovements/') && data.profileKey === 'estefania-rojas');

    expect(staged.map(([, data]) => [data.type, data.amount, data.date]).sort()).toEqual([
      ['birthday', 1, '2026-11-02'],
      ['holiday', 1, '2026-08-31'],
      ['overtime', 2, '2026-02-11'],
      ['overtime', 4, '2026-02-10'],
      ['vacation', 20, '2026-11-02'],
    ]);
  });

  it('can be repeated: it updates what is pending instead of duplicating it', async () => {
    await stageImport(admin, SHEET_URL, options);
    const before = { profiles: mockFake.count('importProfiles'), movements: mockFake.count('importMovements') };

    const second = await stageImport(admin, SHEET_URL, options);

    expect(second.saved).toEqual({ created: 0, updated: 6, alreadyLinked: 0 });
    expect({ profiles: mockFake.count('importProfiles'), movements: mockFake.count('importMovements') }).toEqual(before);
  });

  it('drops staged movements that are no longer in the sheet', async () => {
    await stageImport(admin, SHEET_URL, options);
    expect(mockFake.count('importMovements')).toBe(12);

    serveSheet(OVERTIME_ROWS.filter((row) => row[1] !== '2,00'));
    await stageImport(admin, SHEET_URL, options);

    expect(mockFake.count('importMovements')).toBe(11);
  });

  it('leaves alone a person that was already linked to an employee', async () => {
    await stageImport(admin, SHEET_URL, options);
    mockFake.docs.set('importProfiles/estefania-rojas', { ...mockFake.docs.get('importProfiles/estefania-rojas'), status: 'linked', linkedEmployeeId: 'e1' });

    const again = await stageImport(admin, SHEET_URL, options);

    expect(again.saved.alreadyLinked).toBe(1);
    expect(mockFake.docs.get('importProfiles/estefania-rojas')).toMatchObject({ status: 'linked', linkedEmployeeId: 'e1' });
  });

  it('brings back a person that had been discarded', async () => {
    await stageImport(admin, SHEET_URL, options);
    await discardImportProfile(admin, 'estefania-rojas');
    expect(mockFake.docs.get('importProfiles/estefania-rojas').status).toBe('discarded');

    await stageImport(admin, SHEET_URL, options);
    expect(mockFake.docs.get('importProfiles/estefania-rojas').status).toBe('pending');
  });

  it('keeps the issues of each person for review, capped', async () => {
    serveSheet([...OVERTIME_ROWS, overtimeRow('Estef', '1,00', '15/02/2026', '99,00')]);
    await stageImport(admin, SHEET_URL, options);

    const profile = mockFake.docs.get('importProfiles/estefania-rojas');
    expect(profile.issueCount).toBeGreaterThan(0);
    expect(profile.issues.map((issue) => issue.code)).toContain('BALANCE_MISMATCH');
  });
});

describe('stageImport: holidays owed to people (feriados por reponer)', () => {
  it('stages one holiday movement per day still owed, dated on the holiday, and none for the repaid (struck through) ones', async () => {
    await stageImport(admin, SHEET_URL, options);

    const holidays = [...mockFake.docs.entries()]
      .filter(([path, data]) => path.startsWith('importMovements/estefania-rojas__') && data.type === 'holiday')
      .map(([, data]) => [data.amount, data.date, data.note]);
    expect(holidays).toEqual([[1, '2026-08-31', 'Feriado 31/08 por reponer']]);
  });

  it('merges a nickname used in the holiday tab into the person, and keeps ambiguous ones apart for review', async () => {
    await stageImport(admin, SHEET_URL, options);

    expect(mockFake.docs.get('importProfiles/estefania-rojas').aliases).toEqual(expect.arrayContaining([{ name: 'Estef', match: 'fuzzy' }]));
    expect(mockFake.docs.get('importProfiles/jos')).toMatchObject({ needsReview: true, reviewReason: 'ambiguous-name', totals: { holiday: 2 } });
  });

  it("keeps last year's carried-over holidays as an opening movement of the person", async () => {
    await stageImport(admin, SHEET_URL, options);

    const carried = [...mockFake.docs.entries()].filter(([path, data]) => path.startsWith('importMovements/josefina-montero__') && data.type === 'holiday');
    expect(carried.map(([, data]) => [data.amount, data.date, data.note])).toEqual([[2, '2026-11-02', 'Feriados adeudados de 2025 (saldo inicial importado)']]);
  });

  it('flags the people whose row is hidden in the sheet', async () => {
    await stageImport(admin, SHEET_URL, options);
    expect(mockFake.docs.get('importProfiles/josefina-montero').hiddenInSheet).toBe(true);
    expect(mockFake.docs.get('importProfiles/estefania-rojas').hiddenInSheet).toBe(false);
  });
});

describe('listImportProfiles', () => {
  beforeEach(() => stageImport(admin, SHEET_URL, options));

  it('lists the pending people in alphabetical order', async () => {
    const names = (await listImportProfiles()).map((profile) => profile.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    expect(names).toHaveLength(6);
  });

  it('can list the discarded ones', async () => {
    await discardImportProfile(admin, 'pasante-uno');
    expect((await listImportProfiles()).map((profile) => profile.name)).not.toContain('Pasante Uno');
    expect((await listImportProfiles('discarded')).map((profile) => profile.name)).toEqual(['Pasante Uno']);
  });
});

describe('suggestImportProfiles', () => {
  beforeEach(() => stageImport(admin, SHEET_URL, options));

  it('finds the person with the same name, ignoring accents and case', async () => {
    const [match] = await suggestImportProfiles('ESTEFANÍA rojas');
    expect(match).toMatchObject({ confidence: 'exact', profile: { name: 'Estefania Rojas' } });
  });

  it('finds the person when the new collaborator has the full name and the sheet a shorter one', async () => {
    const [match] = await suggestImportProfiles('Estefania Rojas Vargas');
    expect(match.profile.name).toBe('Estefania Rojas');
  });

  it('also finds a person by the other name they were found under', async () => {
    const [match] = await suggestImportProfiles('Estef');
    expect(match.profile.name).toBe('Estefania Rojas');
  });

  it('offers every candidate when the name fits several people equally', async () => {
    const suggestions = await suggestImportProfiles('Josefina');
    // The two Josefinas, plus the unresolved nickname "Jos" that may be either of them
    expect(suggestions.map((suggestion) => suggestion.profile.name).sort()).toEqual(['Jos', 'Josefina Barios', 'Josefina Montero']);
    expect(suggestions.every((suggestion) => suggestion.confidence === 'ambiguous')).toBe(true);
  });

  it('offers nothing for an unknown name or for a person that is no longer pending', async () => {
    expect(await suggestImportProfiles('Carlos Desconocido')).toEqual([]);
    await discardImportProfile(admin, 'estefania-rojas');
    expect(await suggestImportProfiles('Estefania Rojas')).toEqual([]);
  });
});

describe('discardImportProfile', () => {
  beforeEach(() => stageImport(admin, SHEET_URL, options));

  it('marks a pending person as discarded, with who did it', async () => {
    await discardImportProfile(admin, 'pasante-uno');
    expect(mockFake.docs.get('importProfiles/pasante-uno')).toMatchObject({ status: 'discarded', discardedBy: 'admin-1' });
  });

  it('refuses to discard someone already linked, and reports an unknown person', async () => {
    mockFake.docs.set('importProfiles/pasante-uno', { ...mockFake.docs.get('importProfiles/pasante-uno'), status: 'linked' });
    await expect(discardImportProfile(admin, 'pasante-uno')).rejects.toBeInstanceOf(ConflictError);
    await expect(discardImportProfile(admin, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});
