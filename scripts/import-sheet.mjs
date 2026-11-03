/**
 * DRY RUN of the spreadsheet import. It reads the team's Google Sheet, builds the import plan and
 * writes a report. It never writes to Firestore: there is no apply mode yet (people still need
 * their emails, see CLAUDE.md).
 *
 *   npm run import:dry-run -- --sheet-id <id> [--trust-balance]
 *   (or set IMPORT_SHEET_ID in .env.local)
 *
 * Outputs go to the git-ignored `import-data/` folder (they contain employee names):
 *   dry-run-report.md             what would be imported and what needs a decision
 *   name-mapping.suggested.json   names of the overtime tab with the suggested person
 * Confirmed matches go in `import-data/name-mapping.json`, which the next run reads.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildImportPlan } from '../src/domain/import/buildImportPlan.js';
import { parseCsv } from '../src/domain/import/csv.js';
import { formatReport, formatSummary } from '../src/domain/import/formatReport.js';
import { isValidIsoDate } from '../src/domain/isoDate.js';
import { parseOvertimeTab } from '../src/domain/import/overtimeTab.js';
import { parseVacationsTab } from '../src/domain/import/vacationsTab.js';

const OUTPUT_DIR = new URL('../import-data/', import.meta.url);

function todayIsoDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
const TABS = { vacations: '896284519', overtime: '1900223631' };

async function fetchTabRows(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? '';
  // A sheet that is not shared by link answers with a sign-in HTML page instead of a CSV
  if (!response.ok || !contentType.includes('csv')) {
    throw new Error(`Could not read tab ${gid} as CSV (HTTP ${response.status}, ${contentType || 'no content type'}). Is the sheet shared by link?`);
  }
  return parseCsv(await response.text());
}

async function readNameMapping() {
  try {
    return JSON.parse(await readFile(new URL('name-mapping.json', OUTPUT_DIR), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`import-data/name-mapping.json is not valid JSON: ${error.message}`);
  }
}

function suggestedMappingFile(plan) {
  return Object.fromEntries(plan.unresolvedNames.map((entry) => [entry.rawName, entry.match ?? '']));
}

async function main() {
  const { values } = parseArgs({
    options: {
      'sheet-id': { type: 'string' },
      'trust-balance': { type: 'boolean', default: false },
      // The sheet's vacation formulas use TODAY(), so by default the balances are dated today
      'opening-date': { type: 'string', default: todayIsoDate() },
    },
  });
  if (!isValidIsoDate(values['opening-date'])) throw new Error('--opening-date must be a valid YYYY-MM-DD date');
  const sheetId = values['sheet-id'] ?? process.env.IMPORT_SHEET_ID;
  if (!sheetId) throw new Error('Pass --sheet-id <id> or set IMPORT_SHEET_ID');

  const [vacationRows, overtimeRows, nameMapping] = await Promise.all([
    fetchTabRows(sheetId, TABS.vacations),
    fetchTabRows(sheetId, TABS.overtime),
    readNameMapping(),
  ]);

  const openingDate = values['opening-date'];
  const vacations = parseVacationsTab(vacationRows);
  // Dates written without a year ("Febrero", "06/03") belong to the year of the import
  const defaultYear = Number(openingDate.slice(0, 4));
  const overtime = parseOvertimeTab(overtimeRows, { trustBalance: values['trust-balance'], defaultYear });

  const plan = buildImportPlan({ vacations, overtime, nameMapping, openingDate });

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(new URL('dry-run-report.md', OUTPUT_DIR), formatReport(plan));
  await writeFile(new URL('name-mapping.suggested.json', OUTPUT_DIR), `${JSON.stringify(suggestedMappingFile(plan), null, 2)}\n`);

  console.log(formatSummary(plan));
  console.log('\nNothing was written to the database. Full report: import-data/dry-run-report.md');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
