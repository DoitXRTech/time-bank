import { AppError, MethodNotAllowedError } from './errors';
import { captureException } from './monitoring';

export function handleApiError(error, req, res) {
  const isTypedError = error instanceof AppError;

  // Only unexpected errors (bugs, outages) are reported; typed errors are normal control flow
  if (!isTypedError || error.statusCode >= 500) {
    captureException(error, { route: req.url, method: req.method, userId: req.user?.uid });
  }

  if (error instanceof MethodNotAllowedError) {
    res.setHeader('Allow', error.metadata.allowed.join(', '));
  }

  const statusCode = isTypedError ? error.statusCode : 500;
  // Never leak internals of unexpected errors to the client
  const body = isTypedError
    ? { error: error.message, code: error.code }
    : { error: 'Internal server error', code: 'INTERNAL_ERROR' };
  if (isTypedError && Object.keys(error.metadata).length) body.metadata = error.metadata;

  return res.status(statusCode).json(body);
}

/**
 * Dispatches by HTTP method. Anything not listed answers 405 with an Allow header.
 * Usage: export default withAuth(routeByMethod({ GET: list, POST: create }));
 */
export function routeByMethod(handlers) {
  return async (req, res) => {
    const handler = handlers[req.method];
    if (!handler) throw new MethodNotAllowedError(Object.keys(handlers));
    return handler(req, res);
  };
}
