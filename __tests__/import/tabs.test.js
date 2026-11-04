import { buildImportPlan } from '@/domain/import/buildImportPlan';
import { formatReport, formatSummary } from '@/domain/import/formatReport';
import { parseOvertimeTab } from '@/domain/import/overtimeTab';
import { parseVacationsTab } from '@/domain/import/vacationsTab';

// Synthetic rows with the same shape and quirks as the real sheet
const VACATION_ROWS = [
  ['', '', '', '', '', '', '', '', '', ''],
  ['Equipo A', 'Horario de entrada', 'Horario de salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días Difrutados', 'Días Disponibles al 30/07/2026'],
  ['Ana Prueba', '8:00 am', '5:00 pm', 'CCSS', '15/02/2025', '15/08/2023', '20', '24 dic', '5', '15'],
  ['Luis Ejemplo', '7:00 am', '4:00 pm', 'S.P', 'No aplica', '01/06/2025', '10', '', '', '10'],
  ['Pasante Uno', '8:00 am', '5:00 pm', 'Pasantía', 'No aplica', '', '-', '-', '0', '0'],
  ['Equipo B', 'Horario de entrada', 'Horario de salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días Difrutados', 'Días Disponibles al 30/07/2026'],
  ['Mara Desfase', '8:00 am', '5:00 pm', 'CCSS', '', '', '20', '', '2', '15'],
];

const OVERTIME_HEADER = ['Colaborador', 'Horas Acumuladas', 'Fecha de Horas Acumuladas', 'Horas Devueltas', 'Fecha de Horas Devueltas', 'Pendientes/A favor', 'Detalle'];
const overtimeRows = (...rows) => [['Horas Extras Equipo'], OVERTIME_HEADER, ...rows];

describe('parseVacationsTab', () => {
  const result = parseVacationsTab(VACATION_ROWS);

  it('reads people with their team, skipping the header rows', () => {
    expect(result.employees.map(({ name, team }) => [name, team])).toEqual([
      ['Ana Prueba', 'Equipo A'],
      ['Luis Ejemplo', 'Equipo A'],
      ['Pasante Uno', 'Equipo A'],
      ['Mara Desfase', 'Equipo B'],
    ]);
  });

  it('reads the cutoff date from the header and the available days', () => {
    expect(result.cutoffDate).toBe('2026-07-30');
    expect(result.employees[0]).toMatchObject({ total: 20, taken: 5, available: 15 });
    expect(result.employees[2].available).toBe(0);
  });

  it('treats a blank "taken" as zero and flags rows where total - taken is not available', () => {
    expect(result.issues.map((issue) => issue.code)).toEqual(['VACATION_BALANCE_MISMATCH']);
    expect(result.issues[0].detail).toContain('Mara Desfase');
  });
});

describe('parseVacationsTab: the employee record', () => {
  const HEADER = ['Equipo Demo', 'Horario de entrada', 'Horario de salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días', 'Días Disponibles'];
  const record = (name, start, end, method, caja, spazio) => [name, start, end, method, caja, spazio, '10', '', '0', '10'];
  const parse = (...rows) => parseVacationsTab([HEADER, ...rows]).employees;

  it('reads team, schedule, employment type and the hire date (the "Caja" date is not part of the record)', () => {
    const [ana] = parse(record('Ana Prueba', '8:00 am ', '5:00 pm', 'CCSS', '15/02/2025', '15/08/2023'));
    expect(ana.employment).toEqual({
      team: 'Equipo Demo',
      hireDate: '2023-08-15',
      employmentType: 'payroll',
      scheduleStart: '8:00 am',
      scheduleEnd: '5:00 pm',
    });
  });

  it.each([
    ['CCSS', 'payroll'],
    ['S.P', 'professional-services'],
    ['SP', 'professional-services'],
    ['Pasantía', 'internship'],
    ['pasantia', 'internship'],
    ['Otro', null],
    ['', null],
  ])('reads the method %j as %j', (method, expected) => {
    expect(parse(record('Ana Prueba', '8:00', '5:00', method, '', ''))[0].employment.employmentType).toBe(expected);
  });

  it('keeps free-text schedules readable (letters and words intact, spaces collapsed) and drops "Pendiente"', () => {
    const [intern, pending] = parse(
      record('Pasante Uno', 'Lunes  a viernes 8:00 am', 'L-M-V 5:00 PM  M-J 12:00 md', 'Pasantía', 'No aplica', '2/03/2026'),
      record('Nuevo Ingreso', 'Pendiente', 'Pendiente', 'S.P', 'No aplica', 'Pendiente'),
    );

    expect(intern.employment.scheduleEnd).toBe('L-M-V 5:00 PM M-J 12:00 md');
    // A lowercase "s" must survive (a lost backslash in the whitespace regex once turned every "s" into a space)
    expect(intern.employment.scheduleStart).toBe('Lunes a viernes 8:00 am');
    expect(pending.employment).toMatchObject({ scheduleStart: '', scheduleEnd: '', hireDate: null });
  });

  it('does not carry the "Caja" date into the record, but still uses it to find when the sheet counts vacations from', () => {
    const [ana, intern] = parse(
      record('Ana Prueba', '8:00', '5:00', 'CCSS', '15/02/2025', '15/08/2023'),
      record('Pasante Uno', '8:00', '5:00', 'Pasantía', 'No aplica', '2/03/2026'),
    );

    expect(ana.employment).not.toHaveProperty('socialSecurityDate');
    expect(ana.startDateCandidates).toEqual(['2025-02-15', '2023-08-15']);
    expect(intern.employment).toMatchObject({ hireDate: '2026-03-02' });
    expect(intern.startDateCandidates).toEqual(['2026-03-02']);
  });
});

