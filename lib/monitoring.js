/**
 * Single seam for reporting unexpected server errors. It logs to the console for now;
 * when Sentry is wired (@sentry/nextjs, organization `doitxr`) this is the only file to change.
 */
export function captureException(error, context = {}) {
  console.error('[server error]', context, error);
}
