import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { ValidationError } from '../../../../../lib/errors';
import { linkImportProfile } from '../../../../../lib/services/importLinkService';
import { ROLES } from '../../../../domain/movementTypes';

// POST /api/import-profiles/:key/link  { employeeId }
async function link(req, res) {
  const { employeeId } = req.body ?? {};
  if (typeof employeeId !== 'string' || !employeeId) {
    throw new ValidationError('employeeId is required', { field: 'employeeId', reason: 'REQUIRED' });
  }
  const result = await linkImportProfile(req.user.employee, req.query.key, employeeId);
  return res.status(200).json({ result });
}

export default withAuth(routeByMethod({ POST: link }), { requiredRole: ROLES.ADMIN });
