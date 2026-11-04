import { EMPLOYMENT_TYPES } from './employmentTypes';

// The monthly vacation day is only for people on the payroll or on professional services: interns
// (and anyone whose contract type is not set yet) do not accrue it
const ACCRUING_TYPES = Object.freeze([EMPLOYMENT_TYPES.PAYROLL, EMPLOYMENT_TYPES.PROFESSIONAL_SERVICES]);

export function accruesVacation(employmentType) {
  return ACCRUING_TYPES.includes(employmentType);
}

/** Who still has an accrual running: a start date and a contract type that earns it */
export function hasVacationAccrual(employee) {
  return Boolean(employee.vacationStartDate) && accruesVacation(employee.employmentType);
}

/**
 * The day vacations start accruing for a new person: their hire date (the only date of the
 * record), as long as their contract type earns them. `null`: no accrual.
 */
export function vacationStartFor({ hireDate, employmentType }) {
  return accruesVacation(employmentType) && hireDate ? hireDate : null;
}

/**
 * The accrual start after editing a person (`before` is the stored record, `patch` what changes):
 * - Nothing about the hire date or the contract type changed: it stays as it is.
 * - The contract type no longer earns vacations: no accrual.
 * - It earns them and there was no start yet: the hire date.
 * - The hire date itself was corrected: the new date (the accrued-months counter is kept, so the
 *   job only tops up and never takes days back).
 * - Only the contract type changed and a start already existed (e.g. loaded from the sheet): it
 *   stays, so a balance that already includes those months is not credited twice.
 * @returns {string|null}
 */
export function nextVacationStart(before, patch) {
  const current = before.vacationStartDate ?? null;
  const hireChanged = 'hireDate' in patch && patch.hireDate !== (before.hireDate ?? null);
  const typeChanged = 'employmentType' in patch && patch.employmentType !== (before.employmentType ?? null);
  if (!hireChanged && !typeChanged) return current;

  const hireDate = 'hireDate' in patch ? patch.hireDate : before.hireDate ?? null;
  const employmentType = 'employmentType' in patch ? patch.employmentType : before.employmentType ?? null;
  if (!accruesVacation(employmentType)) return null;
  if (!current) return hireDate;
  return hireChanged && hireDate ? hireDate : current;
}
