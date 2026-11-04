import { ValidationError } from '../../lib/errors';
import { movementFromRequest, validateDecisionReason, validateRequestInput } from '../../src/domain/requestValidation';

const TODAY = '2026-11-03';

function reasonOf(callback) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return `${error.metadata.field}:${error.metadata.reason}`;
  }
  throw new Error('expected a ValidationError');
}

describe('validateRequestInput: overtime of a finished month', () => {
  const overtime = { kind: 'overtime', month: '2026-10', amount: '5.5', note: '  Cierre de campaña ' };

  it('dates the request on the last day of the reported month and trims the note', () => {
    expect(validateRequestInput(overtime, TODAY)).toEqual({
      kind: 'overtime',
      action: 'report',
      amount: 5.5,
      date: '2026-10-31',
      period: '2026-10',
      note: 'Cierre de campaña',
    });
  });

  it('uses the real last day of short months and leap years', () => {
    expect(validateRequestInput({ ...overtime, month: '2026-02' }, TODAY).date).toBe('2026-02-28');
    expect(validateRequestInput({ ...overtime, month: '2024-02' }, TODAY).date).toBe('2024-02-29');
  });

  it('accepts an older month (late reports happen), but never the current or a future one', () => {
    expect(validateRequestInput({ ...overtime, month: '2025-12' }, TODAY).date).toBe('2025-12-31');
    expect(reasonOf(() => validateRequestInput({ ...overtime, month: '2026-11' }, TODAY))).toBe('month:MONTH_NOT_FINISHED');
    expect(reasonOf(() => validateRequestInput({ ...overtime, month: '2027-01' }, TODAY))).toBe('month:MONTH_NOT_FINISHED');
  });

  it.each(['2026-13', '2026-00', '2026-1', '2026-10-15', '', undefined, 202610])('rejects the month %p', (month) => {
    expect(reasonOf(() => validateRequestInput({ ...overtime, month }, TODAY))).toBe('month:INVALID_MONTH');
  });

  it('ignores a start date: overtime is about a month', () => {
    expect(validateRequestInput({ ...overtime, date: '1999-01-01' }, TODAY).date).toBe('2026-10-31');
  });
});

describe('validateRequestInput: vacation days', () => {
  const vacation = { kind: 'vacation', date: '2026-11-17', amount: 3 };

  it('keeps the first day as the date and has no period', () => {
    expect(validateRequestInput(vacation, TODAY)).toEqual({
      kind: 'vacation',
      action: 'redeem',
      amount: 3,
      date: '2026-11-17',
      period: null,
      note: '',
    });
  });

  it('allows a first day in the past (days already taken but never reported)', () => {
    expect(validateRequestInput({ ...vacation, date: '2026-10-05' }, TODAY).date).toBe('2026-10-05');
  });

  it.each(['2026-02-30', '17/11/2026', '', undefined])('rejects the date %p', (date) => {
    expect(reasonOf(() => validateRequestInput({ ...vacation, date }, TODAY))).toBe('date:INVALID_DATE');
  });
});

describe('validateRequestInput: what both kinds share', () => {
  const vacation = { kind: 'vacation', date: '2026-11-17', amount: 1 };

  it('rejects an unknown kind', () => {
    expect(reasonOf(() => validateRequestInput({ ...vacation, kind: 'sabbatical' }, TODAY))).toBe('kind:INVALID_TYPE');
    expect(reasonOf(() => validateRequestInput({ ...vacation, kind: undefined }, TODAY))).toBe('kind:INVALID_TYPE');
  });

  it('asks for something: zero or negative amounts are refused, so a request can never take hours away', () => {
    expect(reasonOf(() => validateRequestInput({ ...vacation, amount: 0 }, TODAY))).toBe('amount:AMOUNT_ZERO_OR_INVALID');
    expect(reasonOf(() => validateRequestInput({ ...vacation, amount: -2 }, TODAY))).toBe('amount:AMOUNT_NOT_POSITIVE');
    expect(reasonOf(() => validateRequestInput({ ...vacation, amount: 'abc' }, TODAY))).toBe('amount:AMOUNT_ZERO_OR_INVALID');
  });

  it('keeps the quarter-step and size limits of a movement', () => {
    expect(reasonOf(() => validateRequestInput({ ...vacation, amount: 0.3 }, TODAY))).toBe('amount:AMOUNT_NOT_STEP');
    expect(reasonOf(() => validateRequestInput({ ...vacation, amount: 5000 }, TODAY))).toBe('amount:AMOUNT_TOO_LARGE');
  });

  it('refuses a note that is too long', () => {
    expect(reasonOf(() => validateRequestInput({ ...vacation, note: 'x'.repeat(501) }, TODAY))).toBe('note:TOO_LONG');
  });

  it('survives a missing body', () => {
    expect(reasonOf(() => validateRequestInput(undefined, TODAY))).toBe('kind:INVALID_TYPE');
  });
});

