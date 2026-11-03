import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { rejectRequest } from '../../../../../lib/services/requestsService';
import { ROLES } from '../../../../domain/movementTypes';

async function reject(req, res) {
  const request = await rejectRequest(req.user.employee, req.query.id, req.body?.reason);
  return res.status(200).json({ request });
}

export default withAuth(routeByMethod({ POST: reject }), { requiredRole: ROLES.ADMIN });