describe('parseOvertimeTab', () => {
  it('imports accumulated hours as positive and returned hours as negative, with their dates and notes', () => {
    const { movements, issues } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '7,00', '19/02/26', '', '', '7,00', 'Expo'],
        ['Ana Prueba', '', '', '2,50', '24/02/2026', '4,50', 'Salió temprano'],
      ),
    );

    expect(movements.map(({ amount, date, note }) => ({ amount, date, note }))).toEqual([
      { amount: 7, date: '2026-02-19', note: 'Expo' },
      { amount: -2.5, date: '2026-02-24', note: 'Salió temprano' },
    ]);
    expect(issues).toEqual([]);
  });

  it('infers hours carried over from before the ledger when the first balance is not explained by the first row', () => {
    const { movements, issues, people } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '', '', '40,00', '19/02/2026', '40,00', 'Viaje'],
        ['Ana Prueba', '7,00', '20/02/2026', '', '', '47,00', ''],
      ),
    );

    // 80 h carried over, 40 h returned -> 40 h, exactly what the sheet shows
    expect(movements.map(({ amount, dateKind }) => [amount, dateKind])).toEqual([
      [80, 'inferred-opening'],
      [-40, 'exact'],
      [7, 'exact'],
    ]);
    expect(movements[0].date).toBe('2026-02-19');
    expect(issues.map((issue) => issue.code)).toEqual(['OPENING_BALANCE_INFERRED']);
    expect(people[0]).toMatchObject({ importedSum: 47, sheetBalance: 47 });
  });

  it('flags a later row whose columns disagree with the running balance', () => {
    const { issues } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '5,00', '01/03/2026', '', '', '5,00', ''],
        ['Ana Prueba', '2,00', '02/03/2026', '', '', '12,00', ''],
      ),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'BALANCE_MISMATCH', row: 4, name: 'Ana Prueba' });
    expect(issues[0].detail).toBe('columns say 2, running balance changed by 7');
  });

  it('imports the running balance change instead when trustBalance is on', () => {
    const { movements } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '5,00', '01/03/2026', '', '', '5,00', ''],
        ['Ana Prueba', '2,00', '02/03/2026', '', '', '12,00', ''],
      ),
      { trustBalance: true },
    );
    expect(movements.map(({ amount }) => amount)).toEqual([5, 7]);
  });

  it('uses the default year for dates without one when the person has no earlier dated row', () => {
    const rows = overtimeRows(['Ana Prueba', '2,00', 'Febrero', '', '', '2,00', ''], ['Luis Ejemplo', '1,00', '06/03', '', '', '1,00', '']);
    expect(parseOvertimeTab(rows).movements).toEqual([]);

    const { movements } = parseOvertimeTab(rows, { defaultYear: 2026 });
    expect(movements.map(({ date }) => date)).toEqual(['2026-02-28', '2026-03-06']);
  });

  it('reads several days in one cell using the first day', () => {
    const { movements, issues } = parseOvertimeTab(
      overtimeRows(['Ana Prueba', '', '', '12,00', '19 y 20 de Marzo', '12,00', 'Ventiladores']),
      { defaultYear: 2026 },
    );
    expect(movements.find((movement) => movement.amount === -12).date).toBe('2026-03-19');
    expect(issues.some((issue) => issue.code === 'DATE_RANGE_FIRST_DAY')).toBe(true);
  });

  it('does not report a mismatch when a row has no balance but a later one does (the balance is checked over both rows)', () => {
    const { issues } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '2,00', '01/03/2026', '', '', '', ''],
        ['Ana Prueba', '3,00', '02/03/2026', '', '', '5,00', ''],
      ),
    );
    expect(issues).toEqual([]);
  });

  it('borrows the previous date for free-text dates, reads month names and no-year dates, and reports them', () => {
    const { movements, issues } = parseOvertimeTab(
      overtimeRows(
        ['Ana Prueba', '5,00', '10/06/2026', '', '', '5,00', ''],
        ['Ana Prueba', '', '', '8,00', 'PAGO', '-3,00', 'Pago'],
        ['Ana Prueba', '', '', '1,00', '10/07', '-4,00', ''],
        ['Ana Prueba', '21,50', 'setiembre', '', '', '17,50', 'Extras'],
      ),
    );

    expect(movements.map(({ date, dateKind }) => [date, dateKind])).toEqual([
      ['2026-06-10', 'exact'],
      ['2026-06-10', 'assumed-previous'],
      ['2026-07-10', 'year-assumed'],
      ['2026-09-30', 'month-name'],
    ]);
    expect(movements[1].note).toBe('Pago [PAGO]');
    expect(issues.map((issue) => issue.code).sort()).toEqual(['DATE_ASSUMED_PREVIOUS', 'DATE_MONTH_NAME', 'DATE_YEAR_ASSUMED']);
  });

  it('does not import a row with no date at all and nothing earlier to borrow from', () => {
    const { movements, issues } = parseOvertimeTab(overtimeRows(['Ana Prueba', '2,00', 'ayer', '', '', '2,00', '']));
    expect(movements).toEqual([]);
    expect(issues[0].code).toBe('DATE_UNRESOLVED');
  });

  it('skips zero rows and rejects amounts that are not multiples of 0.25', () => {
    const { movements, issues } = parseOvertimeTab(
      overtimeRows(['Ana Prueba', '0,00', '01/03/2026', '', '', '0,00', ''], ['Ana Prueba', '1,30', '02/03/2026', '', '', '', '']),
    );
    expect(movements).toEqual([]);
    expect(issues.map((issue) => issue.code).sort()).toEqual(['AMOUNT_INVALID', 'ZERO_AMOUNT_SKIPPED']);
  });

  it('ignores blank rows and the side summary columns, and reports per-person sums', () => {
    const { people } = parseOvertimeTab(
      overtimeRows(['Ana Prueba', '4,00', '01/03/2026', '', '', '4,00', '', '', '', 'Colaborador', 'Total Mes'], ['', '', '', '', '', '', ''], ['Ana Prueba', '', '', '', '', '', '']),
    );
    expect(people).toEqual([{ name: 'Ana Prueba', importedSum: 4, sheetBalance: 4 }]);
  });

  it('fails clearly when the header row is missing', () => {
    expect(() => parseOvertimeTab([['otra', 'cosa']])).toThrow('header row not found');
  });
});

