export const VERSION_ENDPOINT = '/api/version';

// How often an open tab asks whether a newer deploy exists (the answer costs no database read)
export const VERSION_CHECK_MS = 60_000;

/** The id of the deploy this tab's code came from; Next inlines it into the bundle at build time */
export function currentBuildId() {
  return process.env.NEXT_PUBLIC_APP_BUILD_ID;
}

/** Asks the server for the id of the latest deploy. Throws on any failed or malformed answer. */
export async function fetchLatestBuildId() {
  const response = await fetch(VERSION_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Version check failed with status ${response.status}`);
  const { buildId } = await response.json();
  if (typeof buildId !== 'string') throw new Error('Version check returned no buildId');
  return buildId;
}

/** Loads the new code. A function of its own so tests can replace it (the browser's reload cannot be). */
export function reloadPage() {
  window.location.reload();
}
