import { withAuth } from '../../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../../lib/error-handler';
import { cancelRequest } from '../../../../../lib/services/requestsService';

// Open to every collaborator: the service only lets the owner withdraw a pending request
async function cancel(req, res) {
  const request = await cancelRequest(req.user.employee, req.query.id);
  return res.status(200).json({ request });
}

export default withAuth(routeByMethod({ POST: cancel }));
