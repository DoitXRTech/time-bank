import { resolveAccrualStarts } from './buildImportPlan.js';
import { normalizeName, suggestNameMatch } from './nameMatching.js';

const OPENING_VACATION_NOTE = 'Saldo inicial importado';
const HOLIDAY_CARRYOVER_NOTE = 'Feriados adeudados de 2025 (saldo inicial importado)';
const BIRTHDAY_PENDING_NOTE = 'Día de cumpleaños por reponer';

/** Stable id of a person found in the sheet: their name in lowercase words joined by hyphens */
export function profileKeyFor(name) {
  return normalizeName(name).replaceAll(' ', '-') || 'sin-nombre';
}

function uniqueKey(name, usedKeys) {
  const base = profileKeyFor(name);
  let key = base;
  for (let suffix = 2; usedKeys.has(key); suffix += 1) key = `${base}-${suffix}`;
  usedKeys.add(key);
  return key;
}

function sumByType(movements) {
  return movements.reduce((totals, movement) => ({ ...totals, [movement.type]: (totals[movement.type] ?? 0) + movement.amount }), {});
}

/**
 * Groups what the sheet says into people ("profiles") that are NOT tied to any employee yet.
 *
 * - One profile per person of the vacations tab. A name written differently in another tab
 *   ("Steph" for "Stephanie Carrasco") is merged into that person when it is the same name or
 *   a close, unambiguous variant; the merged names are kept in `aliases` so a human can see them.
 * - A name that matches nobody, or matches several people equally, becomes its own profile
 *   marked `needsReview` (never guessed).
 * - Each profile carries its employee record (team, hire dates, employment type, schedule), its
 *   movements (overtime rows, the opening vacation balance and the holidays still owed to the
 *   person), the vacation accrual start date and the issues found for that person.
 * - `hiddenInSheet`: the sheet has the person's row hidden (probably not on the team any more).
 *
 * Pure: nothing here touches the database.
 *
 * @param {{
 *   vacations: object,
 *   overtime: object,
 *   holidays?: object[],
 *   vacationHiddenRows?: Set<number>,
 *   openingDate: string
 * }} input parsed tabs (`holidays`: one parseHolidaysTab result per country tab), the hidden rows of
 *   the vacations tab, and the day of the import (the sheet's vacation formulas use TODAY(), so
 *   balances are dated with it)
 */
