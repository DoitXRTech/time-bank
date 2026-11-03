import {
  isValidIsoDate,
  validateMovementInput,
  validateMovementPatch,
  validateVoidReason,
} from '@/domain/movementValidation';
import { ValidationError } from '../../lib/errors';

const validInput = {
  employeeId: 'e1',
  type: 'overtime',
  amount: 3,
  date: '2026-08-10',
  note: '  Closed the campaign  ',
};

function reasonOf(fn) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error.metadata.reason;
  }
  throw new Error('Expected a ValidationError');
}

describe('validateMovementInput', () => {
  it('returns a normalized movement and trims the note', () => {
    expect(validateMovementInput(validInput)).toEqual({ ...validInput, note: 'Closed the campaign' });
  });

  it('accepts numeric strings for the amount (form inputs)', () => {
    expect(validateMovementInput({ ...validInput, amount: '-1.25' }).amount).toBe(-1.25);
  });

  it('defaults a missing note to an empty string', () => {
    expect(validateMovementInput({ ...validInput, note: undefined }).note).toBe('');
  });

  it.each([
    [{ amount: 0 }, 'AMOUNT_ZERO_OR_INVALID'],
    [{ amount: 'abc' }, 'AMOUNT_ZERO_OR_INVALID'],
    [{ amount: Infinity }, 'AMOUNT_ZERO_OR_INVALID'],
    [{ amount: 0.3 }, 'AMOUNT_NOT_STEP'],
    [{ amount: 1001 }, 'AMOUNT_TOO_LARGE'],
    [{ type: 'bonus' }, 'INVALID_TYPE'],
    [{ employeeId: '' }, 'REQUIRED'],
    [{ date: '2026-02-30' }, 'INVALID_DATE'],
    [{ date: '10/08/2026' }, 'INVALID_DATE'],
    [{ note: 'x'.repeat(501) }, 'TOO_LONG'],
  ])('rejects %j with reason %s', (override, reason) => {
    expect(reasonOf(() => validateMovementInput({ ...validInput, ...override }))).toBe(reason);
  });

  it('rejects a missing body', () => {
    expect(reasonOf(() => validateMovementInput(undefined))).toBe('REQUIRED');
  });
});

describe('validateMovementPatch', () => {
  it('returns only the provided fields, normalized like a new movement', () => {
    expect(validateMovementPatch({ amount: '-1.25', note: '  Fixed  ' })).toEqual({ amount: -1.25, note: 'Fixed' });
    expect(validateMovementPatch({ employeeId: 'e2', type: 'vacation', date: '2026-08-10' })).toEqual({
      employeeId: 'e2',
      type: 'vacation',
      date: '2026-08-10',
    });
  });

  it('lets the note be cleared', () => {
    expect(validateMovementPatch({ note: '' })).toEqual({ note: '' });
  });

  it.each([
    [{ amount: 0 }, 'AMOUNT_ZERO_OR_INVALID'],
    [{ amount: 0.3 }, 'AMOUNT_NOT_STEP'],
    [{ amount: 5000 }, 'AMOUNT_TOO_LARGE'],
    [{ type: 'bonus' }, 'INVALID_TYPE'],
    [{ date: '31/12/2026' }, 'INVALID_DATE'],
    [{ employeeId: '' }, 'REQUIRED'],
    [{ note: 'x'.repeat(501) }, 'TOO_LONG'],
    [{}, 'EMPTY_PATCH'],
    [undefined, 'EMPTY_PATCH'],
  ])('rejects %j with reason %s', (patch, reason) => {
    expect(reasonOf(() => validateMovementPatch(patch))).toBe(reason);
  });
});

describe('isValidIsoDate', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects non-existent days, out-of-range years and non-strings', () => {
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('1999-12-31')).toBe(false);
    expect(isValidIsoDate(20260810)).toBe(false);
  });
});

describe('validateVoidReason', () => {
  it('requires a non-blank reason', () => {
    expect(reasonOf(() => validateVoidReason('   '))).toBe('REQUIRED');
    expect(reasonOf(() => validateVoidReason(undefined))).toBe('REQUIRED');
  });

  it('trims and returns the reason', () => {
    expect(validateVoidReason('  Typo in the amount ')).toBe('Typo in the amount');
  });
});
