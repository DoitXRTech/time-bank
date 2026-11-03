import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { ValidationError } from '../../../../lib/errors';
import { assertAdmin, assertCanViewEmployee } from '../../../../lib/policies';
import {
  createMovement,
  listEmployeeMovements,
  listRecentMovements,
} from '../../../../lib/services/movementsService';

/**
 * GET /api/movements?employeeId=...  history of one employee (admin, or the employee themself)
 * GET /api/movements                 latest movements of the whole team (admin only)
 */
async function list(req, res) {
  const actor = req.user.employee;
  const { employeeId, limit } = req.query;

  if (Array.isArray(employeeId)) {
    throw new ValidationError('employeeId must be a single value', { field: 'employeeId', reason: 'INVALID_TYPE' });
  }

  if (employeeId) {
    assertCanViewEmployee(actor, employeeId);
    return res.status(200).json({ movements: await listEmployeeMovements(employeeId, limit) });
  }

  assertAdmin(actor);
  return res.status(200).json({ movements: await listRecentMovements(limit) });
}

async function create(req, res) {
  const actor = req.user.employee;
  assertAdmin(actor);
  const movement = await createMovement(actor, req.body);
  return res.status(201).json({ movement });
}

export default withAuth(routeByMethod({ GET: list, POST: create }));
