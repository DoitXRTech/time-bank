import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { employeesCollection, movementsCollection } from '../collections';
import { ConflictError, NotFoundError } from '../errors';
import { getAdminFirestore } from '../firebase-admin';
import { serializeMovement } from '../serializers';
import {
  validateMovementInput,
  validateMovementPatch,
  validateVoidReason,
} from '../../src/domain/movementValidation';

const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_RECENT_LIMIT = 15;
const MAX_LIMIT = 200;

function clampLimit(limit, fallback) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function balanceField(type) {
  return `balances.${type}`;
}

/**
 * Writes the movement and moves the employee balance in the same transaction,
 * so the stored balance can never disagree with the history.
 */
export async function createMovement(actor, rawInput) {
  const input = validateMovementInput(rawInput);
  const employeeRef = employeesCollection().doc(input.employeeId);
  const movementRef = movementsCollection().doc();

  await getAdminFirestore().runTransaction(async (transaction) => {
    const employeeSnapshot = await transaction.get(employeeRef);
    if (!employeeSnapshot.exists) throw new NotFoundError('Employee not found');
    if (employeeSnapshot.data().active === false) {
      throw new ConflictError('Employee is inactive', { reason: 'EMPLOYEE_INACTIVE' });
    }

    transaction.create(movementRef, {
      ...input,
      source: 'manual',
      createdBy: actor.id,
      createdAt: FieldValue.serverTimestamp(),
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    });
    transaction.update(employeeRef, {
      [balanceField(input.type)]: FieldValue.increment(input.amount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return serializeMovement(await movementRef.get());
}

const EDITABLE_FIELDS = ['employeeId', 'type', 'amount', 'date', 'note'];

/**
 * Net change per (employee, type) caused by replacing `before` with `after`:
 * the old amount is taken out of its balance and the new one is put into its own.
 * Zero changes are dropped, so an edit of only the note touches no balance.
 */
function balanceChanges(before, after) {
  const changes = new Map();
  const add = (employeeId, type, delta) => {
    const key = `${employeeId}|${type}`;
    changes.set(key, { employeeId, type, delta: (changes.get(key)?.delta ?? 0) + delta });
  };
  add(before.employeeId, before.type, -before.amount);
  add(after.employeeId, after.type, after.amount);
  return [...changes.values()].filter(({ delta }) => delta !== 0);
}

/**
 * Corrects a movement (amount, type, date, note or even the person) and re-balances the affected
 * employees in the same transaction. The previous values are kept in `editHistory`
 * (who, when, from → to) so a correction never hides what was there before.
 * A voided movement cannot be edited.
 */
export async function updateMovement(actor, movementId, rawPatch) {
  const patch = validateMovementPatch(rawPatch);
  const movementRef = movementsCollection().doc(movementId);

  await getAdminFirestore().runTransaction(async (transaction) => {
    const movementSnapshot = await transaction.get(movementRef);
    if (!movementSnapshot.exists) throw new NotFoundError('Movement not found');
    const before = movementSnapshot.data();
    if (before.voidedAt) throw new ConflictError('A voided movement cannot be edited', { reason: 'MOVEMENT_VOIDED' });

    const changedFields = EDITABLE_FIELDS.filter((field) => field in patch && patch[field] !== before[field]);
    if (!changedFields.length) return;

    const after = { ...before, ...patch };
    const changes = balanceChanges(before, after);
    const employeeIds = [...new Set(changes.map(({ employeeId }) => employeeId))];

    // All reads first: Firestore transactions do not allow a read after a write
    const employeeSnapshots = await Promise.all(employeeIds.map((id) => transaction.get(employeesCollection().doc(id))));
    employeeSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) throw new NotFoundError('Employee not found');
    });
    const movedToAnotherEmployee = changedFields.includes('employeeId');
    if (movedToAnotherEmployee) {
      const target = employeeSnapshots[employeeIds.indexOf(after.employeeId)];
      if (target.data().active === false) throw new ConflictError('Employee is inactive', { reason: 'EMPLOYEE_INACTIVE' });
    }

    transaction.update(movementRef, {
      ...Object.fromEntries(changedFields.map((field) => [field, patch[field]])),
      editedAt: FieldValue.serverTimestamp(),
      editedBy: actor.id,
      editHistory: FieldValue.arrayUnion({
        at: Timestamp.now(),
        by: actor.id,
        changes: Object.fromEntries(changedFields.map((field) => [field, { from: before[field], to: patch[field] }])),
      }),
    });

    employeeIds.forEach((employeeId) => {
      const balanceUpdates = Object.fromEntries(
        changes.filter((change) => change.employeeId === employeeId).map(({ type, delta }) => [balanceField(type), FieldValue.increment(delta)]),
      );
      transaction.update(employeesCollection().doc(employeeId), { ...balanceUpdates, updatedAt: FieldValue.serverTimestamp() });
    });
  });

  return serializeMovement(await movementRef.get());
}

/**
 * Movements are never deleted: voiding keeps who/when/why for audit and reverses the balance.
 */
export async function voidMovement(actor, movementId, rawReason) {
  const reason = validateVoidReason(rawReason);
  const movementRef = movementsCollection().doc(movementId);

  await getAdminFirestore().runTransaction(async (transaction) => {
    const movementSnapshot = await transaction.get(movementRef);
    if (!movementSnapshot.exists) throw new NotFoundError('Movement not found');
    const movement = movementSnapshot.data();
    if (movement.voidedAt) throw new ConflictError('Movement is already voided', { reason: 'ALREADY_VOIDED' });

    const employeeRef = employeesCollection().doc(movement.employeeId);
    const employeeSnapshot = await transaction.get(employeeRef);
    if (!employeeSnapshot.exists) throw new NotFoundError('Employee not found');

    transaction.update(movementRef, {
      voidedAt: FieldValue.serverTimestamp(),
      voidedBy: actor.id,
      voidReason: reason,
    });
    transaction.update(employeeRef, {
      [balanceField(movement.type)]: FieldValue.increment(-movement.amount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return serializeMovement(await movementRef.get());
}

/** Full history of one employee, newest first. Bounded by MAX_LIMIT (no cursor yet). */
export async function listEmployeeMovements(employeeId, limit) {
  const snapshot = await movementsCollection()
    .where('employeeId', '==', employeeId)
    .orderBy('date', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(clampLimit(limit, DEFAULT_HISTORY_LIMIT))
    .get();
  return snapshot.docs.map(serializeMovement);
}

/** Latest movements across the whole team, for the admin panel. */
export async function listRecentMovements(limit) {
  const snapshot = await movementsCollection()
    .orderBy('createdAt', 'desc')
    .limit(clampLimit(limit, DEFAULT_RECENT_LIMIT))
    .get();
  return snapshot.docs.map(serializeMovement);
}
