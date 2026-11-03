import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { previewImport, stageImport } from '../../../../lib/services/importStagingService';
import { ROLES } from '../../../domain/movementTypes';

/**
 * POST /api/imports  { sheetUrl, dryRun? }
 * With `dryRun: true` it only shows what would be saved; otherwise it saves every person of the
 * sheet as pending (not tied to any employee yet).
 */
async function importSheet(req, res) {
  const { sheetUrl, dryRun } = req.body ?? {};
  const result = dryRun === true ? await previewImport(sheetUrl) : await stageImport(req.user.employee, sheetUrl);
  return res.status(dryRun === true ? 200 : 201).json({ result });
}

export default withAuth(routeByMethod({ POST: importSheet }), { requiredRole: ROLES.ADMIN });
