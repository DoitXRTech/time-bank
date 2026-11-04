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
  const base = { name: 'Ana', emails: ['ana@x.com'], country: 'CR' };

  it('normalizes the emails and defaults the role to member', () => {
    expect(
      validateNewEmployee({ name: ' Ana Salas ', jobTitle: 'Diseñadora', emails: [' ANA@Effekktive.com '], country: 'CO' }),
    ).toEqual({
      name: 'Ana Salas',
      jobTitle: 'Diseñadora',
      emails: ['ana@effekktive.com'],
      role: 'member',
      country: 'CO',
      team: '',
      hireDate: null,
      employmentType: null,
      scheduleStart: '',
      scheduleEnd: '',
      creditPastMonths: false,
    });
  });

  it('reads the employee record: country, team, hire date, employment type and schedule', () => {
    const record = validateNewEmployee({
      ...base,
      country: 'AR',
      team: ' Diseño ',
      hireDate: '2023-08-15',
      employmentType: 'payroll',
      scheduleStart: '8:00 am ',
      scheduleEnd: '5:00 pm',
    });
    expect(record).toMatchObject({ country: 'AR', team: 'Diseño', hireDate: '2023-08-15', employmentType: 'payroll', scheduleStart: '8:00 am', scheduleEnd: '5:00 pm' });
  });

  it('requires a country, one of the four the company works from', () => {
    expect(reasonOf(() => validateNewEmployee({ name: 'Ana', emails: ['ana@x.com'] }))).toBe('REQUIRED');
    expect(reasonOf(() => validateNewEmployee({ ...base, country: '' }))).toBe('REQUIRED');
    expect(reasonOf(() => validateNewEmployee({ ...base, country: 'MX' }))).toBe('INVALID_COUNTRY');
    ['CR', 'CO', 'AR', 'EC'].forEach((country) => expect(validateNewEmployee({ ...base, country }).country).toBe(country));
  });

  it('treats empty record fields as not set and rejects invalid ones', () => {
    expect(validateNewEmployee({ ...base, hireDate: '', employmentType: '' })).toMatchObject({ hireDate: null, employmentType: null });
    expect(reasonOf(() => validateNewEmployee({ ...base, hireDate: '2023-02-30' }))).toBe('INVALID_DATE');
    expect(reasonOf(() => validateNewEmployee({ ...base, employmentType: 'freelance' }))).toBe('INVALID_EMPLOYMENT_TYPE');
    expect(reasonOf(() => validateNewEmployee({ ...base, team: 'x'.repeat(61) }))).toBe('TOO_LONG');
    expect(reasonOf(() => validateNewEmployee({ ...base, scheduleStart: 'x'.repeat(61) }))).toBe('TOO_LONG');
  });

  it('reads the credit-past-months choice, and ignores a vacation start or a Caja date sent by a client', () => {
    expect(validateNewEmployee({ ...base, creditPastMonths: true }).creditPastMonths).toBe(true);
    expect(reasonOf(() => validateNewEmployee({ ...base, creditPastMonths: 'yes' }))).toBe('INVALID_TYPE');

    const record = validateNewEmployee({ ...base, vacationStartDate: '2020-01-01', socialSecurityDate: '2020-02-02' });
    expect(record).not.toHaveProperty('vacationStartDate');
    expect(record).not.toHaveProperty('socialSecurityDate');
  });

  it('defaults a missing job title to an empty string', () => {
    expect(validateNewEmployee(base).jobTitle).toBe('');
  });

  it.each([
    [{ name: '' }, 'REQUIRED'],
    [{ emails: ['bad'] }, 'INVALID_EMAIL'],
    [{ emails: [] }, 'REQUIRED'],
    [{ role: 'owner' }, 'INVALID_ROLE'],
    [{ name: 'x'.repeat(101) }, 'TOO_LONG'],
  ])('rejects %j with reason %s', (override, reason) => {
    expect(reasonOf(() => validateNewEmployee({ ...base, ...override }))).toBe(reason);
  });
});

describe('validateEmployeePatch', () => {
  it('returns only the provided fields', () => {
    expect(validateEmployeePatch({ active: false })).toEqual({ active: false });
    expect(validateEmployeePatch({ name: ' Luis ', role: 'admin' })).toEqual({ name: 'Luis', role: 'admin' });
  });

  it('accepts changes to the employee record, including clearing a date', () => {
    expect(validateEmployeePatch({ team: 'Marketing', hireDate: '2024-02-08', employmentType: 'professional-services' })).toEqual({ team: 'Marketing', hireDate: '2024-02-08', employmentType: 'professional-services' });
    expect(validateEmployeePatch({ hireDate: null, employmentType: null, scheduleEnd: '' })).toEqual({ hireDate: null, employmentType: null, scheduleEnd: '' });
    expect(reasonOf(() => validateEmployeePatch({ employmentType: 'other' }))).toBe('INVALID_EMPLOYMENT_TYPE');
  });

  it('accepts a valid country but never an empty or unknown one', () => {
    expect(validateEmployeePatch({ country: 'EC' })).toEqual({ country: 'EC' });
    expect(reasonOf(() => validateEmployeePatch({ country: 'MX' }))).toBe('INVALID_COUNTRY');
    expect(reasonOf(() => validateEmployeePatch({ country: '' }))).toBe('REQUIRED');
  });

  it('accepts the credit choice, and ignores a vacation start sent by a client (it comes from the hire date)', () => {
    expect(validateEmployeePatch({ team: 'Marketing', creditPastMonths: false })).toEqual({ team: 'Marketing', creditPastMonths: false });
    expect(reasonOf(() => validateEmployeePatch({ vacationStartDate: '2025-01-01' }))).toBe('EMPTY_PATCH');
    expect(reasonOf(() => validateEmployeePatch({ socialSecurityDate: '2025-01-01' }))).toBe('EMPTY_PATCH');
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
