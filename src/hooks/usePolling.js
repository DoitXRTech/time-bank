import { useEffect, useRef } from 'react';
import { captureClientException } from '../lib/clientMonitoring';
import { MIN_REFRESH_GAP_MS } from '../lib/liveRefresh';

/**
 * Runs `task` by itself while the screen is open: every `intervalMs`, and as soon as the tab becomes
 * visible or the window regains focus. It never runs twice at once (a slow answer is awaited, not
 * stacked), and not more than once per `MIN_REFRESH_GAP_MS` (alt-tab fires several events).
 *
 * A hidden tab does not run it, unless `hiddenIntervalMs` is given: then it runs that rarely, e.g.
 * so a counter shown in the tab title keeps up while the person is on another tab.
 *
 * `task({ isActive })` is the latest one passed in (it can close over current state); `isActive()`
 * turns false once the screen is gone, so a late answer can be dropped. A task that throws is
 * reported and the loop goes on (one failed request must not stop it).
 *
 * @param {(context: { isActive: () => boolean }) => Promise<void>} task
 * @param {{ intervalMs?: number, hiddenIntervalMs?: number, enabled?: boolean }} options
 */
export function usePolling(task, { intervalMs, hiddenIntervalMs, enabled = true }) {
  const latestTask = useRef(task);
  useEffect(() => {
    latestTask.current = task;
  });

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let active = true;
    let inFlight = false;
    let lastStartedAt = 0;

    async function tick() {
      const now = Date.now();
      const elapsed = now - lastStartedAt;
      const isVisible = document.visibilityState === 'visible';
      const isDue = isVisible ? elapsed >= MIN_REFRESH_GAP_MS : Boolean(hiddenIntervalMs) && elapsed >= hiddenIntervalMs;
      if (inFlight || !isDue) return;

      inFlight = true;
      lastStartedAt = now;
      try {
        await latestTask.current({ isActive: () => active });
      } catch (error) {
        // The loop outlives a failed task; tasks are expected to report their own errors with more context
        captureClientException(error, { action: 'polling-task' });
      } finally {
        inFlight = false;
      }
    }

    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [enabled, intervalMs, hiddenIntervalMs]);
}
