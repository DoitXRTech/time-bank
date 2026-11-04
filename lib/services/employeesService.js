import { FieldValue } from 'firebase-admin/firestore';
import { employeesCollection } from '../collections';
import { getInitialAdminEmails } from '../config';
import { AuthorizationError, ConflictError, NotFoundError } from '../errors';
import { todayInAppTimeZone } from '../appDate';
import { getAdminFirestore } from '../firebase-admin';
import { readEmails, serializeEmployee } from '../serializers';
import { accrueEmployeeVacation } from './vacationAccrualService';
import { validateEmployeePatch, validateNewEmployee } from '../../src/domain/employeeValidation';
import { emptyBalances } from '../../src/domain/balances';
import { ROLES } from '../../src/domain/movementTypes';
import { completedMonths } from '../../src/domain/vacationAccrual';
import { nextVacationStart, vacationStartFor } from '../../src/domain/vacationEligibility';

const ALREADY_EXISTS_CODE = 6;

export async function listEmployees() {
  const snapshot = await employeesCollection().orderBy('name').get();
  return snapshot.docs.map(serializeEmployee);
}

/**
 * Finds the employee docs that list `email`. The second query covers documents created before
 * multi-email support (single `email` field); they are migrated on their next sign-in.
 * `read` lets the same lookup run inside a transaction (`(query) => transaction.get(query)`).
 */
async function findEmployeeDocsByEmail(email, read = (query) => query.get()) {
  const queries = [
    employeesCollection().where('emails', 'array-contains', email).limit(2),
    employeesCollection().where('email', '==', email).limit(2),
  ];
  const snapshots = await Promise.all(queries.map(read));

  const docsById = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => docsById.set(doc.id, doc)));
  return [...docsById.values()];
}

/** An email can belong to one employee only; otherwise sign-in could not tell who is who. */
async function assertEmailsAvailable(transaction, emails, ownerId) {
  const read = (query) => transaction.get(query);
  const lookups = await Promise.all(emails.map((email) => findEmployeeDocsByEmail(email, read)));

  lookups.forEach((docs, index) => {
    if (docs.some((doc) => doc.id !== ownerId)) {
      throw new ConflictError('This email already belongs to another employee', {
        reason: 'EMAIL_TAKEN',
        email: emails[index],
      });
    }
  });
}

/**
 * Bootstrap: the very first admins cannot be added by another admin, so emails listed in
 * INITIAL_ADMIN_EMAILS become admins on their first sign-in. The deterministic doc id plus
 * `create()` makes concurrent first requests safe (the loser gets ALREADY_EXISTS).
 */
