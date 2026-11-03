import { tenureOf } from '@/domain/tenure';

describe('tenureOf', () => {
  it('counts complete years and months since the hire date', () => {
    expect(tenureOf('2023-08-15', '2026-11-02')).toEqual({ years: 3, months: 2 });
    expect(tenureOf('2024-11-02', '2026-11-02')).toEqual({ years: 2, months: 0 });
    expect(tenureOf('2026-06-15', '2026-11-02')).toEqual({ years: 0, months: 4 });
  });

  it('does not round up an incomplete month', () => {
    expect(tenureOf('2026-10-15', '2026-11-02')).toEqual({ years: 0, months: 0 });
  });

  it('is null without a date or with a date in the future', () => {
    expect(tenureOf(null, '2026-11-02')).toBeNull();
    expect(tenureOf('2027-01-01', '2026-11-02')).toBeNull();
  });
});
