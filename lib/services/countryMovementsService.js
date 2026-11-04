import { FieldValue } from 'firebase-admin/firestore';
import { employeesCollection, movementsCollection } from '../collections';
import { ConflictError } from '../errors';
import { getAdminFirestore } from '../firebase-admin';
import { captureException } from '../monitoring';
import { assertEmployeeCanReceiveMovements, balanceField, stageMovementRecord } from './movementsService';
import { validateCountryMovementInput } from '../../src/domain/countryMovement';
import { validateMovementInput } from '../../src/domain/movementValidation';

const SOURCE = 'country';

async function listActiveEmployeesOf(country) {
  const snapshot = await employeesCollection().where('country', '==', country).where('active', '==', true).get();
  return snapshot.docs.map((doc) => ({ id: doc.id }));
}

/**
 * What this same batch already registered on those days: `${employeeId}|${date}` of every live
 * (not voided) country movement of the same type and country, so running it twice credits nothing twice.
 */
async function findAlreadyRegistered({ country, type, dates }) {
  const snapshots = await Promise.all(
    dates.map((date) => movementsCollection().where('source', '==', SOURCE).where('date', '==', date).get()),
  );
  const keys = new Set();
  snapshots.forEach((snapshot) =>
    snapshot.docs.forEach((doc) => {
      const movement = doc.data();
      if (movement.type === type && movement.country === country && !movement.voidedAt) keys.add(`${movement.employeeId}|${movement.date}`);
    }),
  );
  return keys;
}

/** One person: their movements for the given days and one balance change, in a single transaction */
async function registerForEmployee(actor, employeeId, dates, input, batchId) {
  const employeeRef = employeesCollection().doc(employeeId);

  await getAdminFirestore().runTransaction(async (transaction) => {
    assertEmployeeCanReceiveMovements(await transaction.get(employeeRef));

    dates.forEach((date) => {
      stageMovementRecord(transaction, {
        movementRef: movementsCollection().doc(),
        input: validateMovementInput({ employeeId, type: input.type, amount: input.amount, date, note: input.note }),
        source: SOURCE,
        createdBy: actor.id,
        extra: { country: input.country, batchId },
      });
    });
    transaction.update(employeeRef, {
      [balanceField(input.type)]: FieldValue.increment(input.amount * dates.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Registers the same movement, on one or several (not necessarily consecutive) days, for every
 * active employee of a country: e.g. at the start of the month, the holidays of that month. Each
 * movement carries the note, the country and a shared `batchId`, and is a normal movement (it can
 * be edited or voided one by one). Each person is written in their own transaction, so a failure
 * affects only them and is reported; running it again skips what is already registered.
 * @returns {Promise<{ batchId: string, people: number, created: number, skipped: number, failedEmployeeIds: string[] }>}
 */
export async function createCountryMovements(actor, rawInput) {
  const input = validateCountryMovementInput(rawInput);
  const employees = await listActiveEmployeesOf(input.country);
  if (!employees.length) {
    throw new ConflictError('There are no active employees in that country', { reason: 'NO_EMPLOYEES_IN_COUNTRY' });
  }

  const alreadyRegistered = await findAlreadyRegistered(input);
  const batchId = movementsCollection().doc().id;
  const result = { batchId, people: 0, created: 0, skipped: 0, failedEmployeeIds: [] };

  for (const { id } of employees) {
    const pendingDates = input.dates.filter((date) => !alreadyRegistered.has(`${id}|${date}`));
    result.skipped += input.dates.length - pendingDates.length;
    if (!pendingDates.length) continue;

    try {
      await registerForEmployee(actor, id, pendingDates, input, batchId);
      result.people += 1;
      result.created += pendingDates.length;
    } catch (error) {
      captureException(error, { job: 'country-movements', employeeId: id, batchId });
      result.failedEmployeeIds.push(id);
    }
  }

  return result;
}
