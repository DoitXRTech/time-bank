import { handleApiError, routeByMethod } from '../../../lib/error-handler';
import { serverBuildId } from '../../../lib/appVersion';

// Public on purpose (not behind withAuth): it only says which deploy is the latest, and a tab on the
// login screen must be able to find out that it is out of date too. It touches no database.
async function getVersion(req, res) {
  // Never cached, or a stale answer would hide the new deploy from the tabs that are already open
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ buildId: serverBuildId() ?? null });
}

export default async function handler(req, res) {
  try {
    await routeByMethod({ GET: getVersion })(req, res);
  } catch (error) {
    handleApiError(error, req, res);
  }
}
