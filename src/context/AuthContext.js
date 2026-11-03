import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/apiClient';
import { ROLES } from '../domain/movementTypes';
import { captureClientException } from '../lib/clientMonitoring';
import { getErrorMessage } from '../lib/errorMessages';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

const AuthContext = createContext(null);

// "Ver como colaborador": lives only in this browser tab
const PREVIEW_STORAGE_KEY = 'time-bank-view-as-collaborator';

export const AUTH_STATUS = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  READY: 'ready',
});

/**
 * A Google account only counts as signed in once the server confirms it maps to an active
 * employee of an allowed domain (GET /api/me). Otherwise the Firebase session is dropped
 * and the reason is kept to show on the login screen.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.LOADING);
  const [employee, setEmployee] = useState(null);
  // The Google email of this session; an employee can have several, so it is not employee.emails[0]
  const [signedInEmail, setSignedInEmail] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [previewAsMember, setPreviewAsMemberState] = useState(false);

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

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus(AUTH_STATUS.SIGNED_OUT);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!firebaseUser) {
        setEmployee(null);
        setSignedInEmail(null);
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
    () => ({ status, employee, signedInEmail, authError, signIn, signOut, isAdmin, isRealAdmin, previewAsMember, setPreviewAsMember }),
    [status, employee, signedInEmail, authError, signIn, signOut, isAdmin, isRealAdmin, previewAsMember, setPreviewAsMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
