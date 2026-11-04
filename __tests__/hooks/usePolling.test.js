/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { usePolling } from '@/hooks/usePolling';
import { captureClientException } from '@/lib/clientMonitoring';

jest.mock('@/lib/clientMonitoring', () => ({ captureClientException: jest.fn() }));

const setVisibility = (state) => Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePolling', () => {
  it('runs the task every interval while the tab is visible', async () => {
    const task = jest.fn().mockResolvedValue();
    renderHook(() => usePolling(task, { intervalMs: 10_000 }));

    await advance(10_000);
    await advance(10_000);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled or without an interval', async () => {
    const task = jest.fn().mockResolvedValue();
    const { rerender } = renderHook(({ enabled }) => usePolling(task, { intervalMs: 10_000, enabled }), { initialProps: { enabled: false } });
    renderHook(() => usePolling(task, {}));

    await advance(60_000);
    expect(task).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await advance(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('skips a hidden tab, then runs as soon as it is visible again', async () => {
    const task = jest.fn().mockResolvedValue();
    renderHook(() => usePolling(task, { intervalMs: 10_000 }));

    setVisibility('hidden');
    await advance(60_000);
    expect(task).not.toHaveBeenCalled();

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('can keep a hidden tab up to date, but only rarely', async () => {
    const task = jest.fn().mockResolvedValue();
    renderHook(() => usePolling(task, { intervalMs: 10_000, hiddenIntervalMs: 60_000 }));
    await advance(10_000);
    expect(task).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await advance(50_000);
    expect(task).toHaveBeenCalledTimes(1);

    await advance(10_000);
    expect(task).toHaveBeenCalledTimes(2);

    await advance(50_000);
    expect(task).toHaveBeenCalledTimes(2);
    await advance(10_000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('never runs the task twice at once', async () => {
    let finish;
    const task = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderHook(() => usePolling(task, { intervalMs: 10_000 }));

    await advance(30_000);
    expect(task).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await advance(10_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('reports a task that throws and keeps going', async () => {
    const failure = new Error('boom');
    const task = jest.fn().mockRejectedValueOnce(failure).mockResolvedValue();
    renderHook(() => usePolling(task, { intervalMs: 10_000 }));

    await advance(10_000);
    await advance(10_000);

    expect(captureClientException).toHaveBeenCalledWith(failure, { action: 'polling-task' });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('always runs the latest task, so it sees current state', async () => {
    const seen = [];
    const { rerender } = renderHook(({ value }) => usePolling(async () => seen.push(value), { intervalMs: 10_000 }), { initialProps: { value: 'old' } });

    rerender({ value: 'new' });
    await advance(10_000);

    expect(seen).toEqual(['new']);
  });

  it('tells the task when the screen is gone, so a late answer can be dropped, and stops', async () => {
    let isActiveLater;
    const task = jest.fn(async ({ isActive }) => {
      isActiveLater = isActive;
    });
    const { unmount } = renderHook(() => usePolling(task, { intervalMs: 10_000 }));
    await advance(10_000);
    expect(isActiveLater()).toBe(true);

    unmount();
    expect(isActiveLater()).toBe(false);
    await advance(60_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