async function bootstrapAdmin({ uid, email, displayName }) {
  const ref = employeesCollection().doc(`bootstrap-admin-${uid}`);
  try {
    await ref.create({
      name: displayName || email,
      jobTitle: '',
      emails: [email],
      role: ROLES.ADMIN,
      active: true,
      balances: emptyBalances(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'bootstrap',
    });
  } catch (error) {
    if (error.code !== ALREADY_EXISTS_CODE) throw error;
  }
  return serializeEmployee(await ref.get());
}

/** Moves a pre-multi-email document to the `emails` array */
async function migrateLegacyEmail(doc) {
  if (Array.isArray(doc.data().emails)) return doc;
  await doc.ref.update({ emails: readEmails(doc.data()), email: FieldValue.delete() });
  return doc.ref.get();
}

/**
 * The whitelist: maps a verified Google account to the employee that lists its email.
 * Anyone whose email is not registered on an active employee is rejected, whatever their domain.
 * @throws {AuthorizationError} with metadata.reason NOT_REGISTERED | ACCOUNT_DEACTIVATED
 */
export async function resolveSignedInEmployee({ uid, email, displayName }) {
  const matches = await findEmployeeDocsByEmail(email);

  if (matches.length > 1) {
    throw new ConflictError('This email belongs to more than one employee', { reason: 'EMAIL_TAKEN' });
  }

  if (matches.length === 1) {
    const employee = serializeEmployee(await migrateLegacyEmail(matches[0]));
    if (!employee.active) {
      throw new AuthorizationError('Account is deactivated', { reason: 'ACCOUNT_DEACTIVATED' });
    }
    return employee;
  }

  if (getInitialAdminEmails().includes(email)) {
    return bootstrapAdmin({ uid, email, displayName });
  }

  throw new AuthorizationError('Account is not registered', { reason: 'NOT_REGISTERED' });
}

/**
 * Months already accounted for when a start date is set for the first time.
 * Crediting past months (`creditPastMonths`) starts the counter at 0 so the accrual job pays them
 * all; otherwise they are considered already included in a balance entered by hand or imported.
 */
function initialAccruedMonths(startDate, creditPastMonths, today) {
  return creditPastMonths ? 0 : completedMonths(startDate, today);
}

/**
 * @param {{ id: string }} actor admin creating the employee
 * @param {object} rawInput name, jobTitle, emails, role, country, hireDate, employmentType, creditPastMonths
 * @param {{ today?: string }} [context] today's date (YYYY-MM-DD); defaults to the company's today
 */
export async function createEmployee(actor, rawInput, { today = todayInAppTimeZone() } = {}) {
  const { creditPastMonths, ...fields } = validateNewEmployee(rawInput);
  // Vacations accrue from the hire date, and only for contract types that earn them
  const vacationStartDate = vacationStartFor(fields);
  const newRef = employeesCollection().doc();

  await getAdminFirestore().runTransaction(async (transaction) => {
    await assertEmailsAvailable(transaction, fields.emails, null);
    transaction.create(newRef, {
      ...fields,
      vacationStartDate,
      active: true,
      balances: emptyBalances(),
      ...(vacationStartDate ? { vacationAccruedMonths: initialAccruedMonths(vacationStartDate, creditPastMonths, today) } : {}),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
  });

  if (vacationStartDate) await accrueEmployeeVacation(newRef.id, today);
  return serializeEmployee(await newRef.get());
}

/**
 * Guards against locking yourself out: an admin cannot deactivate or demote themselves, nor
 * remove the email they are signed in with.
 */
function assertNotSelfLockout(actor, employeeId, patch, signedInEmail) {
  if (actor.id !== employeeId) return;

  const losesAdmin = patch.active === false || (patch.role !== undefined && patch.role !== ROLES.ADMIN);
  if (losesAdmin) {
    throw new ConflictError('You cannot remove your own admin access', { reason: 'SELF_LOCKOUT' });
  }
  if (patch.emails && !patch.emails.includes(signedInEmail)) {
    throw new ConflictError('You cannot remove the email you are signed in with', { reason: 'OWN_EMAIL_REMOVAL' });
  }
}

/**
 * @param {{ id: string }} actor employee doing the change
 * @param {string} employeeId employee being changed
 * @param {object} rawPatch fields to change (name, jobTitle, role, active, emails, country, hireDate, employmentType, creditPastMonths)
 * @param {{ signedInEmail: string, today?: string }} context email the actor is signed in with;
 *   `today` (YYYY-MM-DD) defaults to the company's today
 */
export async function updateEmployee(actor, employeeId, rawPatch, { signedInEmail, today = todayInAppTimeZone() }) {
  const { creditPastMonths = false, ...patch } = validateEmployeePatch(rawPatch);
  assertNotSelfLockout(actor, employeeId, patch, signedInEmail);

  const ref = employeesCollection().doc(employeeId);
  let newVacationStart = null;
  let startDateChanged = false;

  await getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new NotFoundError('Employee not found');
    if (patch.emails) await assertEmailsAvailable(transaction, patch.emails, employeeId);

    const before = snapshot.data();
    // The vacation start follows the hire date and the contract type (see nextVacationStart)
    newVacationStart = nextVacationStart(before, patch);
    startDateChanged = newVacationStart !== (before.vacationStartDate ?? null);
    // Only the first time a start date is set is there a choice about the months already completed;
    // when an existing date is corrected, the job just tops up to the months elapsed
    const isFirstStartDate = startDateChanged && !before.vacationStartDate && newVacationStart;

    transaction.update(ref, {
      ...patch,
      ...(startDateChanged ? { vacationStartDate: newVacationStart } : {}),
      ...(isFirstStartDate ? { vacationAccruedMonths: initialAccruedMonths(newVacationStart, creditPastMonths, today) } : {}),
      // Drops the pre-multi-email field when the list is rewritten
      ...(patch.emails ? { email: FieldValue.delete() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
  });

  if (startDateChanged && newVacationStart) await accrueEmployeeVacation(employeeId, today);
  return serializeEmployee(await ref.get());
}
