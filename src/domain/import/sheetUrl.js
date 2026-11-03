// Only Google Sheets links are accepted, and the server builds the export URL itself from the
// sheet id: the pasted URL is never fetched as is (no way to point the server at another host).
const SHEET_HOST = 'docs.google.com';
const SHEET_PATH_PATTERN = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/;

/** The sheet id of a Google Sheets link, or null when it is not one */
export function parseSheetUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== SHEET_HOST) return null;
  return SHEET_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
}

/** The whole workbook as .xlsx (keeps formatting such as strikethrough, which CSV loses) */
export function sheetXlsxUrl(sheetId) {
  return `https://${SHEET_HOST}/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`;
}

/** CSV export of one tab; works when the sheet is shared "anyone with the link" */
export function sheetCsvUrl(sheetId, gid) {
  return `https://${SHEET_HOST}/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}
