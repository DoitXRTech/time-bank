import { AuthorizationError } from './errors';
import { ROLES } from '../src/domain/movementTypes';

/**
 * Who can see whose balances. This is the single place to change the visibility rule:
 * today admins see everyone and members only see themselves.
 */
export function canViewEmployee(actor, employeeId) {
  return actor.role === ROLES.ADMIN || actor.id === employeeId;
}

export function assertAdmin(actor) {
  if (actor.role !== ROLES.ADMIN) {
    throw new AuthorizationError(`Requires ${ROLES.ADMIN} role`);
  }
}

export function assertCanViewEmployee(actor, employeeId) {
  if (!canViewEmployee(actor, employeeId)) {
    throw new AuthorizationError('You can only view your own balances');
  }
}
