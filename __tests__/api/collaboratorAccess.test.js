/**
 * What a collaborator (role "member") can and cannot do against the real route handlers, with the
 * authentication and the services mocked. The point: only "Consultar saldo" (their own balances
 * and history) is reachable; everything else answers 403 and never reaches a service.
 */
import cronHandler from '../../src/pages/api/cron/accrue-vacation';
import employeesRoute from '../../src/pages/api/employees/index';
import employeeRoute from '../../src/pages/api/employees/[id]';
import balancesRoute from '../../src/pages/api/employees/[id]/balances';
import importsRoute from '../../src/pages/api/imports/index';
import importProfilesRoute from '../../src/pages/api/import-profiles/index';
import suggestionsRoute from '../../src/pages/api/import-profiles/suggestions';
import linkRoute from '../../src/pages/api/import-profiles/[key]/link';
import discardRoute from '../../src/pages/api/import-profiles/[key]/discard';
import meRoute from '../../src/pages/api/me';
import movementsRoute from '../../src/pages/api/movements/index';
import movementRoute from '../../src/pages/api/movements/[id]/index';
import voidRoute from '../../src/pages/api/movements/[id]/void';
import requestsRoute from '../../src/pages/api/requests/index';
import approveRoute from '../../src/pages/api/requests/[id]/approve';
import rejectRoute from '../../src/pages/api/requests/[id]/reject';
import cancelRoute from '../../src/pages/api/requests/[id]/cancel';
import * as balanceAdjustmentService from '../../lib/services/balanceAdjustmentService';
import * as employeesService from '../../lib/services/employeesService';
import * as importLinkService from '../../lib/services/importLinkService';
import * as importStagingService from '../../lib/services/importStagingService';
import * as movementsService from '../../lib/services/movementsService';
import * as requestsService from '../../lib/services/requestsService';

const mockVerifyIdToken = jest.fn();

