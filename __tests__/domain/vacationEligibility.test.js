import { accruesVacation, hasVacationAccrual, nextVacationStart, vacationStartFor } from '@/domain/vacationEligibility';

describe('accruesVacation', () => {
  it('is true for the payroll and for professional services only', () => {
    expect(accruesVacation('payroll')).toBe(true);
    expect(accruesVacation('professional-services')).toBe(true);
    expect(accruesVacation('internship')).toBe(false);
    expect(accruesVacation(null)).toBe(false);
    expect(accruesVacation(undefined)).toBe(false);
    expect(accruesVacation('freelance')).toBe(false);
  });
});

describe('hasVacationAccrual', () => {
  it('needs both a start date and a contract type that earns vacations', () => {
    expect(hasVacationAccrual({ vacationStartDate: '2025-01-01', employmentType: 'payroll' })).toBe(true);
    expect(hasVacationAccrual({ vacationStartDate: '2025-01-01', employmentType: 'internship' })).toBe(false);
    expect(hasVacationAccrual({ vacationStartDate: '2025-01-01' })).toBe(false);
    expect(hasVacationAccrual({ vacationStartDate: null, employmentType: 'payroll' })).toBe(false);
  });
});

describe('vacationStartFor (a new person)', () => {
  it('is the hire date when the contract type earns vacations', () => {
    expect(vacationStartFor({ hireDate: '2025-01-01', employmentType: 'payroll' })).toBe('2025-01-01');
    expect(vacationStartFor({ hireDate: '2025-01-01', employmentType: 'professional-services' })).toBe('2025-01-01');
  });

  it('is nothing for an intern, an undefined contract or a missing hire date', () => {
    expect(vacationStartFor({ hireDate: '2025-01-01', employmentType: 'internship' })).toBeNull();
    expect(vacationStartFor({ hireDate: '2025-01-01', employmentType: null })).toBeNull();
    expect(vacationStartFor({ hireDate: null, employmentType: 'payroll' })).toBeNull();
  });
});

describe('nextVacationStart (editing a person)', () => {
  const payroll = { employmentType: 'payroll', hireDate: '2024-03-01', vacationStartDate: '2024-03-01' };

  it('keeps the start when neither the hire date nor the contract type changes', () => {
    expect(nextVacationStart(payroll, { team: 'Diseño' })).toBe('2024-03-01');
    expect(nextVacationStart(payroll, { hireDate: '2024-03-01', employmentType: 'payroll' })).toBe('2024-03-01');
  });

  it('never moves a start loaded from the sheet just because the form was saved again', () => {
    const fromSheet = { ...payroll, vacationStartDate: '2026-06-15' };
    expect(nextVacationStart(fromSheet, { hireDate: '2024-03-01', employmentType: 'payroll', team: 'Diseño' })).toBe('2026-06-15');
  });

  it('follows a corrected hire date', () => {
    expect(nextVacationStart(payroll, { hireDate: '2024-02-01' })).toBe('2024-02-01');
  });

  it('keeps the start if the hire date is cleared (there is nothing better to put)', () => {
    expect(nextVacationStart(payroll, { hireDate: null })).toBe('2024-03-01');
  });

  it('starts at the hire date the first time a contract type that earns vacations is set', () => {
    expect(nextVacationStart({ hireDate: '2024-03-01' }, { employmentType: 'payroll' })).toBe('2024-03-01');
    expect(nextVacationStart({ employmentType: 'payroll' }, { hireDate: '2024-03-01' })).toBe('2024-03-01');
    expect(nextVacationStart({ employmentType: 'payroll' }, { hireDate: null })).toBeNull();
  });

  it('only changing the contract type keeps a start that already exists', () => {
    const fromSheet = { hireDate: '2023-08-15', vacationStartDate: '2026-06-15' };
    expect(nextVacationStart(fromSheet, { employmentType: 'professional-services' })).toBe('2026-06-15');
  });

  it('stops when the contract no longer earns vacations', () => {
    expect(nextVacationStart(payroll, { employmentType: 'internship' })).toBeNull();
    expect(nextVacationStart(payroll, { employmentType: null })).toBeNull();
  });
});
