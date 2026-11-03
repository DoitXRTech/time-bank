/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';

const mockReplace = jest.fn();
let mockPathname = '/';
let mockAuth;
let mockPendingRequests = 0;

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, replace: mockReplace }) }));
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }) => require('react').createElement('img', { alt }) }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', changeTheme: jest.fn() }) }));
jest.mock('@/context/AuthContext', () => ({
  AUTH_STATUS: { LOADING: 'loading', SIGNED_OUT: 'signed-out', READY: 'ready' },
  useAuth: () => mockAuth,
}));

jest.mock('@/context/RequestsInboxContext', () => ({ useRequestsInbox: () => ({ count: mockPendingRequests }) }));

const member = { id: 'm1', name: 'Luis Colaborador', role: 'member' };
const admin = { id: 'a1', name: 'Ana Admin', role: 'admin' };

const mockSetPreview = jest.fn();

// Mirrors what AuthProvider derives: isAdmin follows the preview, isRealAdmin does not
const signIn = (employee, { previewAsMember = false } = {}) => {
  const isRealAdmin = employee.role === 'admin';
  mockAuth = {
    status: 'ready',
    employee,
    signedInEmail: 'x@x.com',
    signOut: jest.fn(),
    isRealAdmin,
    isAdmin: isRealAdmin && !previewAsMember,
    previewAsMember,
    setPreviewAsMember: mockSetPreview,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
  mockPendingRequests = 0;
});

describe('the page shell', () => {
  it('shows a collaborator no tabs at all: only "Consultar saldo" exists for them, so there is no tab bar', () => {
    signIn(member);
    render(<AppShell>contenido</AppShell>);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('Equipo')).toBeNull();
    expect(screen.queryByText('Panel administrador')).toBeNull();
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('shows an administrator the three tabs', () => {
    signIn(admin);
    render(<AppShell>contenido</AppShell>);

    const tabs = screen.getByRole('navigation');
    expect(tabs.textContent).toContain('Consultar saldo');
    expect(tabs.textContent).toContain('Equipo');
    expect(tabs.textContent).toContain('Panel administrador');
  });
});

describe('the alert for collaborator requests', () => {
  it('shows the admin tab with the number of requests waiting for a decision', () => {
    mockPendingRequests = 3;
    signIn(admin);
    render(<AppShell>contenido</AppShell>);

    const adminTab = screen.getByRole('link', { name: /Panel administrador/ });
    expect(adminTab.textContent).toContain('3');
    expect(adminTab.textContent).toContain('3 solicitudes pendientes');
  });

  it('says "1 solicitud pendiente" in the singular for screen readers', () => {
    mockPendingRequests = 1;
    signIn(admin);
    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole('link', { name: /Panel administrador/ }).textContent).toContain('1 solicitud pendiente');
  });

  it('shows no badge when nothing is waiting', () => {
    signIn(admin);
    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole('link', { name: /Panel administrador/ }).textContent).toBe('Panel administrador');
  });
});

describe('view as collaborator (for admins who are testing)', () => {
  it('offers an admin the "Ver como colaborador" button, and a collaborator never gets it', () => {
    signIn(admin);
    const { unmount } = render(<AppShell>contenido</AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Ver como colaborador' }));
    expect(mockSetPreview).toHaveBeenCalledWith(true);
    unmount();

    signIn(member);
    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByRole('button', { name: 'Ver como colaborador' })).toBeNull();
  });

  it('while previewing, shows what a collaborator sees (no tab bar), a banner and the way back', () => {
    signIn(admin, { previewAsMember: true });
    render(<AppShell>contenido</AppShell>);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('como la vería un colaborador');
    expect(screen.queryByRole('button', { name: 'Ver como colaborador' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Volver a administrador' }));
    expect(mockSetPreview).toHaveBeenCalledWith(false);
  });

  it('without the preview there is no banner', () => {
    signIn(admin);
    render(<AppShell>contenido</AppShell>);
    expect(screen.queryByText('Volver a administrador')).toBeNull();
  });

  it.each(['/team', '/admin'])('while previewing, an admin page (%s) bounces to the balances page like it would for a collaborator', (path) => {
    mockPathname = path;
    signIn(admin, { previewAsMember: true });
    render(<RequireAuth adminOnly>contenido de administrador</RequireAuth>);

    expect(screen.queryByText('contenido de administrador')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

describe('the page gate', () => {
  it('lets a collaborator into the balances page', () => {
    signIn(member);
    render(<RequireAuth>saldos</RequireAuth>);

    expect(screen.getByText('saldos')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(['/team', '/admin'])('sends a collaborator who types %s back to the balances page, without showing the page', (path) => {
    mockPathname = path;
    signIn(member);
    render(<RequireAuth adminOnly>contenido de administrador</RequireAuth>);

    expect(screen.queryByText('contenido de administrador')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('lets an administrator into an admin page', () => {
    signIn(admin);
    render(<RequireAuth adminOnly>contenido de administrador</RequireAuth>);

    expect(screen.getByText('contenido de administrador')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends someone who is signed out to the login, without showing the page', () => {
    mockAuth = { status: 'signed-out', employee: null, signOut: jest.fn() };
    render(<RequireAuth>saldos</RequireAuth>);

    expect(screen.queryByText('saldos')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('shows nothing of the page while the session is still being checked', () => {
    mockAuth = { status: 'loading', employee: null, signOut: jest.fn() };
    render(<RequireAuth adminOnly>contenido de administrador</RequireAuth>);

    expect(screen.queryByText('contenido de administrador')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
