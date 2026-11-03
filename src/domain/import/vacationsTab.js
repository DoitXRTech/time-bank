import { parseSheetDate, parseSpanishNumber } from './sheetValues.js';

// Each team starts with a header row whose second cell is this text; the team name is in the first
const TEAM_HEADER_MARKER = 'Horario de entrada';
const COLUMN = { NAME: 0, SCHEDULE_START: 1, SCHEDULE_END: 2, METHOD: 3, SOCIAL_SECURITY_DATE: 4, COMPANY_DATE: 5, TOTAL: 6, TAKEN: 8, AVAILABLE: 9 };
const MAX_SCHEDULE_LENGTH = 60;
const CUTOFF_IN_HEADER_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4})/;
const EPSILON = 1e-9;

// The "Método" column, compared without accents, dots or case ("S.P" -> "sp")
const EMPLOYMENT_TYPE_BY_METHOD = { ccss: 'payroll', sp: 'professional-services', pasantia: 'internship' };

function parseEmploymentType(text) {
  const key = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  return EMPLOYMENT_TYPE_BY_METHOD[key] ?? null;
}

/** Schedules are free text in the sheet; "Pendiente" means not defined yet */
function cleanSchedule(text) {
  const clean = text.trim().replace(/\s+/g, ' ');
  return /^pendiente$/i.test(clean) ? '' : clean.slice(0, MAX_SCHEDULE_LENGTH);
}

/**
 * Reads the vacations tab: one block per team, one row per person.
 * Reads the employee record (team, schedule, employment type "Método", both hire dates) and the
 * vacation figures (available days and the date they accrue from).
 *
 * The sheet computes "Total Vacaciones" as `DATEDIF(start, TODAY(), "m")`, where each row's formula
 * points to either the "Fecha de ingreso en la Caja" or the "Fecha de ingreso Spazio" (chosen by hand
 * per person). Both dates are returned as `startDateCandidates`; buildImportPlan picks the one that
 * reproduces the sheet's total.
 *
 * @param {string[][]} rows parsed CSV
 * @returns {{
 *   employees: Array<{ name: string, team: string, total: number|null, taken: number|null, available: number|null, startDateCandidates: string[], employment: { team: string, hireDate: string|null, socialSecurityDate: string|null, employmentType: string|null, scheduleStart: string, scheduleEnd: string }, sourceRow: number }>,
 *   cutoffDate: string|null,
 *   issues: Array<{ code: string, row: number, detail: string }>
 * }}
 */
export function parseVacationsTab(rows) {
  const employees = [];
  const issues = [];
  let team = null;
  let cutoffDate = null;

  rows.forEach((cells, index) => {
    const sourceRow = index + 1;
    const name = (cells[COLUMN.NAME] ?? '').trim();

    if ((cells[1] ?? '').trim() === TEAM_HEADER_MARKER) {
      team = name;
      const cutoffText = CUTOFF_IN_HEADER_PATTERN.exec(cells[COLUMN.AVAILABLE] ?? '')?.[1];
      cutoffDate = cutoffDate ?? parseSheetDate(cutoffText)?.iso ?? null;
      return;
    }
    if (!name || !team) return;

    const total = parseSpanishNumber(cells[COLUMN.TOTAL] ?? '');
    const taken = parseSpanishNumber(cells[COLUMN.TAKEN] ?? '');
    const available = parseSpanishNumber(cells[COLUMN.AVAILABLE] ?? '');

    // total - taken should equal available; a blank "taken" means nothing was taken
    const hasAllFigures = total !== null && available !== null;
    if (hasAllFigures && Math.abs(total - (taken ?? 0) - available) > EPSILON) {
      issues.push({
        code: 'VACATION_BALANCE_MISMATCH',
        row: sourceRow,
        name,
        detail: `${name}: total ${total} - taken ${taken ?? 0} is not ${available}`,
      });
    }

    const startDateCandidates = [COLUMN.SOCIAL_SECURITY_DATE, COLUMN.COMPANY_DATE]
      .map((column) => parseSheetDate(cells[column] ?? '')?.iso)
      .filter((date, index, dates) => date && dates.indexOf(date) === index);

    // "No aplica" / "Pendiente" and blanks are not dates, so they come out as null
    const employment = {
      team,
      hireDate: parseSheetDate(cells[COLUMN.COMPANY_DATE] ?? '')?.iso ?? null,
      socialSecurityDate: parseSheetDate(cells[COLUMN.SOCIAL_SECURITY_DATE] ?? '')?.iso ?? null,
      employmentType: parseEmploymentType(cells[COLUMN.METHOD] ?? ''),
      scheduleStart: cleanSchedule(cells[COLUMN.SCHEDULE_START] ?? ''),
      scheduleEnd: cleanSchedule(cells[COLUMN.SCHEDULE_END] ?? ''),
    };

    employees.push({ name, team, total, taken, available, startDateCandidates, employment, sourceRow });
  });

  return { employees, cutoffDate, issues };
}
