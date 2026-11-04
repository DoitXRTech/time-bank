import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { adjustBalances } from '../../../../../lib/services/balanceAdjustmentService';
import { ROLES } from '../../../../domain/movementTypes';

// Admin only: it can change what anybody has, so the note it requires is the audit trail
async function adjust(req, res) {
  const employee = await adjustBalances(req.user.employee, req.query.id, req.body);
  return res.status(200).json({ employee });
}

export default withAuth(routeByMethod({ POST: adjust }), { requiredRole: ROLES.ADMIN });
