import { FieldValue } from 'firebase-admin/firestore';
import { todayInAppTimeZone } from '../appDate';
import { employeesCollection, importMovementsCollection, importProfilesCollection, movementsCollection } from '../collections';
import { ConflictError, NotFoundError } from '../errors';
import { getAdminFirestore } from '../firebase-admin';
import { PROFILE_STATUS, serializeImportProfile } from './importStagingService';
import { accrueEmployeeVacation } from './vacationAccrualService';
import { completedMonths } from '../../src/domain/vacationAccrual';

// A transaction accepts up to 500 writes: one per movement plus the employee update
const MOVEMENTS_PER_TRANSACTION = 200;
const VACATIONS_TAB_PREFIX = 'vacations:';

const isEmpty = (value) => value === undefined || value === null || value === '';

// The "Caja" date of the sheet is not part of the record any more: the hire date is the only date
const RECORD_FIELDS = ['team', 'hireDate', 'employmentType', 'scheduleStart', 'scheduleEnd'];

/**
 * The employee record fields of the sheet (team, hire date, employment type, schedule) that the
 * employee does not have yet. What an admin already typed is never overwritten.
 */
function recordFieldsToFill(employee, sheetRecord = {}) {
  return Object.fromEntries(
    Object.entries(sheetRecord).filter(([field, value]) => RECORD_FIELDS.includes(field) && !isEmpty(value) && isEmpty(employee[field])),
  );
}

function movementIdFor(profileKey, importKey) {
  return `import-${profileKey}-${importKey.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * The balances of the sheet already include the vacation days earned until the day of the import.
 * Linking to an employee whose accrual is already running would count those days twice, and a
 * different start date would mean the two disagree about how the days were counted.
 */
function assertCompatibleWithEmployee(profile, employee, hasVacationOpening) {
  if (profile.vacationStartDate && employee.vacationStartDate && employee.vacationStartDate !== profile.vacationStartDate) {
    throw new ConflictError('The employee already has a different vacation start date', { reason: 'START_DATE_MISMATCH' });
  }
  if (hasVacationOpening && (employee.vacationAccruedMonths ?? 0) > 0) {
    throw new ConflictError('The employee already accrued vacation days, the opening balance would count them twice', {
      reason: 'ACCRUAL_ALREADY_RUNNING',
    });
  }
}

/**
 * Turns one chunk of staged movements into real ones for the employee and moves the balances in
 * the same transaction. Movements that already exist (an earlier run stopped halfway) are skipped,
 * so linking can be repeated safely.
 */
async function createMovementsChunk(actor, profileKey, employeeRef, staged) {
  const employeeId = employeeRef.id;

  return getAdminFirestore().runTransaction(async (transaction) => {
    const refs = staged.map((movement) => movementsCollection().doc(movementIdFor(profileKey, movement.importKey)));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));

    const balanceChanges = {};
    let created = 0;
    staged.forEach((movement, index) => {
      if (snapshots[index].exists) return;
      transaction.create(refs[index], {
        employeeId,
        type: movement.type,
        amount: movement.amount,
        date: movement.date,
        note: movement.note,
        source: 'import',
        importProfile: profileKey,
        importKey: movement.importKey,
        createdBy: actor.id,
        createdAt: FieldValue.serverTimestamp(),
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      });
      balanceChanges[`balances.${movement.type}`] = (balanceChanges[`balances.${movement.type}`] ?? 0) + movement.amount;
      created += 1;
    });

    if (created) {
      transaction.update(employeeRef, {
        ...Object.fromEntries(Object.entries(balanceChanges).map(([field, delta]) => [field, FieldValue.increment(delta)])),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return created;
  });
}

/**
 * Ties a person found in the spreadsheet to an employee: their movements become real movements of
 * the employee (marked as imported), the vacation start date is carried over when the employee has
 * none, and the person stops being pending. From then on the usual tools apply (edit, void).
 *
 * @param {{ id: string }} actor admin doing it
 * @param {string} profileKey the imported person
 * @param {string} employeeId the employee that receives the information
 * @param {{ today?: string }} [context] today's date (YYYY-MM-DD)
 * @returns {Promise<{ profile: object, movementsCreated: number }>}
 */
export async function linkImportProfile(actor, profileKey, employeeId, { today = todayInAppTimeZone() } = {}) {
  const profileRef = importProfilesCollection().doc(profileKey);
  const employeeRef = employeesCollection().doc(employeeId);
  const [profileSnapshot, employeeSnapshot] = await Promise.all([profileRef.get(), employeeRef.get()]);

  if (!profileSnapshot.exists) throw new NotFoundError('Imported person not found');
  if (!employeeSnapshot.exists) throw new NotFoundError('Employee not found');
  const profile = profileSnapshot.data();
  if (profile.status !== PROFILE_STATUS.PENDING) {
    throw new ConflictError('This person is not pending any more', { reason: 'PROFILE_NOT_PENDING' });
  }

  const stagedSnapshot = await importMovementsCollection().where('profileKey', '==', profileKey).get();
  const staged = stagedSnapshot.docs.map((doc) => doc.data());
  assertCompatibleWithEmployee(profile, employeeSnapshot.data(), staged.some((movement) => movement.importKey.startsWith(VACATIONS_TAB_PREFIX)));

  let movementsCreated = 0;
  for (const part of chunk(staged, MOVEMENTS_PER_TRANSACTION)) {
    movementsCreated += await createMovementsChunk(actor, profileKey, employeeRef, part);
  }

  let startsAccrual = false;
  await getAdminFirestore().runTransaction(async (transaction) => {
    const employee = (await transaction.get(employeeRef)).data();
    const adoptsStartDate = profile.vacationStartDate && !employee.vacationStartDate;
    startsAccrual = Boolean(profile.vacationStartDate);
    const recordFields = recordFieldsToFill(employee, profile.employment);

    if (Object.keys(recordFields).length) {
      transaction.update(employeeRef, { ...recordFields, updatedAt: FieldValue.serverTimestamp() });
    }

    if (adoptsStartDate) {
      // Months until the day of the import are inside the imported balance; the job credits the ones after it
      transaction.update(employeeRef, {
        vacationStartDate: profile.vacationStartDate,
        vacationAccruedMonths: completedMonths(profile.vacationStartDate, profile.openingDate),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(profileRef, {
      status: PROFILE_STATUS.LINKED,
      linkedEmployeeId: employeeId,
      linkedBy: actor.id,
      linkedAt: FieldValue.serverTimestamp(),
    });
  });

  if (startsAccrual) await accrueEmployeeVacation(employeeId, today);
  return { profile: serializeImportProfile(await profileRef.get()), movementsCreated };
}
