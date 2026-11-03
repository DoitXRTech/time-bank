import { ExternalServiceError } from './errors';
import { parseCsv } from '../src/domain/import/csv';
import { sheetCsvUrl, sheetXlsxUrl } from '../src/domain/import/sheetUrl';
import { readWorkbook } from './xlsx/workbook';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

/**
 * Reads one tab of a Google Sheet as rows. It works when the sheet is shared "anyone with the
 * link"; a private sheet answers with a sign-in page, which is reported as not readable.
 */
export async function fetchSheetTab(sheetId, gid) {
  let response;
  try {
    response = await fetch(sheetCsvUrl(sheetId, gid), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new ExternalServiceError('Could not reach Google Sheets', { reason: 'SHEET_NOT_READABLE', cause: error.message });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('csv')) {
    throw new ExternalServiceError('The sheet could not be read as CSV (is it shared by link?)', {
      reason: 'SHEET_NOT_READABLE',
      status: response.status,
    });
  }
  return parseCsv(await response.text());
}

/**
 * Reads the whole spreadsheet as a workbook (every tab, with the formatting the import needs:
 * strikethrough and hidden rows). Same requirement as fetchSheetTab: shared "anyone with the link".
 */
export async function fetchSheetWorkbook(sheetId) {
  let response;
  try {
    response = await fetch(sheetXlsxUrl(sheetId), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new ExternalServiceError('Could not reach Google Sheets', { reason: 'SHEET_NOT_READABLE', cause: error.message });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('spreadsheetml')) {
    throw new ExternalServiceError('The sheet could not be read as a workbook (is it shared by link?)', {
      reason: 'SHEET_NOT_READABLE',
      status: response.status,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_WORKBOOK_BYTES) {
    throw new ExternalServiceError('The spreadsheet is too large to import', { reason: 'SHEET_NOT_READABLE' });
  }

  try {
    return readWorkbook(buffer);
  } catch (error) {
    throw new ExternalServiceError('The downloaded file is not a readable spreadsheet', { reason: 'SHEET_NOT_READABLE', cause: error.message });
  }
}
