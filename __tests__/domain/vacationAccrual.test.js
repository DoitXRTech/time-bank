import { accrualDate, completedMonths, monthsToCredit } from '@/domain/vacationAccrual';

describe('completedMonths (same as the sheet: DATEDIF(start, today, "m"))', () => {
  it.each([
    ['2025-01-01', '2026-11-02', 22],
    ['2025-02-15', '2026-11-02', 20],
    ['2025-02-15', '2026-11-15', 21],
    ['2025-02-15', '2026-11-14', 20],
    ['2026-06-15', '2026-11-02', 4],
    ['2026-08-26', '2026-11-02', 2],
    ['2024-08-02', '2026-11-02', 27],
  ])('%s -> %s is %d months', (start, today, expected) => {
    expect(completedMonths(start, today)).toBe(expected);
  });

  it('is zero before the first month is complete and for a start date in the future', () => {
    expect(completedMonths('2026-11-02', '2026-11-02')).toBe(0);
    expect(completedMonths('2026-11-02', '2026-12-01')).toBe(0);
    expect(completedMonths('2026-12-01', '2026-11-02')).toBe(0);
  });

  it('does not complete a month early when the start day is 31 and the next month is shorter', () => {
    expect(completedMonths('2026-01-31', '2026-02-28')).toBe(0);
    expect(completedMonths('2026-01-31', '2026-03-01')).toBe(1);
    expect(completedMonths('2026-01-31', '2026-03-31')).toBe(2);
  });
});

describe('accrualDate', () => {
  it('is the same day of the month, n months later', () => {
    expect(accrualDate('2025-02-15', 1)).toBe('2025-03-15');
    expect(accrualDate('2025-02-15', 12)).toBe('2026-02-15');
    expect(accrualDate('2025-11-20', 2)).toBe('2026-01-20');
  });

  it('falls on the 1st of the next month when the month is too short', () => {
    expect(accrualDate('2026-01-31', 1)).toBe('2026-03-01');
    expect(accrualDate('2025-12-31', 2)).toBe('2026-03-01');
    expect(accrualDate('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('is exactly the first day on which month n counts as complete (consistent with completedMonths)', () => {
    const starts = ['2025-01-01', '2025-01-29', '2025-01-30', '2025-01-31', '2024-02-29', '2025-08-31', '2025-12-31'];
    starts.forEach((start) => {
      for (let month = 1; month <= 30; month += 1) {
        const date = accrualDate(start, month);
        const dayBefore = new Date(`${date}T12:00:00Z`);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

        expect(completedMonths(start, date)).toBeGreaterThanOrEqual(month);
        expect(completedMonths(start, dayBefore.toISOString().slice(0, 10))).toBeLessThan(month);
      }
    });
  });
});

describe('monthsToCredit', () => {
  it('lists every month after the already credited ones, each with its date', () => {
    expect(monthsToCredit('2026-06-15', '2026-11-02', 0)).toEqual([
      { month: 1, date: '2026-07-15' },
      { month: 2, date: '2026-08-15' },
      { month: 3, date: '2026-09-15' },
      { month: 4, date: '2026-10-15' },
    ]);
    expect(monthsToCredit('2026-06-15', '2026-11-02', 3)).toEqual([{ month: 4, date: '2026-10-15' }]);
  });

  it('is empty when everything is already credited (or more was credited by hand)', () => {
    expect(monthsToCredit('2026-06-15', '2026-11-02', 4)).toEqual([]);
    expect(monthsToCredit('2026-06-15', '2026-11-02', 10)).toEqual([]);
  });
});
