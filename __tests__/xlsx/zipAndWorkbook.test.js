import { createZip } from '../helpers/zipBuilder';
import { readWorkbook } from '../../lib/xlsx/workbook';
import { readZip } from '../../lib/xlsx/zip';

describe('readZip', () => {
  const files = { 'a.txt': 'hello', 'dir/b.xml': '<x>ñandú</x>'.repeat(50) };

  it('reads deflated entries', () => {
    const zip = readZip(createZip(files));
    expect(zip.get('a.txt').toString()).toBe('hello');
    expect(zip.get('dir/b.xml').toString()).toBe(files['dir/b.xml']);
  });

  it('reads stored (uncompressed) entries', () => {
    expect(readZip(createZip(files, { stored: true })).get('a.txt').toString()).toBe('hello');
  });

  it('rejects something that is not a zip, such as the sign-in page Google answers to a private sheet', () => {
    expect(() => readZip(Buffer.from('<html><body>Sign in</body></html>'))).toThrow('Not a zip file');
  });

  it('rejects a zip whose central directory is damaged', () => {
    const zip = createZip(files);
    const broken = Buffer.from(zip);
    broken.writeUInt32LE(0xdeadbeef, broken.readUInt32LE(broken.length - 22 + 16));
    expect(() => readZip(broken)).toThrow('Corrupt zip');
  });
});

// A tiny but real workbook: shared strings, rich text, a struck-through style, inline text, a number, a hidden row
const WORKBOOK = {
  'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Feriados &amp; Más" sheetId="1" r:id="rId1"/><sheet name="Otra" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<sst><si><t>Reponer</t></si><si><t>Lo toma</t></si><si><r><rPr><strike/></rPr><t>Reponer</t></r></si><si><r><t>Re</t></r><r><rPr><strike val="0"/></rPr><t>poner</t></r></si></sst>',
  'xl/styles.xml':
    '<styleSheet><fonts count="2"><font><sz val="10"/></font><font><strike/><sz val="10"/></font></fonts><cellXfs count="2"><xf fontId="0" numFmtId="0"/><xf fontId="1" numFmtId="0"><alignment/></xf></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml':
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" s="0" t="s"><v>0</v></c><c r="B1" s="1" t="s"><v>0</v></c><c r="C1" s="0" t="s"><v>2</v></c><c r="D1" s="0"><v>45658.0</v></c><c r="F1" t="inlineStr"><is><t>en línea</t></is></c></row>' +
    '<row r="2" hidden="1"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="str"><v>fórmula</v></c></row>' +
    '</sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="3"><c r="B3" t="s"><v>1</v></c></row></sheetData></worksheet>',
};

describe('readWorkbook', () => {
  const sheets = readWorkbook(createZip(WORKBOOK));
  const [first, second] = sheets;

  it('lists the tabs with their decoded names', () => {
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Feriados & Más', 'Otra']);
  });

  it('reads text, numbers, inline text and formula text, by row and column', () => {
    expect(first.rows[0][0]).toEqual({ text: 'Reponer', number: null, strike: false });
    expect(first.rows[0][3]).toEqual({ text: '45658.0', number: 45658, strike: false });
    expect(first.rows[0][5].text).toBe('en línea');
    expect(first.rows[1][2].text).toBe('fórmula');
    expect(first.rows[0][4]).toBeUndefined(); // an empty cell between two filled ones
  });

  it('knows a cell is struck through when its cell format says so', () => {
    expect(first.rows[0][0].strike).toBe(false);
    expect(first.rows[0][1].strike).toBe(true);
  });

  it('knows a cell is struck through when all of its rich-text runs are', () => {
    expect(first.rows[0][2].strike).toBe(true);
    // A partly struck text ("strike val=0" on one run, none on the other) is not struck
    expect(first.rows[1][1]).toMatchObject({ text: 'Reponer', strike: false });
  });

  it('lists the hidden rows (1-based) and follows a relationship with an absolute target', () => {
    expect([...first.hiddenRows]).toEqual([2]);
    expect(second.hiddenRows.size).toBe(0);
    expect(second.rows[2][1].text).toBe('Lo toma');
  });

  it('fails clearly on a file that is a zip but not a spreadsheet', () => {
    expect(() => readWorkbook(createZip({ 'hello.txt': 'x' }))).toThrow('xl/workbook.xml is missing');
  });
});
