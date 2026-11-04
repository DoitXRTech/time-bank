import { ValidationError } from '../../lib/errors';
import { balanceChanges, planBalanceAdjustment } from '../../src/domain/balanceAdjustment';

const CURRENT = { overtime: 132, vacation: 16, holiday: 1, birthday: 0 };

function reasonOf(callback) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return `${error.metadata.field}:${error.metadata.reason}`;
  }
  throw new Error('expected a ValidationError');
}

describe('balanceChanges', () => {
  it('lists only the balances that end up different, with the signed difference', () => {
    const changes = balanceChanges({ overtime: '140', vacation: 16, holiday: '0', birthday: '0' }, CURRENT);

    expect(changes).toEqual([
      { type: 'overtime', amount: 8, from: 132, to: 140 },
      { type: 'holiday', amount: -1, from: 1, to: 0 },
    ]);
  });

  it('skips what is not a number yet (the person is still typing) and what is missing', () => {
    expect(balanceChanges({ overtime: '', vacation: 'abc' }, CURRENT)).toEqual([]);
    expect(balanceChanges({}, CURRENT)).toEqual([]);
    expect(balanceChanges(undefined, CURRENT)).toEqual([]);
  });

  it('handles quarter steps without float noise', () => {
    expect(balanceChanges({ overtime: 132.75 }, CURRENT)).toEqual([{ type: 'overtime', amount: 0.75, from: 132, to: 132.75 }]);
    expect(balanceChanges({ vacation: -1.5 }, CURRENT)[0].amount).toBe(-17.5);
  });
});

describe('planBalanceAdjustment', () => {
  it('plans one change per balance that differs and trims the note', () => {
    const plan = planBalanceAdjustment({ balances: { overtime: '100', vacation: '16' }, note: '  El Excel contó mal 2025  ' }, CURRENT);

    expect(plan).toEqual({ note: 'El Excel contó mal 2025', changes: [{ type: 'overtime', amount: -32, from: 132, to: 100 }] });
  });

  it('only touches the balances that were sent', () => {
    const plan = planBalanceAdjustment({ balances: { birthday: 1 }, note: 'Cumpleaños pendiente' }, CURRENT);

    expect(plan.changes).toEqual([{ type: 'birthday', amount: 1, from: 0, to: 1 }]);
  });

  it('can bring a balance to zero or below it (days taken in advance)', () => {
    const plan = planBalanceAdjustment({ balances: { overtime: 0, vacation: -2 }, note: 'Reinicio' }, CURRENT);

    expect(plan.changes.map(({ type, amount }) => [type, amount])).toEqual([
      ['overtime', -132],
      ['vacation', -18],
    ]);
  });

  it('refuses when nothing would change: there is nothing to record', () => {
    expect(reasonOf(() => planBalanceAdjustment({ balances: { overtime: '132', vacation: 16 }, note: 'x' }, CURRENT))).toBe('balances:NO_CHANGES');
  });

  it('requires a note saying what was done', () => {
    expect(reasonOf(() => planBalanceAdjustment({ balances: { overtime: 1 }, note: '   ' }, CURRENT))).toBe('note:REQUIRED');
    expect(reasonOf(() => planBalanceAdjustment({ balances: { overtime: 1 } }, CURRENT))).toBe('note:REQUIRED');
    expect(reasonOf(() => planBalanceAdjustment({ balances: { overtime: 1 }, note: 'x'.repeat(501) }, CURRENT))).toBe('note:TOO_LONG');
  });

  it.each([
    ['abc', 'INVALID_TYPE'],
    ['', 'INVALID_TYPE'],
    [null, 'INVALID_TYPE'],
    [0.3, 'AMOUNT_NOT_STEP'],
    [5000, 'AMOUNT_TOO_LARGE'],
    [-5000, 'AMOUNT_TOO_LARGE'],
  ])('refuses the value %p for a balance (%s)', (value, reason) => {
    expect(reasonOf(() => planBalanceAdjustment({ balances: { overtime: value }, note: 'x' }, CURRENT))).toBe(`balances.overtime:${reason}`);
  });

  it('refuses a balance that does not exist and a missing or malformed list', () => {
    expect(reasonOf(() => planBalanceAdjustment({ balances: { sabbatical: 3 }, note: 'x' }, CURRENT))).toBe('balances.sabbatical:INVALID_TYPE');
    expect(reasonOf(() => planBalanceAdjustment({ note: 'x' }, CURRENT))).toBe('balances:REQUIRED');
    expect(reasonOf(() => planBalanceAdjustment({ balances: [1, 2], note: 'x' }, CURRENT))).toBe('balances:REQUIRED');
    expect(reasonOf(() => planBalanceAdjustment(undefined, CURRENT))).toBe('balances:REQUIRED');
  });
});
