import { readZip } from './zip.js';

/**
 * Reads the parts of an .xlsx that the import needs: sheet names, cell text and numbers, the
 * strikethrough of a cell and which rows are hidden. No third-party library: Google Sheets exports
 * are regular enough for a small, strict reader.
 *
 * A cell is `{ text, number, strike }`: `number` is set for numeric cells (dates are numbers too,
 * as Excel serials), `text` is the text of a text cell or the number written out.
 */

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]) : null;
}

/** `<strike/>` is on; `<strike val="0"/>` or `val="false"` is off */
function hasStrike(xml) {
  const match = /<strike(\s[^>]*)?\/?>/.exec(xml);
  if (!match) return false;
  const value = match[1] ? attribute(`<strike${match[1]}`, 'val') : null;
  return value !== '0' && value !== 'false';
}

function columnIndex(cellRef) {
  const letters = /^[A-Z]+/.exec(cellRef)[0];
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** Shared strings, each with whether all of its text runs are struck through (rich text) */
function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, body]) => {
    const runs = [...body.matchAll(/<r>([\s\S]*?)<\/r>/g)];
    const textOf = (fragment) => [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => decodeXml(text)).join('');

    if (!runs.length) return { text: textOf(body), strike: false };
    const struck = runs.map(([, run]) => ({ text: textOf(run), strike: hasStrike(run) })).filter((run) => run.text.trim());
    return { text: struck.map((run) => run.text).join(''), strike: struck.length > 0 && struck.every((run) => run.strike) };
  });
}

/** For each cell format (`s` attribute of a cell): is its font struck through? */
function parseStrikeByStyle(xml) {
  if (!xml) return [];
  const fontsBlock = /<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(xml)?.[1] ?? '';
  const struckFonts = [...fontsBlock.matchAll(/<font(?:\s[^>]*)?>([\s\S]*?)<\/font>|<font\s*\/>/g)].map(([, body]) => hasStrike(body ?? ''));

  const xfsBlock = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  return [...xfsBlock.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(([xf]) => struckFonts[Number(attribute(xf, 'fontId') ?? 0)] ?? false);
}

function parseSheetXml(xml, sharedStrings, strikeByStyle) {
  const rows = [];
  const hiddenRows = new Set();

  for (const [, rowTag, rowBody] of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowTag, 'r'));
    if (attribute(rowTag, 'hidden') === '1') hiddenRows.add(rowNumber);
    const cells = [];

    for (const [, cellTag, cellBody = ''] of (rowBody ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = attribute(cellTag, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cellBody)?.[1];
      const inline = /<is>([\s\S]*?)<\/is>/.exec(cellBody)?.[1];
      const styleStrike = strikeByStyle[Number(attribute(cellTag, 's') ?? 0)] ?? false;
      let cell = null;

      if (type === 's' && raw !== undefined) {
        const shared = sharedStrings[Number(raw)] ?? { text: '', strike: false };
        cell = { text: shared.text, number: null, strike: styleStrike || shared.strike };
      } else if (type === 'inlineStr' && inline !== undefined) {
        cell = { text: [...inline.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => decodeXml(text)).join(''), number: null, strike: styleStrike };
      } else if (type === 'str' && raw !== undefined) {
        cell = { text: decodeXml(raw), number: null, strike: styleStrike };
      } else if (raw !== undefined && (type === null || type === 'n')) {
        cell = { text: raw, number: Number(raw), strike: styleStrike };
      }
      if (cell) cells[columnIndex(attribute(cellTag, 'r'))] = cell;
    }
    rows[rowNumber - 1] = cells;
  }
  return { rows, hiddenRows };
}

/**
 * @param {Buffer} buffer the .xlsx file
 * @returns {Array<{ name: string, rows: Array<Array<{ text: string, number: number|null, strike: boolean }|undefined>|undefined>, hiddenRows: Set<number> }>}
 *   `rows[i][j]` is the cell at row i+1, column j+1 (undefined when empty); `hiddenRows` holds 1-based row numbers
 */
export function readWorkbook(buffer) {
  const files = readZip(buffer);
  const textOf = (name) => files.get(name)?.toString('utf8');

  const workbookXml = textOf('xl/workbook.xml');
  if (!workbookXml) throw new Error('Not a spreadsheet (xl/workbook.xml is missing)');
  const relationships = new Map(
    [...(textOf('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [attribute(tag, 'Id'), attribute(tag, 'Target')]),
  );

  const sharedStrings = parseSharedStrings(textOf('xl/sharedStrings.xml'));
  const strikeByStyle = parseStrikeByStyle(textOf('xl/styles.xml'));

  return [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const target = relationships.get(attribute(tag, 'r:id'));
    const sheetXml = textOf(`xl/${String(target).replace(/^\/?(xl\/)?/, '')}`);
    if (!sheetXml) throw new Error(`Sheet "${attribute(tag, 'name')}" has no data file`);
    return { name: attribute(tag, 'name'), ...parseSheetXml(sheetXml, sharedStrings, strikeByStyle) };
  });
}
