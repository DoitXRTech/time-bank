/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, commas and line breaks inside
 * quotes). Spreadsheet exports are small, so everything is parsed in memory.
 * Files under src/domain/import use explicit `.js` extensions in relative imports so the
 * dry-run script can load them with plain Node.
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else inQuotes = false;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
