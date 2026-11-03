import { withAuth } from '../../../lib/auth-middleware';
import { routeByMethod } from '../../../lib/error-handler';

async function getMe(req, res) {
  return res.status(200).json({ employee: req.user.employee });
}

export default withAuth(routeByMethod({ GET: getMe }));
