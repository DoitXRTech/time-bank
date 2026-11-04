/**
 * Which deploy of the app something comes from. Each deploy has an id (the commit Vercel built, see
 * next.config.js); a tab keeps the id of the code it loaded, and the server always answers with the
 * id of the latest deploy. When they differ, the tab runs old code.
 */

// The header the browser sends with every call, so the server knows which code made it
export const BUILD_ID_HEADER = 'x-app-build';

/** Local builds share this id, so they never report a mismatch with themselves */
const UNVERSIONED_BUILD_ID = 'development';

export function isNewVersionAvailable(currentBuildId, latestBuildId) {
  if (!currentBuildId || !latestBuildId) return false;
  if (currentBuildId === UNVERSIONED_BUILD_ID || latestBuildId === UNVERSIONED_BUILD_ID) return false;
  return currentBuildId !== latestBuildId;
}
