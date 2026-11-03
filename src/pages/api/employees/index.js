import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { assertAdmin } from '../../../../lib/policies';
import { createEmployee, listEmployees } from '../../../../lib/services/employeesService';
import { ROLES } from '../../../domain/movementTypes';

async function list(req, res) {
  const actor = req.user.employee;
  const employees = actor.role === ROLES.ADMIN ? await listEmployees() : [actor];
  return res.status(200).json({ employees });
}

async function create(req, res) {
  const actor = req.user.employee;
  assertAdmin(actor);
  const employee = await createEmployee(actor, req.body);
  return res.status(201).json({ employee });
}

export default withAuth(routeByMethod({ GET: list, POST: create }));
