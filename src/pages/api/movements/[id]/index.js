import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { updateMovement } from '../../../../../lib/services/movementsService';
import { ROLES } from '../../../../domain/movementTypes';

async function update(req, res) {
  const movement = await updateMovement(req.user.employee, req.query.id, req.body);
  return res.status(200).json({ movement });
}

export default withAuth(routeByMethod({ PATCH: update }), { requiredRole: ROLES.ADMIN });
