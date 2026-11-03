import { AMOUNT_STEP, MAX_ABS_AMOUNT, MAX_NOTE_LENGTH } from '../movementTypes.js';
import { parseSheetDate, parseSpanishNumber } from './sheetValues.js';

const COLUMN = {
  NAME: 0,
  ACCUMULATED: 1,
  ACCUMULATED_DATE: 2,
  RETURNED: 3,
  RETURNED_DATE: 4,
  RUNNING_BALANCE: 5,
  DETAIL: 6,
};
const EPSILON = 1e-9;
const OPENING_BALANCE_NOTE = 'Saldo anterior (calculado con el saldo de la hoja)';

function isHeaderRow(cells) {
  return (cells[COLUMN.NAME] ?? '').trim() === 'Colaborador' && (cells[COLUMN.ACCUMULATED] ?? '').startsWith('Horas Acumuladas');
}

function isValidAmount(amount) {
  const steps = amount / AMOUNT_STEP;
  return Math.abs(steps - Math.round(steps)) < EPSILON && Math.abs(amount) <= MAX_ABS_AMOUNT;
}

function buildNote(detail, unparsedDateText) {
  const base = unparsedDateText ? `${detail} [${unparsedDateText}]`.trim() : detail;
  return base.slice(0, MAX_NOTE_LENGTH);
}

function newPersonState() {
  return { lastDate: null, lastYear: null, previousBalance: 0, netSinceBalance: 0, balanceRows: 0, importedSum: 0, sheetBalance: null };
}

/**
 * Reads the overtime ledger: per person, rows of hours accumulated (+) or returned (-), plus the
 * sheet's own running balance ("Pendientes/A favor"), which is used to double-check every row.
 *
 * - Opening balance: the running balance of a person's first row usually starts from hours carried
 *   over from before the ledger. When the first row's own hours do not explain its balance, the
 *   difference is imported as an opening movement (`dateKind: 'inferred-opening'`).
 * - Dates in the sheet are often free text. A row whose date cannot be read takes the previous valid
 *   date of the same person (`dateKind: 'assumed-previous'`); every such case is reported.
 *
 * @param {string[][]} rows parsed CSV
 * @param {{ trustBalance?: boolean, defaultYear?: number|null }} [options]
 *   `trustBalance`: when a later row's hours disagree with the change of the running balance,
 *   import the balance's change instead. `defaultYear`: year for dates written without one when
 *   the person has no earlier dated row.
 */
