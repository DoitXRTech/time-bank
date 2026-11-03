import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { voidMovement } from '../../../../../lib/services/movementsService';
import { ROLES } from '../../../../domain/movementTypes';

async function voidOne(req, res) {
  const movement = await voidMovement(req.user.employee, req.query.id, req.body?.reason);
  return res.status(200).json({ movement });
}

export default withAuth(routeByMethod({ POST: voidOne }), { requiredRole: ROLES.ADMIN });
