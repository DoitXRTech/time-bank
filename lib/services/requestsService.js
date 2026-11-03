import { FieldValue } from 'firebase-admin/firestore';
import { todayInAppTimeZone } from '../appDate';
import { employeesCollection, movementsCollection, requestsCollection } from '../collections';
import { AuthorizationError, ConflictError, NotFoundError } from '../errors';
import { getAdminFirestore } from '../firebase-admin';
import { serializeRequest } from '../serializers';
import { assertEmployeeCanReceiveMovements, stageMovement } from './movementsService';
import { REQUEST_STATUSES } from '../../src/domain/requestTypes';
import { movementFromRequest, validateDecisionReason, validateRequestInput } from '../../src/domain/requestValidation';

const DEFAULT_EMPLOYEE_LIMIT = 50;
const MAX_PENDING = 200;

function clampLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_EMPLOYEE_LIMIT;
  return Math.min(parsed, MAX_PENDING);
}

/** Reads the request inside a transaction and refuses anything that is not waiting for a decision */
async function readPendingRequest(transaction, requestRef) {
  const snapshot = await transaction.get(requestRef);
  if (!snapshot.exists) throw new NotFoundError('Request not found');
  const request = snapshot.data();
  if (request.status !== REQUEST_STATUSES.PENDING) {
    throw new ConflictError('The request was already decided', { reason: 'REQUEST_NOT_PENDING' });
  }
  return request;
}

/**
 * A collaborator asks for something: the overtime hours of a finished month, or vacation days.
 * It is always filed for the person who is signed in (never for someone else) and waits as
 * `pending` until an admin decides; it moves no balance by itself.
 */
export async function createRequest(actor, rawInput) {
  const input = validateRequestInput(rawInput, todayInAppTimeZone());
  const requestRef = requestsCollection().doc();

  await requestRef.set({
    ...input,
    employeeId: actor.id,
    status: REQUEST_STATUSES.PENDING,
    createdAt: FieldValue.serverTimestamp(),
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    movementId: null,
  });

  return serializeRequest(await requestRef.get());
}

/** Requests waiting for a decision, oldest first (the inbox of the admins) */
export async function listPendingRequests() {
  const snapshot = await requestsCollection()
    .where('status', '==', REQUEST_STATUSES.PENDING)
    .orderBy('createdAt', 'asc')
    .limit(MAX_PENDING)
    .get();
  return snapshot.docs.map(serializeRequest);
}

/** Everything one person has asked for, newest first */
export async function listEmployeeRequests(employeeId, limit) {
  const snapshot = await requestsCollection()
    .where('employeeId', '==', employeeId)
    .orderBy('createdAt', 'desc')
    .limit(clampLimit(limit))
    .get();
  return snapshot.docs.map(serializeRequest);
}

/**
 * Accepts a request: the movement it asks for, the balance change and the new status are written in
 * one transaction. The movement id derives from the request, so a request can never produce two.
 */
export async function approveRequest(actor, requestId) {
  const requestRef = requestsCollection().doc(requestId);
  const movementRef = movementsCollection().doc(`request-${requestId}`);

  await getAdminFirestore().runTransaction(async (transaction) => {
    const request = await readPendingRequest(transaction, requestRef);
    const employeeRef = employeesCollection().doc(request.employeeId);
    assertEmployeeCanReceiveMovements(await transaction.get(employeeRef));

    stageMovement(transaction, {
      movementRef,
      employeeRef,
      input: movementFromRequest(request),
      source: 'request',
      createdBy: actor.id,
      extra: { requestId },
    });
    transaction.update(requestRef, {
      status: REQUEST_STATUSES.APPROVED,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: actor.id,
      movementId: movementRef.id,
    });
  });

  return serializeRequest(await requestRef.get());
}

/** Turns a request down. The reason is required: the collaborator reads it. */
export async function rejectRequest(actor, requestId, rawReason) {
  const reason = validateDecisionReason(rawReason);
  const requestRef = requestsCollection().doc(requestId);

  await getAdminFirestore().runTransaction(async (transaction) => {
    await readPendingRequest(transaction, requestRef);
    transaction.update(requestRef, {
      status: REQUEST_STATUSES.REJECTED,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: actor.id,
      decisionNote: reason,
    });
  });

  return serializeRequest(await requestRef.get());
}

/** The collaborator withdraws their own request while nobody has decided it yet */
export async function cancelRequest(actor, requestId) {
  const requestRef = requestsCollection().doc(requestId);

  await getAdminFirestore().runTransaction(async (transaction) => {
    const request = await readPendingRequest(transaction, requestRef);
    if (request.employeeId !== actor.id) {
      throw new AuthorizationError('You can only cancel your own requests');
    }
    transaction.update(requestRef, {
      status: REQUEST_STATUSES.CANCELLED,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: actor.id,
    });
  });

  return serializeRequest(await requestRef.get());
}
