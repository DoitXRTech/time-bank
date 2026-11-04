import { createContext, useContext, useMemo } from 'react';
import { useApiData } from '../hooks/useApiData';
import { LIVE_REFRESH_MS } from '../lib/liveRefresh';
import { AUTH_STATUS, useAuth } from './AuthContext';

const RequestsInboxContext = createContext(null);

/**
 * The requests waiting for a decision, for the admins: the admin page lists them and the header
 * shows how many there are. It refreshes on its own (see useApiData), so a request sent by a
 * collaborator reaches the badge without reloading the page.
 */
export function RequestsInboxProvider({ children }) {
  const { status, isAdmin } = useAuth();
  const enabled = status === AUTH_STATUS.READY && isAdmin;
  const { data, error, loading, reload } = useApiData(enabled ? '/api/requests' : null, { refreshIntervalMs: LIVE_REFRESH_MS });

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
