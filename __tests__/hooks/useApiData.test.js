/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useApiData } from '@/hooks/useApiData';
import { apiGet } from '@/lib/apiClient';
import { captureClientException } from '@/lib/clientMonitoring';

jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));
jest.mock('@/lib/clientMonitoring', () => ({ captureClientException: jest.fn() }));

const INTERVAL = 30_000;
const URL = '/api/requests';

function deferred() {
  const handle = {};
  handle.promise = new Promise((resolve, reject) => {
    handle.resolve = resolve;
    handle.reject = reject;
  });
  return handle;
}

const setVisibility = (state) => Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const flush = () => act(async () => {});

async function renderLive(options = { refreshIntervalMs: INTERVAL }, url = URL) {
  const view = renderHook(() => useApiData(url, options));
  await flush();
  return view;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setVisibility('visible');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useApiData: loading', () => {
  it('loads the url once and does not poll when no interval is given', async () => {
    apiGet.mockResolvedValue({ requests: [] });
    const { result } = await renderLive({});

    expect(result.current).toMatchObject({ data: { requests: [] }, loading: false, error: null });
    await advance(10 * INTERVAL);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when there is no url', async () => {
    const { result } = await renderLive({ refreshIntervalMs: INTERVAL }, null);

    await advance(3 * INTERVAL);
    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ data: null, loading: false });
  });

  it('keeps the old data on screen while a manual reload is in flight', async () => {
    apiGet.mockResolvedValueOnce({ n: 1 });
    const { result } = await renderLive({});
    const pending = deferred();
    apiGet.mockReturnValueOnce(pending.promise);

    act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: { n: 1 }, loading: true });

    await act(async () => pending.resolve({ n: 2 }));
    expect(result.current).toMatchObject({ data: { n: 2 }, loading: false });
  });
});

describe('useApiData: staying current', () => {
  it('fetches again every interval and shows the new data without ever showing the loading state', async () => {
    apiGet.mockResolvedValueOnce({ requests: ['a'] }).mockResolvedValueOnce({ requests: ['a', 'b'] });
    const loadingSeen = [];
    const { result } = renderHook(() => {
      const resource = useApiData(URL, { refreshIntervalMs: INTERVAL });
      loadingSeen.push(resource.loading);
      return resource;
    });
    await flush();
    loadingSeen.length = 0;

    await advance(INTERVAL);

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ requests: ['a', 'b'] });
    expect(loadingSeen.length).toBeGreaterThan(0);
    expect(loadingSeen.every((loading) => loading === false)).toBe(true);
  });

  it('keeps the very same data object when nothing changed, so the screen does not redraw', async () => {
    apiGet.mockImplementation(async () => ({ requests: ['a'] }));
    const { result } = await renderLive();
    const before = result.current.data;

    await advance(INTERVAL);

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe(before);
  });

  it('does not refresh while the tab is hidden, and refreshes as soon as it is visible again', async () => {
    apiGet.mockResolvedValueOnce({ n: 1 }).mockResolvedValue({ n: 2 });
    const { result } = await renderLive();

    setVisibility('hidden');
    await advance(3 * INTERVAL);
    expect(apiGet).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ n: 2 });
  });

  it('refreshes when the window regains focus, but not twice in a burst', async () => {
    apiGet.mockResolvedValue({ n: 1 });
    await renderLive();
    await advance(INTERVAL);
    expect(apiGet).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(apiGet).toHaveBeenCalledTimes(2);

    await advance(6_000);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  it('never has two background requests at once: a slow answer is awaited, not stacked', async () => {
    apiGet.mockResolvedValueOnce({ n: 1 });
    await renderLive();
    const slow = deferred();
    apiGet.mockReturnValue(slow.promise);

    await advance(3 * INTERVAL);

    expect(apiGet).toHaveBeenCalledTimes(2);
    await act(async () => slow.resolve({ n: 1 }));
  });

  it('keeps what is on screen when a background refresh fails, reports it, and tries again next time', async () => {
    apiGet.mockResolvedValueOnce({ n: 1 }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ n: 3 });
    const { result } = await renderLive();

    await advance(INTERVAL);
    expect(result.current).toMatchObject({ data: { n: 1 }, error: null });
    expect(captureClientException).toHaveBeenCalledWith(expect.any(Error), { action: 'background-refresh', url: URL });

    await advance(INTERVAL);
    expect(result.current.data).toEqual({ n: 3 });
  });

  it('recovers on its own when the first load failed', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ n: 1 });
    const { result } = await renderLive();
    expect(result.current).toMatchObject({ data: null, error: expect.any(Error) });

    await advance(INTERVAL);

    expect(result.current).toMatchObject({ data: { n: 1 }, error: null, loading: false });
  });

  it('a slow background answer never overwrites a newer manual reload', async () => {
    apiGet.mockResolvedValueOnce({ n: 1 });
    const { result } = await renderLive();
    const slowBackground = deferred();
    apiGet.mockReturnValueOnce(slowBackground.promise);
    await advance(INTERVAL);

    apiGet.mockResolvedValueOnce({ n: 3 });
    act(() => result.current.reload());
    await flush();
    expect(result.current.data).toEqual({ n: 3 });

    await act(async () => slowBackground.resolve({ n: 2 }));
    expect(result.current.data).toEqual({ n: 3 });
  });

  it('stops asking once the screen is gone', async () => {
    apiGet.mockResolvedValue({ n: 1 });
    const { unmount } = await renderLive();
    unmount();

    await advance(5 * INTERVAL);

    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
