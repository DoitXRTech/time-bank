import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { updateEmployee } from '../../../../lib/services/employeesService';
import { ROLES } from '../../../domain/movementTypes';

async function update(req, res) {
  const { employee: actor, email: signedInEmail } = req.user;
  const employee = await updateEmployee(actor, req.query.id, req.body, { signedInEmail });
  return res.status(200).json({ employee });
}

export default withAuth(routeByMethod({ PATCH: update }), { requiredRole: ROLES.ADMIN });
