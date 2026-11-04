import { FieldValue } from 'firebase-admin/firestore';
import { todayInAppTimeZone } from '../appDate';
import { employeesCollection, movementsCollection } from '../collections';
import { getAdminFirestore } from '../firebase-admin';
import { serializeEmployee } from '../serializers';
import { assertEmployeeCanReceiveMovements, balanceField, stageMovementRecord } from './movementsService';
import { normalizeBalances } from '../../src/domain/balances';
import { planBalanceAdjustment } from '../../src/domain/balanceAdjustment';
import { validateMovementInput } from '../../src/domain/movementValidation';

/**
 * Forces an employee's balances to the values an admin typed (for when the spreadsheet import, or
 * a mistake, left them wrong). Nothing is overwritten: each balance that differs gets an
 * `adjustment` movement for the difference, carrying the admin's note and dated today, so the
 * history shows what was done, by whom and why, and the balance is still the sum of the movements.
 * The differences are computed inside the transaction against what is stored right now, so the
 * balances end up exactly as typed even if one moved while the admin was typing.
 */
export async function adjustBalances(actor, employeeId, rawInput) {
  const employeeRef = employeesCollection().doc(employeeId);
  const date = todayInAppTimeZone();

  await getAdminFirestore().runTransaction(async (transaction) => {
    const employeeSnapshot = await transaction.get(employeeRef);
    assertEmployeeCanReceiveMovements(employeeSnapshot);
    const { note, changes } = planBalanceAdjustment(rawInput, normalizeBalances(employeeSnapshot.data().balances));

    const balanceUpdates = {};
    changes.forEach(({ type, amount }) => {
      stageMovementRecord(transaction, {
        movementRef: movementsCollection().doc(),
        input: validateMovementInput({ employeeId, type, amount, date, note }),
        source: 'adjustment',
        createdBy: actor.id,
      });
      balanceUpdates[balanceField(type)] = FieldValue.increment(amount);
    });
    // One update for all the balances: several writes to the same document in a transaction are avoided
    transaction.update(employeeRef, { ...balanceUpdates, updatedAt: FieldValue.serverTimestamp() });
  });

  return serializeEmployee(await employeeRef.get());
}
