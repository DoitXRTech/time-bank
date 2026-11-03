import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { approveRequest } from '../../../../../lib/services/requestsService';
import { ROLES } from '../../../../domain/movementTypes';

async function approve(req, res) {
  const request = await approveRequest(req.user.employee, req.query.id);
  return res.status(200).json({ request });
}

export default withAuth(routeByMethod({ POST: approve }), { requiredRole: ROLES.ADMIN });
