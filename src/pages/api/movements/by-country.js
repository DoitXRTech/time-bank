import { withAuth } from '../../../../lib/auth-middleware';
import { routeByMethod } from '../../../../lib/error-handler';
import { createCountryMovements } from '../../../../lib/services/countryMovementsService';
import { ROLES } from '../../../domain/movementTypes';

// POST /api/movements/by-country: the same movement on one or several days for everyone in a country
async function create(req, res) {
  const result = await createCountryMovements(req.user.employee, req.body);
  return res.status(201).json({ result });
}

export default withAuth(routeByMethod({ POST: create }), { requiredRole: ROLES.ADMIN });
