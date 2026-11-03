import { holidaySheet } from '../helpers/sheetFixtures';
import { parseHolidaysTab } from '@/domain/import/holidaysTab';
import { buildStagingPlan, profileKeyFor, summarizeStagingPlan } from '@/domain/import/stagingPlan';
import { parseOvertimeTab } from '@/domain/import/overtimeTab';
import { parseVacationsTab } from '@/domain/import/vacationsTab';

// Made-up people with the same quirks as the real sheet
const HEADER = ['Equipo A', 'Horario de entrada', 'Salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días', 'Días Disponibles al 30/07/2026'];
const person = (name, caja, spazio, total, taken, available) => [name, '8:00', '5:00', 'CCSS', caja, spazio, total, '', taken, available];
const OVERTIME_HEADER = ['Colaborador', 'Horas Acumuladas', 'Fecha de Horas Acumuladas', 'Horas Devueltas', 'Fecha de Horas Devueltas', 'Pendientes/A favor', 'Detalle'];

const vacations = parseVacationsTab([
  HEADER,
  person('Estefania Rojas', '01/01/2025', '01/01/2025', '22', '2', '20'),
  person('Josefina Barios', '01/01/2025', '01/01/2025', '22', '7', '15'),
  person('Josefina Montero', '01/01/2025', '01/01/2025', '22', '0', '22'),
  person('Mario Prueba', '15/02/2025', '15/08/2023', '20', '5', '15'),
  person('Pasante Uno', 'No aplica', '2/03/2026', '-', '-', '0'),
]);

const overtimeFor = (...rows) => parseOvertimeTab([['Horas Extras Equipo'], OVERTIME_HEADER, ...rows], { defaultYear: 2026 });
const row = (name, hours, date, balance, detail = '') => [name, hours, date, '', '', balance, detail];

describe('profileKeyFor', () => {
  it('is the name in lowercase words without accents, joined by hyphens', () => {
    expect(profileKeyFor(' Estefanía  Rojas ')).toBe('estefania-rojas');
  });
});

