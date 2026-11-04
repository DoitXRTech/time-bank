import { useCallback, useEffect, useId, useState } from 'react';
import { Modal } from './Modal';
import es from '../content/es';
import { isNewVersionAvailable } from '../domain/appVersion';
import { usePolling } from '../hooks/usePolling';
import { onAppOutdated } from '../lib/apiClient';
import { currentBuildId, fetchLatestBuildId, reloadPage, VERSION_CHECK_MS } from '../lib/appVersion';
import { captureClientException } from '../lib/clientMonitoring';

/**
 * Notices that a newer deploy exists than the code this tab is running, and then puts a notice
 * over the whole app whose only way out is reloading: nobody keeps working on old code. It finds
 * out three ways: on opening, every minute (and when the tab comes back or gets focus), and the
 * moment the server refuses a change because the page is out of date (see lib/appVersion.js).
 * Renders nothing until then.
 */
export function AppUpdateNotifier() {
  const [outdated, setOutdated] = useState(false);
  const titleId = useId();
  const messageId = useId();

  const checkForUpdate = useCallback(async () => {
    const ownBuildId = currentBuildId();
    // Local builds have no id to compare, so there is nothing to check
    if (!ownBuildId) return;
    try {
      if (isNewVersionAvailable(ownBuildId, await fetchLatestBuildId())) setOutdated(true);
    } catch (error) {
      // Offline, or a deploy in progress: not actionable, the next check tries again
      captureClientException(error, { action: 'version-check' });
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);
  usePolling(checkForUpdate, { intervalMs: VERSION_CHECK_MS, enabled: !outdated });
  useEffect(() => onAppOutdated(() => setOutdated(true)), []);

  if (!outdated) return null;

  // `busy` keeps Escape and the backdrop from closing it: the only way out is the button
  return (
    <Modal labelledBy={titleId} describedBy={messageId} busy onClose={() => {}}>
      <h2 id={titleId} className="text-lg font-semibold">
        {es.appUpdate.title}
      </h2>
      <p id={messageId} className="mt-1 text-sm text-ink-soft">
        {es.appUpdate.message}
      </p>
      <div className="mt-6 flex justify-end">
        <button type="button" className="btn" autoFocus onClick={reloadPage}>
          {es.appUpdate.reload}
        </button>
      </div>
    </Modal>
  );
}