export function parseOvertimeTab(rows, { trustBalance = false, defaultYear = null } = {}) {
  const movements = [];
  const issues = [];
  const states = new Map();

  const headerIndex = rows.findIndex(isHeaderRow);
  if (headerIndex === -1) throw new Error('Overtime tab header row not found ("Colaborador" / "Horas Acumuladas")');

  rows.slice(headerIndex + 1).forEach((cells, offset) => {
    const sourceRow = headerIndex + offset + 2;
    const name = (cells[COLUMN.NAME] ?? '').trim();
    if (!name) return;

    const accumulated = parseSpanishNumber(cells[COLUMN.ACCUMULATED] ?? '');
    const returned = parseSpanishNumber(cells[COLUMN.RETURNED] ?? '');
    const runningBalance = parseSpanishNumber(cells[COLUMN.RUNNING_BALANCE] ?? '');
    if (accumulated === null && returned === null && runningBalance === null) return;

    if (!states.has(name)) states.set(name, newPersonState());
    const state = states.get(name);

    const detail = (cells[COLUMN.DETAIL] ?? '').trim();
    const entries = [];
    if (accumulated) entries.push({ amount: accumulated, dateText: cells[COLUMN.ACCUMULATED_DATE] ?? '' });
    if (returned) entries.push({ amount: -Math.abs(returned), dateText: cells[COLUMN.RETURNED_DATE] ?? '' });
    if (accumulated === 0 && !returned) {
      issues.push({ code: 'ZERO_AMOUNT_SKIPPED', row: sourceRow, name, detail: 'Row with 0 hours is not a movement' });
    }

    state.netSinceBalance += entries.reduce((sum, entry) => sum + entry.amount, 0);

    // Check the row against the sheet's running balance
    let openingAmount = 0;
    if (runningBalance !== null) {
      const unexplained = runningBalance - state.previousBalance - state.netSinceBalance;
      if (Math.abs(unexplained) > EPSILON) {
        if (state.balanceRows === 0) {
          openingAmount = unexplained;
        } else {
          issues.push({
            code: 'BALANCE_MISMATCH',
            row: sourceRow,
            name,
            detail: `columns say ${state.netSinceBalance}, running balance changed by ${runningBalance - state.previousBalance}`,
          });
          if (trustBalance) {
            entries.length = 0;
            const delta = runningBalance - state.previousBalance;
            if (delta !== 0) entries.push({ amount: delta, dateText: cells[COLUMN.ACCUMULATED_DATE] || cells[COLUMN.RETURNED_DATE] || '' });
          }
        }
      }
      state.previousBalance = runningBalance;
      state.netSinceBalance = 0;
      state.balanceRows += 1;
      state.sheetBalance = runningBalance;
    }

    const rowMovements = [];
    entries.forEach((entry, entryIndex) => {
      const parsedDate = parseSheetDate(entry.dateText, { referenceYear: state.lastYear ?? defaultYear });
      const date = parsedDate?.iso ?? state.lastDate;
      const dateKind = parsedDate?.kind ?? 'assumed-previous';
      const shownDateText = entry.dateText.trim();

      if (!date) {
        issues.push({ code: 'DATE_UNRESOLVED', row: sourceRow, name, detail: `no usable date ("${shownDateText}") and no earlier row to borrow one from` });
        return;
      }
      if (dateKind !== 'exact') {
        issues.push({ code: `DATE_${dateKind.toUpperCase().replaceAll('-', '_')}`, row: sourceRow, name, detail: `"${shownDateText}" -> ${date}` });
      }
      if (!isValidAmount(entry.amount)) {
        issues.push({ code: 'AMOUNT_INVALID', row: sourceRow, name, detail: `${entry.amount} is not a multiple of ${AMOUNT_STEP} (or too large)` });
        return;
      }

      if (parsedDate) {
        state.lastDate = date;
        state.lastYear = Number(date.slice(0, 4));
      }
      rowMovements.push({
        employeeName: name,
        type: 'overtime',
        amount: entry.amount,
        date,
        dateKind,
        note: buildNote(detail, parsedDate ? '' : shownDateText),
        importKey: `overtime:${sourceRow}:${entryIndex}`,
      });
    });

    if (openingAmount) {
      const openingDate = rowMovements[0]?.date ?? state.lastDate;
      if (!openingDate || !isValidAmount(openingAmount)) {
        issues.push({ code: 'OPENING_BALANCE_UNRESOLVED', row: sourceRow, name, detail: `opening balance ${openingAmount} could not be dated or is not a valid amount: NOT imported` });
      } else {
        issues.push({ code: 'OPENING_BALANCE_INFERRED', row: sourceRow, name, detail: `${openingAmount} h carried over before this row (from the running balance)` });
        rowMovements.unshift({
          employeeName: name,
          type: 'overtime',
          amount: openingAmount,
          date: openingDate,
          dateKind: 'inferred-opening',
          note: OPENING_BALANCE_NOTE,
          importKey: `overtime:${sourceRow}:opening`,
        });
      }
    }

    rowMovements.forEach((movement) => {
      state.importedSum += movement.amount;
      movements.push(movement);
    });
  });

  const people = [...states.entries()].map(([name, state]) => ({ name, importedSum: state.importedSum, sheetBalance: state.sheetBalance }));
  return { movements, issues, people };
}
