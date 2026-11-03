import { handleApiError } from './error-handler';
import { AuthenticationError, AuthorizationError } from './errors';
import { getAdminAuth } from './firebase-admin';
import { resolveSignedInEmployee } from './services/employeesService';

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid Authorization header');
  }
  return header.slice('Bearer '.length);
}

async function verifyIdToken(idToken) {
  try {
    return await getAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    if (error.code === 'auth/id-token-expired') throw new AuthenticationError('Token expired');
    if (error.code?.startsWith('auth/')) throw new AuthenticationError('Invalid token');
    throw error;
  }
}

/**
 * Authenticates the request and attaches `req.user = { uid, email, employee }`.
 * Access is a whitelist: only a verified Google account whose email is registered on an active
 * employee gets through (any domain, personal or company). Everyone else is rejected.
 *
 * @param {Function} handler
 * @param {{ requiredRole?: string }} [options]
 */
export function withAuth(handler, { requiredRole } = {}) {
  return async (req, res) => {
    try {
      const decoded = await verifyIdToken(extractBearerToken(req));

      if (!decoded.email || !decoded.email_verified) {
        throw new AuthorizationError('A verified email is required', { reason: 'EMAIL_NOT_VERIFIED' });
      }
      const email = decoded.email.toLowerCase();

      const employee = await resolveSignedInEmployee({ uid: decoded.uid, email, displayName: decoded.name });
      if (requiredRole && employee.role !== requiredRole) {
        throw new AuthorizationError(`Requires ${requiredRole} role`);
      }

      req.user = { uid: decoded.uid, email, employee };
      return await handler(req, res);
    } catch (error) {
      return handleApiError(error, req, res);
    }
  };
}
