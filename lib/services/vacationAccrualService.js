import { FieldValue } from 'firebase-admin/firestore';
import { employeesCollection, movementsCollection } from '../collections';
import { getAdminFirestore } from '../firebase-admin';
import { captureException } from '../monitoring';
import { MOVEMENT_TYPES } from '../../src/domain/movementTypes';
import { monthsToCredit } from '../../src/domain/vacationAccrual';

// Firestore transactions accept up to 500 writes: one per credited month plus the employee update
const MONTHS_PER_TRANSACTION = 200;
const SYSTEM_ACTOR = 'system';

function accrualMovementId(employeeId, month) {
  return `accrual-${employeeId}-${month}`;
}

/**
 * Credits the next batch of months in one transaction. The employee's `vacationAccruedMonths`
 * is read inside the transaction, so two runs at the same time cannot credit the same month twice
 * (and the deterministic movement id would reject it anyway).
 */
async function creditNextBatch(employeeId, today) {
  const employeeRef = employeesCollection().doc(employeeId);

  return getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(employeeRef);
    if (!snapshot.exists) return 0;

    const employee = snapshot.data();
    if (employee.active === false || !employee.vacationStartDate) return 0;

    const months = monthsToCredit(employee.vacationStartDate, today, employee.vacationAccruedMonths ?? 0).slice(0, MONTHS_PER_TRANSACTION);
    if (!months.length) return 0;

    months.forEach(({ month, date }) => {
      transaction.create(movementsCollection().doc(accrualMovementId(employeeId, month)), {
        employeeId,
        type: MOVEMENT_TYPES.VACATION,
        amount: 1,
        date,
        note: `Acumulación mensual de vacaciones (mes ${month})`,
        source: 'accrual',
        accrualMonth: month,
        createdBy: SYSTEM_ACTOR,
        createdAt: FieldValue.serverTimestamp(),
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      });
    });

    transaction.update(employeeRef, {
      'balances.vacation': FieldValue.increment(months.length),
      vacationAccruedMonths: months[months.length - 1].month,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return months.length;
  });
}

/**
 * Credits every complete month of one employee that is not credited yet (1 vacation day each).
 * Safe to call any number of times: it only credits what is missing, and a month that an admin
 * voided is not credited again.
 * @returns {Promise<number>} months credited by this call
 */
export async function accrueEmployeeVacation(employeeId, today) {
  let credited = 0;
  let batch;
  do {
    batch = await creditNextBatch(employeeId, today);
    credited += batch;
  } while (batch > 0);
  return credited;
}

/**
 * Daily job: tops up the vacation days of every active employee that has a start date.
 * One employee failing does not stop the others; failures are reported to the caller.
 */
export async function accrueAllEmployees(today) {
  const snapshot = await employeesCollection().where('active', '==', true).get();
  const employeeIds = snapshot.docs.filter((doc) => doc.data().vacationStartDate).map((doc) => doc.id);

  let monthsCredited = 0;
  const failedEmployeeIds = [];

  for (const employeeId of employeeIds) {
    try {
      monthsCredited += await accrueEmployeeVacation(employeeId, today);
    } catch (error) {
      captureException(error, { job: 'vacation-accrual', employeeId });
      failedEmployeeIds.push(employeeId);
    }
  }

  return { today, employeesChecked: employeeIds.length, monthsCredited, failedEmployeeIds };
}
