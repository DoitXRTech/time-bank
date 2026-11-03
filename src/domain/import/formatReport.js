const ISSUE_DESCRIPTIONS = {
  BALANCE_MISMATCH: 'The row\'s hours do not match the change of the sheet\'s running balance (review each one)',
  DATE_ASSUMED_PREVIOUS: 'No readable date: the previous valid date of the same person was used',
  DATE_YEAR_ASSUMED: 'Date without year: the year of the previous row was used',
  DATE_MONTH_NAME: 'Only a month name: the last day of that month was used',
  DATE_RANGE_FIRST_DAY: 'Several days in one cell ("19 y 20 de Marzo"): the first day was used',
  OPENING_BALANCE_INFERRED: 'Hours carried over before the first row: imported as an opening movement so the balance matches the sheet',
  OPENING_BALANCE_UNRESOLVED: 'Opening balance that could not be dated: NOT imported',
  DATE_UNRESOLVED: 'No usable date and no earlier row to borrow one: NOT imported',
  AMOUNT_INVALID: 'Amount is not a multiple of 0.25 (or too large): NOT imported',
  ZERO_AMOUNT_SKIPPED: 'Row with 0 hours: not a movement',
  VACATION_BALANCE_MISMATCH: 'Vacations: total minus taken is not the available days',
  ACCRUAL_START_UNRESOLVED: 'No start date reproduces the sheet\'s vacation total: no automatic accrual for this person until it is set by hand',
  MAPPING_TARGET_UNKNOWN: 'name-mapping.json points to a person that is not in the vacations tab',
};

function countBy(items, key) {
  return items.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] ?? 0) + 1 }), {});
}

function formatHours(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

/** Short summary without personal data, safe to print in a terminal or paste in a chat */
export function formatSummary(plan) {
  const byType = countBy(plan.movements, 'type');
  const issueCounts = countBy(plan.issues, 'code');
  const unresolvedMovements = plan.unresolvedNames.reduce((sum, entry) => sum + entry.movementCount, 0);
  const mismatchedPeople = plan.reconciliation.filter((person) => !person.matches).length;

  return [
    `People in the vacations tab:        ${plan.employees.length}`,
    `Movements ready to import:          ${plan.movements.length} (overtime ${byType.overtime ?? 0}, vacation ${byType.vacation ?? 0})`,
    `Opening vacation balances dated:    ${plan.openingDate ?? 'not found'} (sheet header says ${plan.sheetHeaderDate ?? 'nothing'}, but its formulas use TODAY())`,
    `People with a vacation accrual start date: ${plan.employees.filter((employee) => employee.vacationStartDate).length}`,
    `Names in overtime still unmatched:  ${plan.unresolvedNames.length} (${unresolvedMovements} movements wait for a decision)`,
    `People whose imported overtime differs from the sheet's final balance: ${mismatchedPeople}`,
    'Issues by type:',
    ...Object.entries(issueCounts).map(([code, count]) => `  ${code}: ${count}`),
  ].join('\n');
}

/** Full report in Markdown. Contains names: it is written to the git-ignored import-data folder. */
export function formatReport(plan) {
  const lines = ['# Import dry run', '', '```', formatSummary(plan), '```', ''];

  lines.push('## Names to confirm', '');
  if (!plan.unresolvedNames.length) lines.push('None.', '');
  else {
    lines.push('Copy the right ones to `name-mapping.json` as `"name in overtime tab": "full name"`.', '');
    lines.push('| Name in the overtime tab | Movements waiting | Suggestion | Confidence |', '|---|---|---|---|');
    plan.unresolvedNames.forEach((entry) => {
      const suggestion = entry.match ?? (entry.candidates.join(' / ') || '-');
      lines.push(`| ${entry.rawName} | ${entry.movementCount} | ${suggestion} | ${entry.confidence} |`);
    });
    lines.push('');
  }

  lines.push('## Overtime per person: imported vs the sheet\'s last running balance', '');
  lines.push('| Name in tab | Person | Imported | Sheet balance | Same |', '|---|---|---|---|---|');
  plan.reconciliation.forEach((person) => {
    const sheetBalance = person.sheetBalance === null ? '-' : formatHours(person.sheetBalance);
    lines.push(`| ${person.name} | ${person.employeeName ?? 'unmatched'} | ${formatHours(person.importedSum)} | ${sheetBalance} | ${person.matches ? 'yes' : '**no**'} |`);
  });
  lines.push('');

  lines.push('## Issues', '');
  const grouped = Object.entries(groupIssues(plan.issues));
  if (!grouped.length) lines.push('None.');
  grouped.forEach(([code, issues]) => {
    lines.push(`### ${code} (${issues.length})`, '', ISSUE_DESCRIPTIONS[code] ?? '', '');
    issues.forEach((issue) => lines.push(`- row ${issue.row ?? '-'}${issue.name ? ` · ${issue.name}` : ''}: ${issue.detail}`));
    lines.push('');
  });

  return lines.join('\n');
}

function groupIssues(issues) {
  return issues.reduce((groups, issue) => ({ ...groups, [issue.code]: [...(groups[issue.code] ?? []), issue] }), {});
}
