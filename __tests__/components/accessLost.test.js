/** @jest-environment jsdom */
/**
 * The signed-in session against a pretend server, with the real provider, API client, polling and
 * page gate: what an open page does by itself when an admin deactivates the person (or changes
 * their role), with nobody pressing F5.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RequireAuth } from '@/components/RequireAuth';
import { AuthProvider } from '@/context/AuthContext';
import { RequestsInboxProvider } from '@/context/RequestsInboxContext';
import { SESSION_SYNC_MS } from '@/lib/liveRefresh';

const mockReplace = jest.fn();
const mockSignOut = jest.fn();
let mockAuthCallback;

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/admin', replace: mockReplace }) }));
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }) => require('react').createElement('img', { alt }) }));
jest.mock('next/head', () => ({ __esModule: true, default: ({ children }) => children }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', changeTheme: jest.fn() }) }));
jest.mock('@/lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'token' } }),
  isFirebaseConfigured: () => true,
}));
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  signInWithPopup: jest.fn(),
  // Like Firebase: tells the current state right away, and again (with no user) after a sign-out
  onAuthStateChanged: (_auth, callback) => {
    mockAuthCallback = callback;
    Promise.resolve().then(() => callback({ email: 'ana@x.com' }));
    return () => {};
  },
  signOut: async () => {
    mockSignOut();
    mockAuthCallback(null);
  },
}));

const admin = { id: 'a1', name: 'Ana Admin', role: 'admin', active: true, emails: ['ana@x.com'], balances: {} };
let server;
let calls;

const respond = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  server = { employee: admin, revoked: null };
  calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(url);
    if (server.revoked) return respond(403, { error: 'Forbidden', code: 'FORBIDDEN', metadata: { reason: server.revoked } });
    if (url === '/api/me') return respond(200, { employee: server.employee });
    if (url === '/api/requests') return respond(200, { requests: [] });
    return respond(200, {});
  });
});

afterEach(() => {
  jest.useRealTimers();
});

const settle = async () => {
  for (let round = 0; round < 6; round += 1) await act(async () => {});
};
const advance = async (ms) => {
  await act(async () => jest.advanceTimersByTime(ms));
  await settle();
};
const callsTo = (url) => calls.filter((call) => call === url).length;

async function openAdminPage() {
  render(
    <AuthProvider>
      <RequestsInboxProvider>
        <RequireAuth adminOnly>
          <p>contenido de administrador</p>
        </RequireAuth>
      </RequestsInboxProvider>
    </AuthProvider>,
  );
  await settle();
}

describe('an open page when the account loses its access', () => {
  it('shows the page while the account is fine', async () => {
    await openAdminPage();

    expect(screen.getByText('contenido de administrador')).toBeTruthy();
    expect(screen.queryByText('Ya no tiene acceso')).toBeNull();
  });

  it('is blocked by itself after the person is deactivated: no content, an explanation, no F5', async () => {
    await openAdminPage();

    server.revoked = 'ACCOUNT_DEACTIVATED';
    await advance(SESSION_SYNC_MS);

    expect(screen.getByRole('alert').textContent).toContain('Ya no tiene acceso');
    expect(screen.getByRole('alert').textContent).toContain('Un administrador desactivó su cuenta');
    expect(screen.queryByText('contenido de administrador')).toBeNull();
  });

  it('is also blocked by any other call that gets the refusal, long before the next check', async () => {
    await openAdminPage();

    server.revoked = 'ACCOUNT_DEACTIVATED';
    // The pending-requests list of an admin refreshes every few seconds: its refusal blocks the page
    await advance(10_000);

    expect(screen.getByText('Ya no tiene acceso')).toBeTruthy();
  });

  it('says so when the email was removed instead', async () => {
    await openAdminPage();

    server.revoked = 'NOT_REGISTERED';
    await advance(SESSION_SYNC_MS);

    expect(screen.getByRole('alert').textContent).toContain('Su correo ya no está registrado');
  });

  it('stops asking for the rest of the app while blocked, but keeps asking who the person is', async () => {
    await openAdminPage();
    server.revoked = 'ACCOUNT_DEACTIVATED';
    await advance(SESSION_SYNC_MS);
    const requestsBefore = callsTo('/api/requests');
    const meBefore = callsTo('/api/me');

    await advance(SESSION_SYNC_MS * 3);

    expect(callsTo('/api/requests')).toBe(requestsBefore);
    expect(callsTo('/api/me')).toBeGreaterThan(meBefore);
  });

  it('unblocks by itself when the access is given back', async () => {
    await openAdminPage();
    server.revoked = 'ACCOUNT_DEACTIVATED';
    await advance(SESSION_SYNC_MS);
    expect(screen.getByText('Ya no tiene acceso')).toBeTruthy();

    server.revoked = null;
    await advance(SESSION_SYNC_MS);

    expect(screen.queryByText('Ya no tiene acceso')).toBeNull();
    expect(screen.getByText('contenido de administrador')).toBeTruthy();
  });

  it('lets the person sign out from the block screen', async () => {
    await openAdminPage();
    server.revoked = 'ACCOUNT_DEACTIVATED';
    await advance(SESSION_SYNC_MS);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    });
    await settle();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Ya no tiene acceso')).toBeNull();
  });

  it('does not show the block screen when the person cannot even sign in: that goes back to the login with its message', async () => {
    server.revoked = 'ACCOUNT_DEACTIVATED';

    await openAdminPage();

    expect(screen.queryByText('Ya no tiene acceso')).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});

describe('an open page when the account changes', () => {
  it('takes an admin out of the admin pages once they are made a collaborator', async () => {
    await openAdminPage();

    server.employee = { ...admin, role: 'member' };
    await advance(SESSION_SYNC_MS);

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText('contenido de administrador')).toBeNull();
  });

  it('shows a corrected name without reloading', async () => {
    await openAdminPage();
    expect(screen.getByText('Ana Admin')).toBeTruthy();

    server.employee = { ...admin, name: 'Ana Salas' };
    await advance(SESSION_SYNC_MS);

    expect(screen.getByText('Ana Salas')).toBeTruthy();
  });

  it('asks again only while the tab is visible', async () => {
    await openAdminPage();
    const before = callsTo('/api/me');

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await advance(SESSION_SYNC_MS * 3);
    expect(callsTo('/api/me')).toBe(before);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(callsTo('/api/me')).toBe(before + 1);
  });
});
