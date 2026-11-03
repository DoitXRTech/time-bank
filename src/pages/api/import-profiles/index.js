import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { listImportProfiles, PROFILE_STATUS } from '../../../../lib/services/importStagingService';
import { ROLES } from '../../../domain/movementTypes';

// GET /api/import-profiles?status=pending|discarded|linked (default: pending)
async function list(req, res) {
  const status = Object.values(PROFILE_STATUS).includes(req.query.status) ? req.query.status : PROFILE_STATUS.PENDING;
  return res.status(200).json({ profiles: await listImportProfiles(status) });
}

export default withAuth(routeByMethod({ GET: list }), { requiredRole: ROLES.ADMIN });
