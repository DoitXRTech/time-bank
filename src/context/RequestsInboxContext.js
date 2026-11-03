import { createContext, useContext, useEffect, useMemo } from 'react';
import { useApiData } from '../hooks/useApiData';
import { AUTH_STATUS, useAuth } from './AuthContext';

const REFRESH_INTERVAL_MS = 60_000;

const RequestsInboxContext = createContext(null);

/**
 * The requests waiting for a decision, for the admins: the admin page lists them and the header
 * shows how many there are. Clients never listen to Firestore, so the alert is kept fresh by
 * asking again every minute (only while the tab is visible) and when the tab comes back.
 */
export function RequestsInboxProvider({ children }) {
  const { status, isAdmin } = useAuth();
  const enabled = status === AUTH_STATUS.READY && isAdmin;
  const { data, error, loading, reload } = useApiData(enabled ? '/api/requests' : null);

  useEffect(() => {
    if (!enabled) return undefined;

    const reloadIfVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = window.setInterval(reloadIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', reloadIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', reloadIfVisible);
    };
  }, [enabled, reload]);

  const value = useMemo(() => {
    const requests = data?.requests ?? [];
    return { requests, count: requests.length, loading, error, reload };
  }, [data, loading, error, reload]);

  return <RequestsInboxContext.Provider value={value}>{children}</RequestsInboxContext.Provider>;
}

export function useRequestsInbox() {
  const context = useContext(RequestsInboxContext);
  if (!context) throw new Error('useRequestsInbox must be used inside <RequestsInboxProvider>');
  return context;
}
