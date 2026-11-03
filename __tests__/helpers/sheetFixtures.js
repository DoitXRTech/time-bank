// Made-up spreadsheet rows with the same shape and quirks as the team's sheet (no real people)
const VACATIONS_HEADER = ['Equipo A', 'Horario de entrada', 'Salida', 'Método', 'Caja', 'Spazio', 'Total Vacaciones ', '', '# Días', 'Días Disponibles al 30/07/2026'];
const person = (name, caja, spazio, total, taken, available) => [name, '8:00', '5:00', 'CCSS', caja, spazio, total, '', taken, available];

export const VACATION_ROWS = [
  VACATIONS_HEADER,
  person('Estefania Rojas', '01/01/2025', '01/01/2025', '22', '2', '20'),
  person('Josefina Barios', '01/01/2025', '01/01/2025', '22', '7', '15'),
  person('Josefina Montero', '01/01/2025', '01/01/2025', '22', '0', '22'),
  person('Pasante Uno', 'No aplica', '2/03/2026', '-', '-', '0'),
];

const OVERTIME_HEADER = ['Colaborador', 'Horas Acumuladas', 'Fecha de Horas Acumuladas', 'Horas Devueltas', 'Fecha de Horas Devueltas', 'Pendientes/A favor', 'Detalle'];
export const overtimeRow = (name, hours, date, balance, detail = '') => [name, hours, date, '', '', balance, detail];

export const OVERTIME_ROWS = [
  ['Horas Extras Equipo'],
  OVERTIME_HEADER,
  overtimeRow('Estef', '4,00', '10/02/2026', '4,00', 'Expo'),
  overtimeRow('Estef', '2,00', '11/02/2026', '6,00'),
  overtimeRow('Josefina Barrios', '3,00', '12/02/2026', '3,00'),
  overtimeRow('Zacarias Nuevo', '1,50', '14/02/2026', '1,50'),
];

// The default tab ids of lib/config.js
export const SHEET_TABS_BY_GID = { 896284519: VACATION_ROWS, 1900223631: OVERTIME_ROWS };

export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?gid=896284519';

// ---------- Workbook (.xlsx) fixtures: cells carry the strikethrough ----------

/** Excel stores dates as days since 1899-12-30 */
export const excelSerial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

/** "Reponer~" is a struck-through "Reponer" (already repaid) */
export const textCell = (value) => {
  const strike = value.endsWith('~');
  return { text: strike ? value.slice(0, -1) : value, number: null, strike };
};
export const numberCell = (number) => ({ text: String(number), number, strike: false });

/**
 * A holiday tab as readWorkbook returns it.
 * @param {string} name tab name, e.g. "Feriados CR 26"
 * @param {string[]} holidayDates ISO dates of the columns
 * @param {Array<[string, ...Array<string|object>]>} people name followed by one status per holiday (text, or a cell such as numberCell), then (optional) the birthday cell
 * @param {{ carryover?: Array<[string, number]>, hiddenRows?: number[] }} [options]
 */
export function holidaySheet(name, holidayDates, people, { carryover = [], hiddenRows = [] } = {}) {
  const header = [undefined, ...holidayDates.map((iso) => numberCell(excelSerial(iso))), textCell('Día de Cumpleaños')];
  const toCell = (value) => (typeof value === 'string' && value ? textCell(value) : value || undefined);
  const rows = [header, ...people.map(([personName, ...cells]) => [textCell(personName), ...cells.map(toCell)])];
  if (carryover.length) {
    rows.push([], [textCell('Feriados adeudados 2025')], ...carryover.map(([personName, remaining]) => [textCell(personName), numberCell(remaining)]));
  }
  return { name, rows, hiddenRows: new Set(hiddenRows) };
}

export const HOLIDAY_SHEET = holidaySheet(
  'Feriados CR 26',
  ['2026-08-31', '2026-09-15'],
  [
    ['Estef', 'Reponer', 'Reponer~', 'Reponer'], // owes 31/08, 15/09 already repaid, birthday owed
    ['Jos', 'Reponer', 'Reponer'], // ambiguous nickname: two Josefinas
    ['Pasante Uno', 'N/A', 'Lo toma'],
    ['Zacarias Nuevo', 'Reponer~', 'Lo toma'],
  ],
  { carryover: [['Josefina Montero', 2]] },
);

/** Every tab of the made-up workbook: the vacations tab (for hidden rows) and one holiday tab */
export const WORKBOOK_SHEETS = [{ name: 'Vacaciones Equipo', rows: [], hiddenRows: new Set([4]) }, HOLIDAY_SHEET];
