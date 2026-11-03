import { handleApiError, routeByMethod } from '../../lib/error-handler';
import { ConflictError, MethodNotAllowedError, ValidationError } from '../../lib/errors';
import { captureException } from '../../lib/monitoring';

jest.mock('../../lib/monitoring', () => ({ captureException: jest.fn() }));

function createRes() {
  const res = { headers: {} };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn((name, value) => {
    res.headers[name] = value;
  });
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('handleApiError', () => {
  it('answers typed errors with their status, code and metadata without reporting them', () => {
    const res = createRes();
    handleApiError(new ValidationError('bad amount', { field: 'amount', reason: 'AMOUNT_NOT_STEP' }), { url: '/x' }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'bad amount',
      code: 'VALIDATION_ERROR',
      metadata: { field: 'amount', reason: 'AMOUNT_NOT_STEP' },
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('omits empty metadata', () => {
    const res = createRes();
    handleApiError(new ConflictError('dup'), { url: '/x' }, res);
    expect(res.json).toHaveBeenCalledWith({ error: 'dup', code: 'CONFLICT' });
  });

  it('reports unexpected errors and hides their message from the client', () => {
    const res = createRes();
    handleApiError(new Error('firestore exploded: secret detail'), { url: '/x', method: 'GET' }, res);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });
});

describe('routeByMethod', () => {
  it('dispatches to the handler of the request method', async () => {
    const get = jest.fn();
    await routeByMethod({ GET: get, POST: jest.fn() })({ method: 'GET' }, createRes());
    expect(get).toHaveBeenCalled();
  });

  it('throws MethodNotAllowedError listing the allowed methods', async () => {
    const route = routeByMethod({ GET: jest.fn(), POST: jest.fn() });
    await expect(route({ method: 'DELETE' }, createRes())).rejects.toMatchObject({
      statusCode: 405,
      metadata: { allowed: ['GET', 'POST'] },
    });
  });

  it('sets the Allow header when the 405 is rendered', () => {
    const res = createRes();
    handleApiError(new MethodNotAllowedError(['GET']), { url: '/x' }, res);
    expect(res.headers.Allow).toBe('GET');
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