jest.mock('../../lib/firebase-admin', () => ({ getAdminAuth: () => ({ verifyIdToken: mockVerifyIdToken }) }));
jest.mock('../../lib/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('../../lib/services/employeesService');
jest.mock('../../lib/services/movementsService');
jest.mock('../../lib/services/balanceAdjustmentService');
jest.mock('../../lib/services/requestsService');
jest.mock('../../lib/services/importStagingService', () => ({
  ...jest.requireActual('../../lib/services/importStagingService'),
  stageImport: jest.fn(),
  previewImport: jest.fn(),
  listImportProfiles: jest.fn(),
  suggestImportProfiles: jest.fn(),
  discardImportProfile: jest.fn(),
}));
jest.mock('../../lib/services/importLinkService');
jest.mock('../../lib/services/vacationAccrualService');

const member = { id: 'm1', role: 'member', name: 'Luis', active: true, emails: ['luis@x.com'], balances: {} };
const admin = { id: 'a1', role: 'admin', name: 'Ana', active: true, emails: ['ana@x.com'], balances: {} };

function createRes() {
  const res = { body: undefined };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  res.setHeader = jest.fn();
  return res;
}

async function call(route, { method = 'GET', query = {}, body, as = member } = {}) {
  mockVerifyIdToken.mockResolvedValue({ uid: `uid-${as.id}`, email: as.emails[0], email_verified: true });
  employeesService.resolveSignedInEmployee.mockResolvedValue(as);
  const res = createRes();
  await route({ method, query, body, headers: { authorization: 'Bearer t' }, url: '/api/test' }, res);
  return res;
}

const allServices = () => [
  ...Object.values(employeesService).filter((fn) => fn !== employeesService.resolveSignedInEmployee),
  ...Object.values(movementsService),
  ...Object.values(balanceAdjustmentService),
  ...Object.values(requestsService),
  importStagingService.stageImport,
  importStagingService.previewImport,
  importStagingService.listImportProfiles,
  importStagingService.suggestImportProfiles,
  importStagingService.discardImportProfile,
  importLinkService.linkImportProfile,
].filter((fn) => jest.isMockFunction(fn));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('a collaborator can reach their own balances', () => {
  it('GET /api/me returns their own record', async () => {
    const res = await call(meRoute);
    expect(res.statusCode).toBe(200);
    expect(res.body.employee).toEqual(member);
  });

  it('GET /api/employees returns only themself, never the list of the team', async () => {
    const res = await call(employeesRoute);

    expect(res.statusCode).toBe(200);
    expect(res.body.employees).toEqual([member]);
    expect(employeesService.listEmployees).not.toHaveBeenCalled();
  });

  it('GET /api/movements?employeeId=<themself> returns their history', async () => {
    movementsService.listEmployeeMovements.mockResolvedValue([{ id: 'x' }]);
    const res = await call(movementsRoute, { query: { employeeId: 'm1' } });

    expect(res.statusCode).toBe(200);
    expect(movementsService.listEmployeeMovements).toHaveBeenCalledWith('m1', undefined);
  });
});

describe('a collaborator can ask for overtime and vacation', () => {
  it('POST /api/requests files a request under their own name', async () => {
    requestsService.createRequest.mockResolvedValue({ id: 'r1' });
    const body = { kind: 'vacation', date: '2026-11-17', amount: 2 };

    const res = await call(requestsRoute, { method: 'POST', body });

    expect(res.statusCode).toBe(201);
    expect(requestsService.createRequest).toHaveBeenCalledWith(member, body);
  });

  it('GET /api/requests?employeeId=<themself> lists what they asked for', async () => {
    requestsService.listEmployeeRequests.mockResolvedValue([{ id: 'r1' }]);
    const res = await call(requestsRoute, { query: { employeeId: 'm1' } });

    expect(res.statusCode).toBe(200);
    expect(requestsService.listEmployeeRequests).toHaveBeenCalledWith('m1', undefined);
  });

  it('POST /api/requests/:id/cancel is open to them (the service only lets the owner withdraw it)', async () => {
    requestsService.cancelRequest.mockResolvedValue({ id: 'r1', status: 'cancelled' });
    const res = await call(cancelRoute, { method: 'POST', query: { id: 'r1' } });

    expect(res.statusCode).toBe(200);
    expect(requestsService.cancelRequest).toHaveBeenCalledWith(member, 'r1');
  });

  it("GET /api/requests?employeeId=<someone else> is forbidden (nobody else's requests)", async () => {
    const res = await call(requestsRoute, { query: { employeeId: 'someone-else' } });

    expect(res.statusCode).toBe(403);
    expect(requestsService.listEmployeeRequests).not.toHaveBeenCalled();
  });

  it('GET /api/requests without a person (the inbox of the admins) is forbidden', async () => {
    const res = await call(requestsRoute);

    expect(res.statusCode).toBe(403);
    expect(requestsService.listPendingRequests).not.toHaveBeenCalled();
  });
});

describe('a collaborator cannot reach anything else', () => {
  it("GET /api/movements?employeeId=<someone else> is forbidden (nobody else's history)", async () => {
    const res = await call(movementsRoute, { query: { employeeId: 'someone-else' } });
    expect(res.statusCode).toBe(403);
    expect(movementsService.listEmployeeMovements).not.toHaveBeenCalled();
  });

  it('GET /api/movements without a person (the team feed) is forbidden', async () => {
    const res = await call(movementsRoute);
    expect(res.statusCode).toBe(403);
    expect(movementsService.listRecentMovements).not.toHaveBeenCalled();
  });

  it.each([
    ['POST /api/movements (register a movement)', movementsRoute, { method: 'POST', body: { employeeId: 'm1', type: 'overtime', amount: 99, date: '2026-01-01' } }],
    ['PATCH /api/movements/:id (edit a movement)', movementRoute, { method: 'PATCH', query: { id: 'x' }, body: { amount: 1 } }],
    ['POST /api/movements/:id/void', voidRoute, { method: 'POST', query: { id: 'x' }, body: { reason: 'r' } }],
    ['POST /api/requests/:id/approve (decide their own request)', approveRoute, { method: 'POST', query: { id: 'r1' } }],
    ['POST /api/requests/:id/reject', rejectRoute, { method: 'POST', query: { id: 'r1' }, body: { reason: 'r' } }],
    ['POST /api/employees/:id/balances (force their own balances)', balancesRoute, { method: 'POST', query: { id: 'm1' }, body: { balances: { overtime: 999 }, note: 'x' } }],
    ['POST /api/employees (add a collaborator)', employeesRoute, { method: 'POST', body: { name: 'N', emails: ['n@x.com'] } }],
    ['PATCH /api/employees/:id (make themself admin)', employeeRoute, { method: 'PATCH', query: { id: 'm1' }, body: { role: 'admin' } }],
    ['POST /api/imports (load the sheet)', importsRoute, { method: 'POST', body: { sheetUrl: 'https://docs.google.com/spreadsheets/d/x' } }],
    ['GET /api/import-profiles', importProfilesRoute, {}],
    ['GET /api/import-profiles/suggestions', suggestionsRoute, { query: { name: 'Luis' } }],
    ['POST /api/import-profiles/:key/link', linkRoute, { method: 'POST', query: { key: 'k' }, body: { employeeId: 'm1' } }],
    ['POST /api/import-profiles/:key/discard', discardRoute, { method: 'POST', query: { key: 'k' } }],
  ])('%s is forbidden and never reaches a service', async (_label, route, options) => {
    const res = await call(route, options);

    expect(res.statusCode).toBe(403);
    allServices().forEach((service) => expect(service).not.toHaveBeenCalled());
  });
});

describe('the daily accrual job is not a user endpoint', () => {
  it('refuses a signed-in collaborator token: it only accepts the cron secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = createRes();

    await cronHandler({ method: 'GET', headers: { authorization: 'Bearer some-user-id-token' }, query: {}, url: '/api/cron/accrue-vacation' }, res);

    expect(res.statusCode).toBe(401);
    delete process.env.CRON_SECRET;
  });
});

