import { validateEmails, validateEmployeePatch, validateNewEmployee } from '@/domain/employeeValidation';
import { ValidationError } from '../../lib/errors';

function reasonOf(fn) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error.metadata.reason;
  }
  throw new Error('Expected a ValidationError');
}

describe('validateEmails', () => {
  it('lowercases, trims and removes duplicates', () => {
    expect(validateEmails([' ANA@Gmail.com ', 'ana@gmail.com', 'ana@effekktive.com'])).toEqual([
      'ana@gmail.com',
      'ana@effekktive.com',
    ]);
  });

  it.each([
    [undefined, 'REQUIRED'],
    [[], 'REQUIRED'],
    ['ana@x.com', 'REQUIRED'],
    [['not-an-email'], 'INVALID_EMAIL'],
    [['ana@x.com', ''], 'INVALID_EMAIL'],
    [[42], 'INVALID_EMAIL'],
    [['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'], 'TOO_MANY_EMAILS'],
  ])('rejects %j with reason %s', (emails, reason) => {
    expect(reasonOf(() => validateEmails(emails))).toBe(reason);
  });

  it('counts the limit after removing duplicates', () => {
    expect(validateEmails(['a@x.com', 'a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'])).toHaveLength(5);
  });
});

describe('validateNewEmployee', () => {
  it('normalizes the emails and defaults the role to member', () => {
    expect(
      validateNewEmployee({ name: ' Ana Salas ', jobTitle: 'Diseñadora', emails: [' ANA@Effekktive.com '] }),
    ).toEqual({
      name: 'Ana Salas',
      jobTitle: 'Diseñadora',
      emails: ['ana@effekktive.com'],
      role: 'member',
      team: '',
      hireDate: null,
      socialSecurityDate: null,
      employmentType: null,
      scheduleStart: '',
      scheduleEnd: '',
      vacationStartDate: null,
      creditPastMonths: false,
    });
  });

  it('reads the employee record: team, hire dates, employment type and schedule', () => {
    const record = validateNewEmployee({
      name: 'Ana',
      emails: ['ana@x.com'],
      team: ' Diseño ',
      hireDate: '2023-08-15',
      socialSecurityDate: '2025-02-15',
      employmentType: 'payroll',
      scheduleStart: '8:00 am ',
      scheduleEnd: '5:00 pm',
    });
    expect(record).toMatchObject({ team: 'Diseño', hireDate: '2023-08-15', socialSecurityDate: '2025-02-15', employmentType: 'payroll', scheduleStart: '8:00 am', scheduleEnd: '5:00 pm' });
  });

  it('treats empty record fields as not set and rejects invalid ones', () => {
    const base = { name: 'Ana', emails: ['ana@x.com'] };
    expect(validateNewEmployee({ ...base, hireDate: '', socialSecurityDate: '', employmentType: '' })).toMatchObject({ hireDate: null, socialSecurityDate: null, employmentType: null });
    expect(reasonOf(() => validateNewEmployee({ ...base, hireDate: '2023-02-30' }))).toBe('INVALID_DATE');
    expect(reasonOf(() => validateNewEmployee({ ...base, socialSecurityDate: '15/02/2025' }))).toBe('INVALID_DATE');
    expect(reasonOf(() => validateNewEmployee({ ...base, employmentType: 'freelance' }))).toBe('INVALID_EMPLOYMENT_TYPE');
    expect(reasonOf(() => validateNewEmployee({ ...base, team: 'x'.repeat(61) }))).toBe('TOO_LONG');
    expect(reasonOf(() => validateNewEmployee({ ...base, scheduleStart: 'x'.repeat(61) }))).toBe('TOO_LONG');
  });

  it('reads an optional vacation start date (empty means none) and the credit-past-months choice', () => {
    const base = { name: 'Ana', emails: ['ana@x.com'] };
    expect(validateNewEmployee({ ...base, vacationStartDate: '2025-01-01', creditPastMonths: true })).toMatchObject({ vacationStartDate: '2025-01-01', creditPastMonths: true });
    expect(validateNewEmployee({ ...base, vacationStartDate: '' }).vacationStartDate).toBeNull();
    expect(reasonOf(() => validateNewEmployee({ ...base, vacationStartDate: '2025-02-30' }))).toBe('INVALID_DATE');
    expect(reasonOf(() => validateNewEmployee({ ...base, creditPastMonths: 'yes' }))).toBe('INVALID_TYPE');
  });

  it('defaults a missing job title to an empty string', () => {
    expect(validateNewEmployee({ name: 'Ana', emails: ['ana@x.com'] }).jobTitle).toBe('');
  });

  it.each([
    [{ name: '' }, 'REQUIRED'],
    [{ emails: ['bad'] }, 'INVALID_EMAIL'],
    [{ emails: [] }, 'REQUIRED'],
    [{ role: 'owner' }, 'INVALID_ROLE'],
    [{ name: 'x'.repeat(101) }, 'TOO_LONG'],
  ])('rejects %j with reason %s', (override, reason) => {
    expect(reasonOf(() => validateNewEmployee({ name: 'Ana', emails: ['ana@x.com'], ...override }))).toBe(reason);
  });
});

describe('validateEmployeePatch', () => {
  it('returns only the provided fields', () => {
    expect(validateEmployeePatch({ active: false })).toEqual({ active: false });
    expect(validateEmployeePatch({ name: ' Luis ', role: 'admin' })).toEqual({ name: 'Luis', role: 'admin' });
  });

  it('accepts changes to the employee record, including clearing a date', () => {
    expect(validateEmployeePatch({ team: 'Marketing', hireDate: '2024-02-08', employmentType: 'professional-services' })).toEqual({ team: 'Marketing', hireDate: '2024-02-08', employmentType: 'professional-services' });
    expect(validateEmployeePatch({ socialSecurityDate: null, employmentType: null, scheduleEnd: '' })).toEqual({ socialSecurityDate: null, employmentType: null, scheduleEnd: '' });
    expect(reasonOf(() => validateEmployeePatch({ employmentType: 'other' }))).toBe('INVALID_EMPLOYMENT_TYPE');
  });

  it('accepts a start date, a cleared start date and the credit choice', () => {
    expect(validateEmployeePatch({ vacationStartDate: '2025-01-01', creditPastMonths: false })).toEqual({ vacationStartDate: '2025-01-01', creditPastMonths: false });
    expect(validateEmployeePatch({ vacationStartDate: null })).toEqual({ vacationStartDate: null });
    expect(reasonOf(() => validateEmployeePatch({ vacationStartDate: '31/12/2026' }))).toBe('INVALID_DATE');
  });

  it('validates a replacement email list', () => {
    expect(validateEmployeePatch({ emails: ['A@x.com', 'b@y.com'] })).toEqual({ emails: ['a@x.com', 'b@y.com'] });
    expect(reasonOf(() => validateEmployeePatch({ emails: [] }))).toBe('REQUIRED');
  });

  it('rejects an empty patch and non-boolean active', () => {
    expect(reasonOf(() => validateEmployeePatch({}))).toBe('EMPTY_PATCH');
    expect(reasonOf(() => validateEmployeePatch({ active: 'no' }))).toBe('INVALID_TYPE');
  });
});
