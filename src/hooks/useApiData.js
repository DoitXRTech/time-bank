import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_REFRESH_GAP_MS } from '../lib/liveRefresh';
import { apiGet } from '../lib/apiClient';
import { captureClientException } from '../lib/clientMonitoring';

/** Same payload, so the screen has nothing to redraw (keeps the previous reference) */
function isSameData(previous, next) {
  return JSON.stringify(previous) === JSON.stringify(next);
}

/**
 * Loads `url` with the authenticated client. Pass a falsy url to skip the request.
 *
 * With `refreshIntervalMs` the data also stays current on its own: every interval, and when the
 * tab becomes visible or the window regains focus, it is fetched again in the background. A
 * background refresh never shows the loading state, keeps what is on screen when it fails (the
 * next tick tries again) and keeps the same `data` reference when nothing changed.
 *
 * @param {string|null} url
 * @param {{ refreshIntervalMs?: number }} [options]
 * @returns {{ data: object|null, error: Error|null, loading: boolean, reload: () => void }}
 */
export function useApiData(url, { refreshIntervalMs } = {}) {
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

  useEffect(() => {
    if (!url || !refreshIntervalMs) return undefined;

    let active = true;
    let inFlight = false;
    let lastStartedAt = 0;

    async function refreshInBackground() {
      const now = Date.now();
      if (inFlight || document.visibilityState !== 'visible' || now - lastStartedAt < MIN_REFRESH_GAP_MS) return;
      inFlight = true;
      lastStartedAt = now;
      const requestId = ++latestRequestRef.current;
      try {
        const data = await apiGet(url);
        if (active && latestRequestRef.current === requestId) {
          // `loading: false` also closes a foreground load this newer answer has just replaced
          setState((previous) => (isSameData(previous.data, data) ? { ...previous, error: null, loading: false } : { data, error: null, loading: false }));
        }
      } catch (error) {
        captureClientException(error, { action: 'background-refresh', url });
      } finally {
        inFlight = false;
      }
    }

    const timer = window.setInterval(refreshInBackground, refreshIntervalMs);
    document.addEventListener('visibilitychange', refreshInBackground);
    window.addEventListener('focus', refreshInBackground);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshInBackground);
      window.removeEventListener('focus', refreshInBackground);
    };
  }, [url, refreshIntervalMs]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
}