describe('an admin still reaches the same routes', () => {
  it('GET /api/employees lists the whole team', async () => {
    employeesService.listEmployees.mockResolvedValue([admin, member]);
    const res = await call(employeesRoute, { as: admin });

    expect(res.statusCode).toBe(200);
    expect(res.body.employees).toEqual([admin, member]);
  });

  it('GET /api/requests (the inbox) and approving or rejecting a request are allowed', async () => {
    requestsService.listPendingRequests.mockResolvedValue([]);
    requestsService.approveRequest.mockResolvedValue({ id: 'r1' });
    requestsService.rejectRequest.mockResolvedValue({ id: 'r2' });

    expect((await call(requestsRoute, { as: admin })).statusCode).toBe(200);
    expect((await call(approveRoute, { as: admin, method: 'POST', query: { id: 'r1' } })).statusCode).toBe(200);
    expect((await call(rejectRoute, { as: admin, method: 'POST', query: { id: 'r2' }, body: { reason: 'No' } })).statusCode).toBe(200);
    expect(requestsService.rejectRequest).toHaveBeenCalledWith(admin, 'r2', 'No');
  });

  it('POST /api/employees/:id/balances forces the balances, with the admin as the author', async () => {
    balanceAdjustmentService.adjustBalances.mockResolvedValue({ ...member, balances: { overtime: 5 } });
    const body = { balances: { overtime: 5 }, note: 'Reinicio' };

    const res = await call(balancesRoute, { as: admin, method: 'POST', query: { id: 'm1' }, body });

    expect(res.statusCode).toBe(200);
    expect(balanceAdjustmentService.adjustBalances).toHaveBeenCalledWith(admin, 'm1', body);
  });

  it('GET /api/movements (team feed) and PATCH /api/employees/:id are allowed', async () => {
    movementsService.listRecentMovements.mockResolvedValue([]);
    employeesService.updateEmployee.mockResolvedValue({ ...member, role: 'admin' });

    expect((await call(movementsRoute, { as: admin })).statusCode).toBe(200);
    expect((await call(employeeRoute, { as: admin, method: 'PATCH', query: { id: 'm1' }, body: { role: 'admin' } })).statusCode).toBe(200);
  });
});
