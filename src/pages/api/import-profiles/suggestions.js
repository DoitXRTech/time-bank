import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { ValidationError } from '../../../../lib/errors';
import { suggestImportProfiles } from '../../../../lib/services/importStagingService';
import { ROLES } from '../../../domain/movementTypes';

// GET /api/import-profiles/suggestions?name=Kevin Sequeira: pending people whose name looks like it
async function suggest(req, res) {
  const { name } = req.query;
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('name is required', { field: 'name', reason: 'REQUIRED' });
  }
  return res.status(200).json({ suggestions: await suggestImportProfiles(name) });
}

export default withAuth(routeByMethod({ GET: suggest }), { requiredRole: ROLES.ADMIN });
