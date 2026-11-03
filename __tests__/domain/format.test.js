import { formatAmount, formatDate, formatMonth, formatSignedAmount, todayIsoDate } from '@/domain/format';

describe('formatAmount', () => {
  it('shows an amount with its unit and no sign (for what is only being asked for)', () => {
    expect(formatAmount(5, 'h')).toBe('5 h');
    expect(formatAmount(2.5, 'd')).toBe('2.5 d');
    expect(formatAmount(0.25, 'h')).toBe('0.25 h');
  });
});

describe('formatMonth', () => {
  it('names the month and the year without shifting the month by the timezone', () => {
    const text = formatMonth('2026-10');
    expect(text).toContain('2026');
    expect(text.toLowerCase()).toContain('octubre');
  });
});

describe('formatSignedAmount', () => {
  it('prefixes positives with + and negatives with a real minus sign', () => {
    expect(formatSignedAmount(6, 'h')).toBe('+6 h');
    expect(formatSignedAmount(-2, 'h')).toBe('−2 h');
  });

  it('shows zero without a sign', () => {
    expect(formatSignedAmount(0, 'd')).toBe('0 d');
  });

  it('trims trailing zeros on fractions', () => {
    expect(formatSignedAmount(1.25, 'd')).toBe('+1.25 d');
    expect(formatSignedAmount(0.5, 'h')).toBe('+0.5 h');
    expect(formatSignedAmount(-0.75, 'h')).toBe('−0.75 h');
  });
});

describe('formatDate', () => {
  it('does not shift the day because of the timezone', () => {
    expect(formatDate('2026-08-10')).toContain('10');
    expect(formatDate('2026-08-10')).toContain('2026');
  });
});

describe('todayIsoDate', () => {
  it('pads month and day', () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
