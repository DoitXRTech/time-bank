/** @jest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';
import { RequestsInboxProvider } from '@/context/RequestsInboxContext';
import { apiGet } from '@/lib/apiClient';
import { INBOX_REFRESH_MS } from '@/lib/liveRefresh';

let mockAuth;

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/admin', replace: jest.fn() }) }));
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }) => require('react').createElement('img', { alt }) }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', changeTheme: jest.fn() }) }));
jest.mock('@/context/AuthContext', () => ({
  AUTH_STATUS: { LOADING: 'loading', SIGNED_OUT: 'signed-out', READY: 'ready' },
  useAuth: () => mockAuth,
}));
jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));
jest.mock('@/lib/clientMonitoring', () => ({ captureClientException: jest.fn() }));

const admin = { id: 'a1', name: 'Ana Admin', role: 'admin' };
const request = (id) => ({ id, employeeId: 'm1', kind: 'overtime', status: 'pending', amount: 2, date: '2026-10-31', period: '2026-10', note: '', createdAt: '2026-11-04T10:00:00.000Z' });

const signIn = ({ previewAsMember = false } = {}) => {
  mockAuth = {
    status: 'ready',
    employee: admin,
    signedInEmail: 'ana@x.com',
    signOut: jest.fn(),
    isRealAdmin: true,
    isAdmin: !previewAsMember,
    previewAsMember,
    setPreviewAsMember: jest.fn(),
  };
};

const tree = () => (
  <RequestsInboxProvider>
    <AppShell>contenido</AppShell>
  </RequestsInboxProvider>
);
const flush = () => act(async () => {});
const adminTabText = () => screen.getByRole('link', { name: /Panel administrador/ }).textContent;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the admin badge follows the inbox on its own', () => {
  it('shows a request sent by a collaborator after the page was already open, without reloading it', async () => {
    signIn();
    apiGet.mockResolvedValueOnce({ requests: [] });
    render(tree());
    await flush();
    expect(adminTabText()).toBe('Panel administrador');

    apiGet.mockResolvedValue({ requests: [request('r1')] });
    await act(async () => jest.advanceTimersByTime(INBOX_REFRESH_MS));

    expect(adminTabText()).toContain('1 solicitud pendiente');
  });

  it('counts up as more requests arrive', async () => {
    signIn();
    apiGet.mockResolvedValueOnce({ requests: [request('r1')] });
    render(tree());
    await flush();
    expect(adminTabText()).toContain('1 solicitud pendiente');

    apiGet.mockResolvedValue({ requests: [request('r1'), request('r2')] });
    await act(async () => jest.advanceTimersByTime(60_000));

    expect(adminTabText()).toContain('2 solicitudes pendientes');
  });

  it('after leaving "ver como colaborador" it loads the inbox right away', async () => {
    signIn({ previewAsMember: true });
    const view = render(tree());
    await flush();
    expect(apiGet).not.toHaveBeenCalled();

    signIn();
    apiGet.mockResolvedValue({ requests: [request('r1')] });
    view.rerender(tree());
    await flush();

    expect(apiGet).toHaveBeenCalledWith('/api/requests');
    expect(adminTabText()).toContain('1 solicitud pendiente');
  });
});
