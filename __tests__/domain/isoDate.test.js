import { isValidIsoMonth, lastDayOfMonth, previousIsoMonth, recentFinishedMonths } from '@/domain/isoDate';

describe('isValidIsoMonth', () => {
  it('accepts a real month and rejects anything else', () => {
    expect(isValidIsoMonth('2026-10')).toBe(true);
    expect(isValidIsoMonth('2026-12')).toBe(true);
    ['2026-00', '2026-13', '2026-1', '1999-12', '2026-10-01', '', null, 202610].forEach((value) => {
      expect(isValidIsoMonth(value)).toBe(false);
    });
  });
});

describe('lastDayOfMonth', () => {
  it('knows the length of every kind of month', () => {
    expect(lastDayOfMonth('2026-01')).toBe('2026-01-31');
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
});

describe('previousIsoMonth', () => {
  it('goes back one month, across the year boundary too', () => {
    expect(previousIsoMonth('2026-11-03')).toBe('2026-10');
    expect(previousIsoMonth('2026-01-31')).toBe('2025-12');
  });
});

describe('recentFinishedMonths', () => {
  it('lists the months that already ended, most recent first, never the current one', () => {
    expect(recentFinishedMonths('2026-02-10', 4)).toEqual(['2026-01', '2025-12', '2025-11', '2025-10']);
  });
});
