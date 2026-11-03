// Tailwind classes per balance tone (see balanceTone in domain/balances.js).
// Green is reserved for "positive / active", red for negative; a pending holiday stays neutral.
export const TONE_CLASSES = Object.freeze({
  good: 'text-primary-text',
  spent: 'text-danger-text',
  pending: 'text-ink',
  zero: 'text-ink-soft',
});