describe('buildStagingPlan', () => {
  const plan = buildStagingPlan({
    vacations,
    overtime: overtimeFor(
      row('Estef', '4,00', '10/02/2026', '4,00', 'Expo'),
      row('Estef', '2,00', '11/02/2026', '6,00'),
      row('Mario Prueba', '5,00', '09/02/2026', '5,00'),
      row('Josefina Barrios', '3,00', '12/02/2026', '3,00'),
      row('Jos', '1,00', '13/02/2026', '1,00'),
      row('Zacarias Nuevo', '1,50', '14/02/2026', '1,50'),
    ),
    openingDate: '2026-11-02',
  });
  const byName = (name) => plan.profiles.find((profile) => profile.name === name);

  it('has one profile per person of the vacations tab plus one for each name nobody matches', () => {
    expect(plan.profiles.map((profile) => profile.name)).toEqual([
      'Estefania Rojas',
      'Josefina Barios',
      'Josefina Montero',
      'Mario Prueba',
      'Pasante Uno',
      'Jos',
      'Zacarias Nuevo',
    ]);
  });

  it('merges a close variant of a name into the same person and keeps it as an alias', () => {
    const estefania = byName('Estefania Rojas');
    expect(estefania.aliases).toEqual([{ name: 'Estef', match: 'fuzzy' }]);
    // Her hours, written under the short name, belong to the person of the vacations tab
    expect(estefania.movements.filter((movement) => movement.type === 'overtime').map((movement) => movement.amount)).toEqual([4, 2]);
    expect(estefania.totals).toEqual({ vacation: 20, overtime: 6 });
  });

  it('matches a name that is written exactly the same without listing it as an alias', () => {
    expect(byName('Mario Prueba').aliases).toEqual([]);
    expect(byName('Mario Prueba').totals).toEqual({ vacation: 15, overtime: 5 });
  });

  it('picks the right person among two with the same first name using the surname', () => {
    expect(byName('Josefina Barios').aliases).toEqual([{ name: 'Josefina Barrios', match: 'fuzzy' }]);
    expect(byName('Josefina Barios').totals.overtime).toBe(3);
    expect(byName('Josefina Montero').aliases).toEqual([]);
  });

  it('never guesses: an ambiguous or unknown name becomes its own profile to review', () => {
    expect(byName('Jos')).toMatchObject({ needsReview: true, reviewReason: 'ambiguous-name', aliases: [] });
    expect(byName('Zacarias Nuevo')).toMatchObject({ needsReview: true, reviewReason: 'no-match' });
    expect(byName('Zacarias Nuevo').movements).toHaveLength(1);
  });

  it('adds the opening vacation balance dated with the import day, and none for people without days', () => {
    expect(byName('Josefina Montero').movements).toEqual([
      { importKey: expect.stringMatching(/^vacations:/), type: 'vacation', amount: 22, date: '2026-11-02', dateKind: 'exact', note: 'Saldo inicial importado' },
    ]);
    expect(byName('Pasante Uno').movements).toEqual([]);
  });

  it('resolves the accrual start date per person and none for interns', () => {
    expect(byName('Estefania Rojas').vacationStartDate).toBe('2025-01-01');
    expect(byName('Mario Prueba').vacationStartDate).toBe('2025-02-15');
    expect(byName('Pasante Uno').vacationStartDate).toBeNull();
  });

  it('gives every movement of a profile a different import key', () => {
    plan.profiles.forEach((profile) => {
      const keys = profile.movements.map((movement) => movement.importKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('attaches issues to the person they are about, using the name written in the sheet', () => {
    const withMismatch = buildStagingPlan({
      vacations,
      overtime: overtimeFor(row('Estef', '4,00', '10/02/2026', '4,00'), row('Estef', '2,00', '11/02/2026', '9,00')),
      openingDate: '2026-11-02',
    });
    const estefania = withMismatch.profiles.find((profile) => profile.name === 'Estefania Rojas');
    expect(estefania.issues.map((issue) => issue.code)).toContain('BALANCE_MISMATCH');
    expect(withMismatch.globalIssues).toEqual([]);
  });
});

describe('summarizeStagingPlan', () => {
  it('counts people, movements, merged names, reviews and issues without exposing names', () => {
    const plan = buildStagingPlan({
      vacations,
      overtime: overtimeFor(row('Estef', '4,00', '10/02/2026', '4,00'), row('Estef', '2,00', '11/02/2026', '6,00'), row('Zacarias Nuevo', '1,50', '14/02/2026', '1,50')),
      openingDate: '2026-11-02',
    });
    const summary = summarizeStagingPlan(plan);

    expect(summary).toMatchObject({ openingDate: '2026-11-02', people: 6, movements: 7, mergedNames: 1, needReview: 1 });
    expect(JSON.stringify(summary)).not.toContain('Estefania');
  });
});

describe('buildStagingPlan: holidays the company owes ("por reponer")', () => {
  const holidays = [
    parseHolidaysTab(
      holidaySheet(
        'Feriados CR 26',
        ['2026-08-31', '2026-09-15'],
        [
          ['Estef', 'Reponer', 'Reponer~', 'Reponer'], // owes 31/08, repaid 15/09, birthday owed
          ['Mario Prueba', 'Lo toma', 'Reponer~', 'Toma el 08 de enero'], // nothing owed
          ['Jos', 'Reponer', 'Lo toma'], // ambiguous nickname
          ['Persona Nueva', 'Reponer', 'Reponer'],
        ],
        { carryover: [['Josefina Montero', 2], ['Pasante Uno', 0]], hiddenRows: [5] },
      ),
      { country: 'CR', defaultYear: 2026 },
    ),
  ];
  const plan = buildStagingPlan({ vacations, overtime: overtimeFor(), holidays, vacationHiddenRows: new Set([vacations.employees[3].sourceRow]), openingDate: '2026-11-02' });
  const byName = (name) => plan.profiles.find((profile) => profile.name === name);
  const holidayMovements = (name) => byName(name).movements.filter((movement) => movement.type === 'holiday');

  it('adds one holiday day per "Reponer", dated on the holiday, under the person of the vacations tab', () => {
    expect(holidayMovements('Estefania Rojas')).toEqual([
      { importKey: expect.stringMatching(/^holidays:CR:\d+:2026-08-31$/), type: 'holiday', amount: 1, date: '2026-08-31', dateKind: 'exact', note: 'Feriado 31/08 por reponer' },
    ]);
    expect(byName('Estefania Rojas').aliases).toEqual([{ name: 'Estef', match: 'fuzzy' }]);
  });

  it('adds nothing for what was already repaid, taken or not applicable', () => {
    expect(byName('Mario Prueba').movements.filter((movement) => movement.type !== 'vacation')).toEqual([]);
  });

  it('adds the birthday owed as its own movement, dated with the import day', () => {
    expect(byName('Estefania Rojas').movements.filter((movement) => movement.type === 'birthday')).toEqual([
      { importKey: expect.stringMatching(/^holidays:CR:\d+:birthday$/), type: 'birthday', amount: 1, date: '2026-11-02', dateKind: 'exact', note: 'Día de cumpleaños por reponer' },
    ]);
    expect(byName('Estefania Rojas').totals).toMatchObject({ holiday: 1, birthday: 1 });
  });

  it('adds the days still owed from last year as one opening movement, and none when the figure is zero', () => {
    expect(holidayMovements('Josefina Montero')).toEqual([
      { importKey: expect.stringMatching(/^holidays:CR:\d+:carryover$/), type: 'holiday', amount: 2, date: '2026-11-02', dateKind: 'exact', note: 'Feriados adeudados de 2025 (saldo inicial importado)' },
    ]);
    expect(holidayMovements('Pasante Uno')).toEqual([]);
  });

  it('never guesses an ambiguous nickname: it keeps its days in a profile of its own to review', () => {
    expect(byName('Jos')).toMatchObject({ needsReview: true, reviewReason: 'ambiguous-name', totals: { holiday: 1 } });
    expect(byName('Persona Nueva')).toMatchObject({ needsReview: true, reviewReason: 'no-match', totals: { holiday: 2 } });
  });

  it('flags people whose row is hidden in either tab', () => {
    const hidden = plan.profiles.filter((profile) => profile.hiddenInSheet).map((profile) => profile.name);
    expect(hidden).toEqual(['Mario Prueba', 'Persona Nueva']); // the first from the vacations tab, the second from the holidays tab
  });

  it('gives every movement of a profile a different import key, also with several countries', () => {
    const twoCountries = buildStagingPlan({
      vacations,
      overtime: overtimeFor(),
      holidays: [...holidays, { ...holidays[0], country: 'AR' }],
      openingDate: '2026-11-02',
    });
    twoCountries.profiles.forEach((profile) => {
      const keys = profile.movements.map((movement) => movement.importKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('summarizes the days owed and the people hidden without names', () => {
    const summary = summarizeStagingPlan(plan);
    expect(summary).toMatchObject({ holidayDaysOwed: 6, peopleWithHolidaysOwed: 4, hiddenInSheet: 2 });
    expect(JSON.stringify(summary)).not.toContain('Estefania');
  });
});
