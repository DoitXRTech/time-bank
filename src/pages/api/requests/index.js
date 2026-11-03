import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { ValidationError } from '../../../../lib/errors';
import { assertAdmin, assertCanViewEmployee } from '../../../../lib/policies';
import { createRequest, listEmployeeRequests, listPendingRequests } from '../../../../lib/services/requestsService';

/**
 * GET /api/requests?employeeId=...  what one person asked for (admin, or the employee themself)
 * GET /api/requests                 requests waiting for a decision (admin only: the inbox)
 */
async function list(req, res) {
  const actor = req.user.employee;
  const { employeeId, limit } = req.query;

  if (Array.isArray(employeeId)) {
    throw new ValidationError('employeeId must be a single value', { field: 'employeeId', reason: 'INVALID_TYPE' });
  }

  if (employeeId) {
    assertCanViewEmployee(actor, employeeId);
    return res.status(200).json({ requests: await listEmployeeRequests(employeeId, limit) });
  }

  assertAdmin(actor);
  return res.status(200).json({ requests: await listPendingRequests() });
}

// Any signed-in collaborator can ask; the request is always filed under their own name
async function create(req, res) {
  const request = await createRequest(req.user.employee, req.body);
  return res.status(201).json({ request });
}

export default withAuth(routeByMethod({ GET: list, POST: create }));
