import { ConflictError } from './errors';
import { BUILD_ID_HEADER, isNewVersionAvailable } from '../src/domain/appVersion';

const READ_ONLY_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** The id of the deploy this server is running */
export function serverBuildId() {
  return process.env.NEXT_PUBLIC_APP_BUILD_ID;
}

/**
 * Refuses a change (anything but a read) made by a page that was loaded from an older deploy: it may
 * send what the current server no longer expects, or show a screen that does not match the rules
 * any more. The page answers it with the "reload" notice. Reads are always fine, and so is a call
 * that does not say which build it comes from (older code, scripts).
 * @throws {ConflictError} with reason `APP_OUTDATED`
 */
export function assertClientIsCurrent(req) {
  if (READ_ONLY_METHODS.includes(req.method)) return;

  const clientBuildId = req.headers?.[BUILD_ID_HEADER];
  if (isNewVersionAvailable(clientBuildId, serverBuildId())) {
    throw new ConflictError('The page is out of date: reload it', { reason: 'APP_OUTDATED' });
  }
}
