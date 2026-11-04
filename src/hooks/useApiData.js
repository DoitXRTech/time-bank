import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, isAccessLostError } from '../lib/apiClient';
import { captureClientException } from '../lib/clientMonitoring';
import { usePolling } from './usePolling';

/** Same payload, so the screen has nothing to redraw (keeps the previous reference) */
function isSameData(previous, next) {
  return JSON.stringify(previous) === JSON.stringify(next);
}

/**
 * Loads `url` with the authenticated client. Pass a falsy url to skip the request.
 *
 * With `refreshIntervalMs` the data also stays current on its own (see `usePolling`): it is fetched
 * again in the background every interval, and when the tab becomes visible or the window regains
 * focus. A background refresh never shows the loading state, keeps what is on screen when it fails
 * (the next tick tries again) and keeps the same `data` reference when nothing changed.
 * `hiddenRefreshIntervalMs` makes a hidden tab refresh too, but that rarely.
 *
 * @param {string|null} url
 * @param {{ refreshIntervalMs?: number, hiddenRefreshIntervalMs?: number }} [options]
 * @returns {{ data: object|null, error: Error|null, loading: boolean, reload: () => void }}
 */
export function useApiData(url, { refreshIntervalMs, hiddenRefreshIntervalMs } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const [reloadToken, setReloadToken] = useState(0);
  // Only the newest response may land: a slow background answer must not overwrite a newer load
  const latestRequestRef = useRef(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }

    let cancelled = false;
    const requestId = ++latestRequestRef.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    apiGet(url)
      .then((data) => {
        if (!cancelled && latestRequestRef.current === requestId) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled && latestRequestRef.current === requestId) setState({ data: null, error, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [url, reloadToken]);

  usePolling(
    async ({ isActive }) => {
      const requestId = ++latestRequestRef.current;
      try {
        const data = await apiGet(url);
        if (isActive() && latestRequestRef.current === requestId) {
          // `loading: false` also closes a foreground load this newer answer has just replaced
          setState((previous) => (isSameData(previous.data, data) ? { ...previous, error: null, loading: false } : { data, error: null, loading: false }));
        }
      } catch (error) {
        // A lost account is not a failure to report: the session shows the block screen for it
        if (!isAccessLostError(error)) captureClientException(error, { action: 'background-refresh', url });
      }
    },
    { intervalMs: refreshIntervalMs, hiddenIntervalMs: hiddenRefreshIntervalMs, enabled: Boolean(url) },
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
}
