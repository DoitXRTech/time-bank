import { completedMonths } from '../vacationAccrual.js';
import { normalizeName, suggestNameMatch } from './nameMatching.js';

const OPENING_BALANCE_TYPE = 'vacation';

function resolveMapping(rawName, nameMapping) {
  const key = Object.keys(nameMapping).find((candidate) => normalizeName(candidate) === normalizeName(rawName));
  return key ? nameMapping[key] : undefined;
}

/**
 * Decides, for every name written in the overtime tab, which person of the vacations tab it is.
 * Only identical names and names confirmed in `nameMapping` are applied; fuzzy matches are
 * returned as suggestions so a human confirms them (a wrong match would credit someone else's hours).
 */
function resolveNames(rawNames, knownNames, nameMapping, issues) {
  const resolved = new Map();
  const unresolved = [];

  rawNames.forEach((rawName) => {
    const mapped = resolveMapping(rawName, nameMapping);
    if (mapped !== undefined) {
      if (knownNames.includes(mapped)) resolved.set(rawName, mapped);
      else issues.push({ code: 'MAPPING_TARGET_UNKNOWN', name: rawName, detail: `"${mapped}" is not a person of the vacations tab` });
      return;
    }

    const suggestion = suggestNameMatch(rawName, knownNames);
    if (suggestion.confidence === 'exact') resolved.set(rawName, suggestion.match);
    else unresolved.push({ rawName, ...suggestion });
  });

  return { resolved, unresolved };
}

/**
 * Finds, for each person, the date their vacations accrue from. The sheet's formula counts months
 * from one of two dates chosen by hand per row, so the candidate that reproduces the sheet's total
 * on the day of the import is the one used (this also proves the 1-day-per-complete-month rule
 * against the real data). People without a numeric total (interns) do not accrue.
 * When no candidate reproduces the total, no start date is set and the case is reported.
 */
export function resolveAccrualStarts(employees, date) {
  const issues = [];
  const startDates = new Map();

  employees.forEach((employee) => {
    if (employee.total === null) return;

    const match = employee.startDateCandidates.find((candidate) => completedMonths(candidate, date) === employee.total);
    if (match) {
      startDates.set(employee.sourceRow, match);
      return;
    }

    const tried = employee.startDateCandidates.map((candidate) => `${candidate} -> ${completedMonths(candidate, date)}`).join(', ');
    issues.push({
      code: 'ACCRUAL_START_UNRESOLVED',
      row: employee.sourceRow,
      name: employee.name,
      detail: `no start date gives the sheet's total of ${employee.total} months at ${date} (${tried || 'no dates in the row'}): set it by hand`,
    });
  });

  return { startDates, issues };
}

/**
 * Combines the parsed tabs into what would be written: people, movements and everything that
 * needs a human decision. Pure: nothing here touches the database.
 *
 * The vacation figures of the sheet are formulas over TODAY(), so they are current at the moment
 * of the export: `openingDate` (the day of the import) dates the opening balances. The date in the
 * sheet's header ("... al 30/07/2026") is only a stale label, kept as `sheetHeaderDate`.
 *
 * @param {{ vacations: object, overtime: object, nameMapping?: Record<string, string>, openingDate?: string }} input
 */
export function buildImportPlan({ vacations, overtime, nameMapping = {}, openingDate }) {
  const vacationDate = openingDate ?? vacations.cutoffDate;
  const accrual = resolveAccrualStarts(vacations.employees, vacationDate);
  const issues = [...vacations.issues, ...overtime.issues, ...accrual.issues];
  const knownNames = vacations.employees.map((employee) => employee.name);

  // People come from `people` (not from the movements) so someone whose rows were all dropped is still matched
  const rawNames = overtime.people.map((person) => person.name);
  const { resolved, unresolved } = resolveNames(rawNames, knownNames, nameMapping, issues);

  const movements = [];
  const skippedByName = new Map();

  overtime.movements.forEach((movement) => {
    const employeeName = resolved.get(movement.employeeName);
    if (!employeeName) {
      skippedByName.set(movement.employeeName, (skippedByName.get(movement.employeeName) ?? 0) + 1);
      return;
    }
    movements.push({ ...movement, employeeName, sheetName: movement.employeeName });
  });

  vacations.employees.forEach((employee) => {
    if (!employee.available) return;
    movements.push({
      employeeName: employee.name,
      type: OPENING_BALANCE_TYPE,
      amount: employee.available,
      date: vacationDate,
      dateKind: 'exact',
      note: 'Saldo inicial importado',
      importKey: `vacations:${employee.sourceRow}`,
    });
  });

  const unresolvedWithCounts = unresolved.map((entry) => ({ ...entry, movementCount: skippedByName.get(entry.rawName) ?? 0 }));

  // Imported overtime per person, next to the sheet's own final balance, to spot differences
  const reconciliation = overtime.people.map((person) => ({
    ...person,
    employeeName: resolved.get(person.name) ?? null,
    matches: person.sheetBalance === null || Math.abs(person.importedSum - person.sheetBalance) < 1e-9,
  }));

  return {
    employees: vacations.employees.map(({ name, team, sourceRow }) => ({ name, team, vacationStartDate: accrual.startDates.get(sourceRow) ?? null, sourceRow })),
    movements,
    unresolvedNames: unresolvedWithCounts,
    reconciliation,
    issues,
    openingDate: vacationDate,
    sheetHeaderDate: vacations.cutoffDate,
  };
}
