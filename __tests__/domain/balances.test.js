import { balanceTone, computeBalances, emptyBalances, normalizeBalances } from '@/domain/balances';

describe('computeBalances', () => {
  it('sums signed amounts per type', () => {
    const balances = computeBalances([
      { type: 'overtime', amount: 6 },
      { type: 'overtime', amount: -2 },
      { type: 'vacation', amount: 1.25 },
      { type: 'holiday', amount: 1 },
    ]);
    expect(balances).toEqual({ overtime: 4, vacation: 1.25, holiday: 1, birthday: 0 });
  });

  it('ignores voided movements', () => {
    const balances = computeBalances([
      { type: 'overtime', amount: 6 },
      { type: 'overtime', amount: 10, voidedAt: '2026-09-01T10:00:00.000Z' },
    ]);
    expect(balances.overtime).toBe(6);
  });

  it('ignores movements with an unknown type', () => {
    expect(computeBalances([{ type: 'bonus', amount: 5 }])).toEqual(emptyBalances());
  });

  it('keeps quarter steps exact after many additions', () => {
    const movements = Array.from({ length: 400 }, () => ({ type: 'overtime', amount: 0.25 }));
    expect(computeBalances(movements).overtime).toBe(100);
  });

  it('returns zeros for an employee without movements', () => {
    expect(computeBalances([])).toEqual({ overtime: 0, vacation: 0, holiday: 0, birthday: 0 });
  });
});

describe('normalizeBalances', () => {
  it('fills missing or invalid keys with zero', () => {
    expect(normalizeBalances({ overtime: 3, vacation: 'x' })).toEqual({ overtime: 3, vacation: 0, holiday: 0, birthday: 0 });
    expect(normalizeBalances(undefined)).toEqual(emptyBalances());
  });
});

describe('balanceTone', () => {
  it('uses good/spent/zero for overtime and vacation', () => {
    expect(balanceTone('overtime', 2)).toBe('good');
    expect(balanceTone('vacation', -1)).toBe('spent');
    expect(balanceTone('overtime', 0)).toBe('zero');
  });

  it('marks a positive holiday balance as pending and never as spent', () => {
    expect(balanceTone('holiday', 1)).toBe('pending');
    expect(balanceTone('holiday', -1)).toBe('zero');
    expect(balanceTone('holiday', 0)).toBe('zero');
  });
});
