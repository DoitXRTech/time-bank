import { ValidationError } from '../../lib/errors';
import { MAX_DATES_PER_BATCH, validateCountryMovementInput } from '../../src/domain/countryMovement';

const valid = { country: 'CR', dates: ['2026-11-19', '2026-11-02'], note: 'Feriados de noviembre' };

function reasonOf(callback) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return `${error.metadata.field}:${error.metadata.reason}`;
  }
  throw new Error('expected a ValidationError');
}

describe('validateCountryMovementInput', () => {
  it('is one day of "Feriados por canjear" per date, with the dates in order', () => {
    expect(validateCountryMovementInput({ ...valid, note: '  Feriados de noviembre ' })).toEqual({
      country: 'CR',
      type: 'holiday',
      amount: 1,
      dates: ['2026-11-02', '2026-11-19'],
      note: 'Feriados de noviembre',
    });
  });

  it('accepts days that are not consecutive and drops a repeated one', () => {
    const { dates } = validateCountryMovementInput({ ...valid, dates: ['2026-11-20', '2026-11-02', '2026-11-20', '2026-12-25'] });
    expect(dates).toEqual(['2026-11-02', '2026-11-20', '2026-12-25']);
  });

  it.each(['CR', 'CO', 'AR', 'EC'])('accepts %s', (country) => {
    expect(validateCountryMovementInput({ ...valid, country }).country).toBe(country);
  });

  it('ignores a type or an amount sent by the client: the number of dates is the number of days', () => {
    const result = validateCountryMovementInput({ ...valid, type: 'overtime', amount: 500 });

    expect(result).toMatchObject({ type: 'holiday', amount: 1 });
  });

  it('requires a country, and one of the four', () => {
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, country: undefined }))).toBe('country:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, country: '' }))).toBe('country:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, country: 'MX' }))).toBe('country:INVALID_COUNTRY');
  });

  it('requires at least one date, each a real one, and not more than a month of them', () => {
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, dates: [] }))).toBe('dates:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, dates: undefined }))).toBe('dates:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, dates: '2026-11-02' }))).toBe('dates:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, dates: ['2026-11-02', '2026-02-30'] }))).toBe('date:INVALID_DATE');

    const tooMany = Array.from({ length: MAX_DATES_PER_BATCH + 1 }, (_, index) => `2026-${index < 28 ? '01' : '02'}-${String((index % 28) + 1).padStart(2, '0')}`);
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, dates: tooMany }))).toBe('dates:TOO_MANY_DATES');
  });

  it('requires a note: it is what explains the movement in everybody\'s history', () => {
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, note: '   ' }))).toBe('note:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, note: undefined }))).toBe('note:REQUIRED');
    expect(reasonOf(() => validateCountryMovementInput({ ...valid, note: 'x'.repeat(501) }))).toBe('note:TOO_LONG');
  });

  it('survives a missing body', () => {
    expect(reasonOf(() => validateCountryMovementInput(undefined))).toBe('note:REQUIRED');
  });
});
