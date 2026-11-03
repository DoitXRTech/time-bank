import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/apiClient';

/**
 * Loads `url` with the authenticated client. Pass a falsy url to skip the request.
 * @returns {{ data: object|null, error: Error|null, loading: boolean, reload: () => void }}
 */
export function useApiData(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    apiGet(url)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [url, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
}