describe('buildImportPlan', () => {
  const vacations = parseVacationsTab(VACATION_ROWS);
  const overtime = parseOvertimeTab(
    overtimeRows(
      ['Ana Prueba', '7,00', '19/02/26', '', '', '7,00', ''],
      ['Luis', '2,00', '20/02/26', '', '', '2,00', ''],
      ['Fantasma', '1,00', '21/02/26', '', '', '1,00', ''],
    ),
  );

  it('applies only identical names; a fuzzy match waits for confirmation', () => {
    const plan = buildImportPlan({ vacations, overtime });

    expect(plan.movements.filter((movement) => movement.type === 'overtime').map((movement) => movement.employeeName)).toEqual(['Ana Prueba']);
    expect(plan.unresolvedNames.map(({ rawName, match, confidence, movementCount }) => ({ rawName, match, confidence, movementCount }))).toEqual([
      { rawName: 'Luis', match: 'Luis Ejemplo', confidence: 'fuzzy', movementCount: 1 },
      { rawName: 'Fantasma', match: null, confidence: 'none', movementCount: 1 },
    ]);
  });

  it('applies a confirmed mapping, case and accent insensitive', () => {
    const plan = buildImportPlan({ vacations, overtime, nameMapping: { luis: 'Luis Ejemplo' } });
    expect(plan.movements.find((movement) => movement.sheetName === 'Luis')).toMatchObject({ employeeName: 'Luis Ejemplo', amount: 2 });
  });

  it('reports a mapping that points to someone who is not in the vacations tab', () => {
    const plan = buildImportPlan({ vacations, overtime, nameMapping: { Fantasma: 'Nadie Conocido' } });
    expect(plan.issues.some((issue) => issue.code === 'MAPPING_TARGET_UNKNOWN')).toBe(true);
  });

  it('adds one opening vacation movement per person with available days, dated at the cutoff', () => {
    const plan = buildImportPlan({ vacations, overtime });
    const vacationMovements = plan.movements.filter((movement) => movement.type === 'vacation');

    expect(vacationMovements.map(({ employeeName, amount, date }) => [employeeName, amount, date])).toEqual([
      ['Ana Prueba', 15, '2026-07-30'],
      ['Luis Ejemplo', 10, '2026-07-30'],
      ['Mara Desfase', 15, '2026-07-30'],
    ]);
  });

  describe('vacation accrual start dates', () => {
    const header = ['Equipo A', 'Horario de entrada', 'Salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días', 'Días Disponibles al 30/07/2026'];
    const person = (name, caja, spazio, total, taken, available) => [name, '8:00', '5:00', 'CCSS', caja, spazio, total, '', taken, available];
    const planFor = (...people) =>
      buildImportPlan({
        vacations: parseVacationsTab([header, ...people]),
        overtime: parseOvertimeTab(overtimeRows()),
        openingDate: '2026-11-02',
      });

    it('picks, per person, the date that reproduces the sheet total (here the Caja date)', () => {
      const plan = planFor(person('Ana Prueba', '01/01/2025', '15/08/2023', '22', '2', '20'));
      expect(plan.employees[0].vacationStartDate).toBe('2025-01-01');
      expect(plan.issues).toEqual([]);
    });

    it('uses the company date when that is the one the sheet counts from (Caja date is later)', () => {
      const plan = planFor(person('Luis Ejemplo', '01/07/2026', '01/05/2025', '18', '13', '5'));
      expect(plan.employees[0].vacationStartDate).toBe('2025-05-01');
    });

    it('falls back to the company date when the Caja cell is not a date', () => {
      const plan = planFor(person('Mara Desfase', 'No aplica', '03/03/2025', '19', '12', '7'));
      expect(plan.employees[0].vacationStartDate).toBe('2025-03-03');
    });

    it('sets no date and reports it when no date reproduces the total', () => {
      const plan = planFor(person('Ana Prueba', '01/01/2025', '15/08/2023', '10', '0', '10'));
      expect(plan.employees[0].vacationStartDate).toBeNull();
      expect(plan.issues.map((issue) => issue.code)).toEqual(['ACCRUAL_START_UNRESOLVED']);
    });

    it('gives no start date to people without a numeric total (interns)', () => {
      const plan = planFor(person('Pasante Uno', 'No aplica', '2/03/2026', '-', '-', '0'));
      expect(plan.employees[0].vacationStartDate).toBeNull();
      expect(plan.issues).toEqual([]);
    });
  });

  it('dates the opening balances with the import date, not with the stale label in the sheet header', () => {
    const plan = buildImportPlan({ vacations, overtime, openingDate: '2026-11-02' });

    expect(plan.openingDate).toBe('2026-11-02');
    expect(plan.sheetHeaderDate).toBe('2026-07-30');
    expect(plan.movements.filter((movement) => movement.type === 'vacation').every((movement) => movement.date === '2026-11-02')).toBe(true);
  });

  it('gives every movement a stable import key so a re-run can skip what is already there', () => {
    const plan = buildImportPlan({ vacations, overtime });
    const keys = plan.movements.map((movement) => movement.importKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still matches a person whose every row was dropped, so their reconciliation is not "unmatched"', () => {
    const dropped = parseOvertimeTab(overtimeRows(['Ana Prueba', '2,00', 'ayer', '', '', '2,00', '']));
    const plan = buildImportPlan({ vacations, overtime: dropped });
    expect(plan.reconciliation[0]).toMatchObject({ name: 'Ana Prueba', employeeName: 'Ana Prueba', matches: false });
  });

  it('formats a summary without names, and a report that lists what needs a decision', () => {
    const plan = buildImportPlan({ vacations, overtime });
    expect(formatSummary(plan)).not.toContain('Ana Prueba');
    expect(formatSummary(plan)).toContain('Names in overtime still unmatched:  2');
    expect(formatReport(plan)).toContain('| Luis | 1 | Luis Ejemplo | fuzzy |');
  });
});