describe('validateRequestInput: redeeming a balance on a day', () => {
  it.each([
    ['overtime', 4],
    ['vacation', 2],
    ['holiday', 1],
    ['birthday', 1],
  ])('accepts redeeming %s on a specific day', (kind, amount) => {
    expect(validateRequestInput({ kind, action: 'redeem', date: '2026-11-20', amount, note: ' Puente ' }, TODAY)).toEqual({
      kind,
      action: 'redeem',
      amount,
      date: '2026-11-20',
      period: null,
      note: 'Puente',
    });
  });

  it('a redeem needs the day it is taken, not a month', () => {
    const redeem = { kind: 'holiday', action: 'redeem', amount: 1 };
    expect(reasonOf(() => validateRequestInput({ ...redeem, month: '2026-10' }, TODAY))).toBe('date:INVALID_DATE');
    expect(reasonOf(() => validateRequestInput({ ...redeem, date: '2026-02-30' }, TODAY))).toBe('date:INVALID_DATE');
  });

  it('overtime can be redeemed as well as reported: the action decides what the fields mean', () => {
    const report = validateRequestInput({ kind: 'overtime', action: 'report', month: '2026-10', amount: 3 }, TODAY);
    const redeem = validateRequestInput({ kind: 'overtime', action: 'redeem', date: '2026-11-20', amount: 3 }, TODAY);

    expect(report).toMatchObject({ action: 'report', date: '2026-10-31', period: '2026-10' });
    expect(redeem).toMatchObject({ action: 'redeem', date: '2026-11-20', period: null });
  });

  it.each(['vacation', 'holiday', 'birthday'])('only worked hours can be reported: %s cannot', (kind) => {
    expect(reasonOf(() => validateRequestInput({ kind, action: 'report', month: '2026-10', amount: 1 }, TODAY))).toBe('action:INVALID_TYPE');
  });

  it('rejects an unknown action', () => {
    expect(reasonOf(() => validateRequestInput({ kind: 'overtime', action: 'donate', date: '2026-11-20', amount: 1 }, TODAY))).toBe('action:INVALID_TYPE');
  });

  it('a request without an action means what it always meant (an older client): overtime is a report, the rest a day taken', () => {
    expect(validateRequestInput({ kind: 'overtime', month: '2026-10', amount: 2 }, TODAY).action).toBe('report');
    expect(validateRequestInput({ kind: 'vacation', date: '2026-11-17', amount: 2 }, TODAY).action).toBe('redeem');
  });
});

describe('validateDecisionReason', () => {
  it('trims the reason and requires one', () => {
    expect(validateDecisionReason('  Ya hay dos personas de vacaciones ')).toBe('Ya hay dos personas de vacaciones');
    expect(reasonOf(() => validateDecisionReason('   '))).toBe('reason:REQUIRED');
    expect(reasonOf(() => validateDecisionReason(undefined))).toBe('reason:REQUIRED');
  });

  it('limits its length', () => {
    expect(reasonOf(() => validateDecisionReason('x'.repeat(301)))).toBe('reason:TOO_LONG');
  });
});

describe('movementFromRequest', () => {
  const base = { employeeId: 'e1', amount: 4, date: '2026-10-31', note: 'Cierre' };

  it('an approved report adds the hours to the bank', () => {
    expect(movementFromRequest({ ...base, kind: 'overtime', action: 'report' })).toEqual({
      employeeId: 'e1',
      type: 'overtime',
      amount: 4,
      date: '2026-10-31',
      note: 'Cierre',
    });
  });

  it('an approved vacation takes the days out of the balance', () => {
    expect(movementFromRequest({ ...base, kind: 'vacation', action: 'redeem', date: '2026-11-17' })).toMatchObject({ type: 'vacation', amount: -4, date: '2026-11-17' });
  });

  it.each([
    ['overtime', 'horas'],
    ['holiday', 'feriado'],
    ['birthday', 'cumpleaños'],
  ])('an approved redeem of %s subtracts it from that balance, on the day it is taken', (kind) => {
    expect(movementFromRequest({ ...base, kind, action: 'redeem', amount: 1, date: '2026-11-20' })).toEqual({
      employeeId: 'e1',
      type: kind,
      amount: -1,
      date: '2026-11-20',
      note: 'Cierre',
    });
  });

  it('a request stored before redeeming existed still becomes the movement it always was', () => {
    expect(movementFromRequest({ ...base, kind: 'overtime' }).amount).toBe(4);
    expect(movementFromRequest({ ...base, kind: 'vacation' }).amount).toBe(-4);
  });
});
