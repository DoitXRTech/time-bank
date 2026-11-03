import { completedMonths } from './vacationAccrual';

/**
 * Time since a hire date, in complete years and months (same month rule as the vacation accrual).
 * `null` when there is no date or it is in the future.
 * @returns {{ years: number, months: number }|null}
 */
export function tenureOf(hireDate, today) {
  if (!hireDate || hireDate > today) return null;
  const totalMonths = completedMonths(hireDate, today);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}