export function buildStagingPlan({ vacations, overtime, holidays = [], vacationHiddenRows = new Set(), openingDate }) {
  const accrual = resolveAccrualStarts(vacations.employees, openingDate);
  const usedKeys = new Set();
  const profilesByKey = new Map();
  const keyBySheetName = new Map();

  vacations.employees.forEach((employee) => {
    const key = uniqueKey(employee.name, usedKeys);
    profilesByKey.set(key, {
      key,
      name: employee.name,
      team: employee.team,
      employment: employee.employment,
      aliases: [],
      vacationStartDate: accrual.startDates.get(employee.sourceRow) ?? null,
      hiddenInSheet: vacationHiddenRows.has(employee.sourceRow),
      needsReview: false,
      reviewReason: null,
      movements: [],
      issues: [],
    });
    keyBySheetName.set(normalizeName(employee.name), key);

    if (employee.available) {
      profilesByKey.get(key).movements.push({
        importKey: `vacations:${employee.sourceRow}`,
        type: 'vacation',
        amount: employee.available,
        date: openingDate,
        dateKind: 'exact',
        note: OPENING_VACATION_NOTE,
      });
    }
  });

  const vacationNames = vacations.employees.map((employee) => employee.name);

  /**
   * The profile a name written in another tab belongs to: the person with the same name, a close
   * unambiguous variant (kept as an alias) or, when it is not clear, a profile of its own to review.
   */
  function profileKeyOfSheetName(sheetName) {
    const normalized = normalizeName(sheetName);
    if (keyBySheetName.has(normalized)) return keyBySheetName.get(normalized);

    const suggestion = suggestNameMatch(sheetName, vacationNames);
    let key;
    if (suggestion.match) {
      key = keyBySheetName.get(normalizeName(suggestion.match));
      profilesByKey.get(key).aliases.push({ name: sheetName, match: suggestion.confidence });
    } else {
      key = uniqueKey(sheetName, usedKeys);
      profilesByKey.set(key, {
        key,
        name: sheetName,
        team: null,
        employment: {},
        aliases: [],
        vacationStartDate: null,
        hiddenInSheet: false,
        needsReview: true,
        reviewReason: suggestion.confidence === 'ambiguous' ? 'ambiguous-name' : 'no-match',
        movements: [],
        issues: [],
      });
    }
    keyBySheetName.set(normalized, key);
    return key;
  }

  overtime.people.forEach(({ name }) => profileKeyOfSheetName(name));
  overtime.movements.forEach((movement) => {
    profilesByKey.get(keyBySheetName.get(normalizeName(movement.employeeName))).movements.push({
      importKey: movement.importKey,
      type: movement.type,
      amount: movement.amount,
      date: movement.date,
      dateKind: movement.dateKind,
      note: movement.note,
    });
  });

  // Holidays: what the company still owes each person (plain "Reponer"; struck through = already repaid)
  holidays.forEach((tab) => {
    tab.people.forEach((person) => {
      const profile = profilesByKey.get(profileKeyOfSheetName(person.name));
      if (person.hidden) profile.hiddenInSheet = true;

      person.pending.forEach(({ label, iso }) => {
        profile.movements.push({
          importKey: `holidays:${tab.country}:${person.sourceRow}:${iso}`,
          type: 'holiday',
          amount: 1,
          date: iso,
          dateKind: 'exact',
          note: `Feriado ${label} por reponer`,
        });
      });
      if (person.birthday === 'pending') {
        profile.movements.push({
          importKey: `holidays:${tab.country}:${person.sourceRow}:birthday`,
          type: 'birthday',
          amount: 1,
          date: openingDate,
          dateKind: 'exact',
          note: BIRTHDAY_PENDING_NOTE,
        });
      }
    });

    tab.carryover.filter((block) => block.remaining > 0).forEach((block) => {
      profilesByKey.get(profileKeyOfSheetName(block.name)).movements.push({
        importKey: `holidays:${tab.country}:${block.sourceRow}:carryover`,
        type: 'holiday',
        amount: block.remaining,
        date: openingDate,
        dateKind: 'exact',
        note: HOLIDAY_CARRYOVER_NOTE,
      });
    });
  });

  const globalIssues = [];
  [...vacations.issues, ...overtime.issues, ...accrual.issues, ...holidays.flatMap((tab) => tab.issues)].forEach((issue) => {
    const key = issue.name ? keyBySheetName.get(normalizeName(issue.name)) : undefined;
    if (key) profilesByKey.get(key).issues.push(issue);
    else globalIssues.push(issue);
  });

  const profiles = [...profilesByKey.values()].map((profile) => ({ ...profile, totals: sumByType(profile.movements) }));
  return { openingDate, profiles, globalIssues };
}

/** Counts that fit in a message (no names): how many people, merged names, reviews and issues */
export function summarizeStagingPlan(plan) {
  const issueCounts = {};
  [...plan.globalIssues, ...plan.profiles.flatMap((profile) => profile.issues)].forEach((issue) => {
    issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
  });

  const movementsOfType = (type) => plan.profiles.flatMap((profile) => profile.movements).filter((movement) => movement.type === type);

  return {
    openingDate: plan.openingDate,
    people: plan.profiles.length,
    movements: plan.profiles.reduce((sum, profile) => sum + profile.movements.length, 0),
    mergedNames: plan.profiles.reduce((sum, profile) => sum + profile.aliases.length, 0),
    needReview: plan.profiles.filter((profile) => profile.needsReview).length,
    hiddenInSheet: plan.profiles.filter((profile) => profile.hiddenInSheet).length,
    // Days the company owes in total (feriados por reponer, including last year's) and people involved
    holidayDaysOwed: movementsOfType('holiday').reduce((sum, movement) => sum + movement.amount, 0),
    peopleWithHolidaysOwed: plan.profiles.filter((profile) => (profile.totals.holiday ?? 0) > 0).length,
    issueCounts,
  };
}
