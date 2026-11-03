import { MOVEMENT_TYPES, MOVEMENT_TYPE_LIST } from './movementTypes';

export function emptyBalances() {
  return Object.fromEntries(MOVEMENT_TYPE_LIST.map((type) => [type, 0]));
}

/**
 * Employee docs written before a type existed (or partially written) may miss keys.
 * Always read balances through this so the UI never renders `undefined`.
 */
export function normalizeBalances(balances) {
  const normalized = emptyBalances();
  for (const type of MOVEMENT_TYPE_LIST) {
    const value = balances?.[type];
    if (Number.isFinite(value)) normalized[type] = value;
  }
  return normalized;
}

/**
 * The balance of an employee is always the sum of their movements.
 * Voided movements are kept for audit but never count.
 */
export function computeBalances(movements) {
  const balances = emptyBalances();
  for (const movement of movements) {
    if (movement.voidedAt) continue;
    if (!(movement.type in balances)) continue;
    balances[movement.type] += movement.amount;
  }
  return balances;
}

/**
 * Visual tone of a balance. Holidays are never "spent" red: a positive holiday balance
 * is a pending exchange, and zero is neutral.
 */
export function balanceTone(type, value) {
  if (type === MOVEMENT_TYPES.HOLIDAY) return value > 0 ? 'pending' : 'zero';
  if (value > 0) return 'good';
  if (value < 0) return 'spent';
  return 'zero';
}
