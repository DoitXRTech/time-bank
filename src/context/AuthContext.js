import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { apiGet, isAccessLostError, onAccessLost } from '../lib/apiClient';
import { ROLES } from '../domain/movementTypes';
import { captureClientException } from '../lib/clientMonitoring';
import { getErrorMessage } from '../lib/errorMessages';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { SESSION_SYNC_MS } from '../lib/liveRefresh';

const AuthContext = createContext(null);

// "Ver como colaborador": lives only in this browser tab
const PREVIEW_STORAGE_KEY = 'time-bank-view-as-collaborator';

export const AUTH_STATUS = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  READY: 'ready',
});

/** Same record, so nothing that depends on the signed-in employee has to redraw */
const isSameEmployee = (previous, next) => JSON.stringify(previous) === JSON.stringify(next);

/**
 * A Google account only counts as signed in once the server confirms it maps to an active
 * employee of an allowed domain (GET /api/me). Otherwise the Firebase session is dropped
 * and the reason is kept to show on the login screen.
 *
 * While signed in it keeps itself in step with the server, without anyone reloading:
 * - `accessLostReason`: set the moment any API answer says the account was deactivated (or its
 *   email removed), wherever the call came from. Pages show a block screen instead of their
 *   content, and it clears by itself if the access comes back.
 * - the signed-in `employee` is refreshed every `SESSION_SYNC_MS`, so a role change (admin <-> collaborator)
 *   or a corrected name reaches the open page.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.LOADING);
  const [employee, setEmployee] = useState(null);
  // The Google email of this session; an employee can have several, so it is not employee.emails[0]
  const [signedInEmail, setSignedInEmail] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [previewAsMember, setPreviewAsMemberState] = useState(false);
  const [accessLostReason, setAccessLostReason] = useState(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  });

  const setPreviewAsMember = useCallback((enabled) => {
    setPreviewAsMemberState(enabled);
    try {
      if (enabled) window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, '1');
      else window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch (error) {
      // Storage can be blocked; the mode then only lasts until the page is reloaded
      captureClientException(error, { action: 'persist-preview-mode' });
    }
  }, []);

  useEffect(() => {
    try {
      setPreviewAsMemberState(window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === '1');
    } catch (error) {
      captureClientException(error, { action: 'read-preview-mode' });
    }
  }, []);

  // The API client tells us when an answer means "no access any more" (even a refresh nobody watches).
  // Ignored while signing in: that path already shows its own error on the login screen.
  useEffect(
    () =>
      onAccessLost((reason) => {
        if (statusRef.current === AUTH_STATUS.READY) setAccessLostReason(reason);
      }),
    [],
  );

  usePolling(
    async ({ isActive }) => {
      try {
        const { employee: fresh } = await apiGet('/api/me');
        if (!isActive()) return;
        // Answering again means the access is there (it may have been given back)
        setAccessLostReason(null);
        setEmployee((previous) => (isSameEmployee(previous, fresh) ? previous : fresh));
      } catch (error) {
        // A revoked account is reported by the API client itself; anything else is only logged
        if (!isAccessLostError(error)) captureClientException(error, { action: 'session-sync' });
      }
    },
    { intervalMs: SESSION_SYNC_MS, enabled: status === AUTH_STATUS.READY },
  );

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus(AUTH_STATUS.SIGNED_OUT);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!firebaseUser) {
        setEmployee(null);
        setSignedInEmail(null);
        setAccessLostReason(null);
        // The preview never outlives the session
        setPreviewAsMember(false);
        setStatus(AUTH_STATUS.SIGNED_OUT);
        return;
      }

      try {
        const { employee: me } = await apiGet('/api/me');
        setAuthError(null);
        setEmployee(me);
        setSignedInEmail(firebaseUser.email?.toLowerCase() ?? null);
        setStatus(AUTH_STATUS.READY);
      } catch (error) {
        setAuthError(getErrorMessage(error));
        await firebaseSignOut(getFirebaseAuth());
      }
    });

    return unsubscribe;
  }, [setPreviewAsMember]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    }
  }, []);

  const signOut = useCallback(() => firebaseSignOut(getFirebaseAuth()), []);

  // What the interface shows follows `isAdmin`; `isRealAdmin` is what the account really is (it keeps
  // the way back from the preview). Permissions are always enforced by the server, never by this.
  const isRealAdmin = employee?.role === ROLES.ADMIN;
  const isAdmin = isRealAdmin && !previewAsMember;

  const value = useMemo(
    () => ({ status, employee, signedInEmail, authError, accessLostReason, signIn, signOut, isAdmin, isRealAdmin, previewAsMember, setPreviewAsMember }),
    [status, employee, signedInEmail, authError, accessLostReason, signIn, signOut, isAdmin, isRealAdmin, previewAsMember, setPreviewAsMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
