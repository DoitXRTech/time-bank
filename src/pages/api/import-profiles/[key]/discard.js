import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { discardImportProfile } from '../../../../../lib/services/importStagingService';
import { ROLES } from '../../../../domain/movementTypes';

// POST /api/import-profiles/:key/discard
async function discard(req, res) {
  return res.status(200).json({ profile: await discardImportProfile(req.user.employee, req.query.key) });
}

export default withAuth(routeByMethod({ POST: discard }), { requiredRole: ROLES.ADMIN });
