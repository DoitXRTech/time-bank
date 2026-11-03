/**
 * Single seam for reporting browser errors. It logs to the console for now; when Sentry is
 * wired (@sentry/nextjs, organization `doitxr`) this is the only client file to change.
 */
export function captureClientException(error, context = {}) {
  console.error('[client error]', context, error);
}
