import { strToU8, zipSync } from 'fflate';

export type ExportCell = string | number | boolean | null | undefined;

function safeSpreadsheetValue(value: ExportCell) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@]/.test(text.trim()) ? "'" + text : text;
}

function escapeCsv(value: ExportCell) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return '"' + text + '"';
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob(['\uFEFF', content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBinary(filename: string, content: Uint8Array, type: string) {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function worksheetCell(reference: string, value: ExportCell, style = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = xmlEscape(safeSpreadsheetValue(value));
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

export function downloadCsv(filename: string, headers: ExportCell[], rows: ExportCell[][]) {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  downloadBlob(filename.endsWith('.csv') ? filename : filename + '.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export function createExcelWorkbook(title: string, headers: ExportCell[], rows: ExportCell[][]) {
  const width = Math.max(1, headers.length);
  const lastColumn = columnName(width - 1);
  const lastRow = rows.length + 2;
  const sheetRows = [
    `<row r="1">${worksheetCell('A1', title, 1)}</row>`,
    `<row r="2">${headers.map((value, index) => worksheetCell(`${columnName(index)}2`, value, 2)).join('')}</row>`,
    ...rows.map((row, rowIndex) => `<row r="${rowIndex + 3}">${Array.from({ length: width }, (_, columnIndex) => worksheetCell(`${columnName(columnIndex)}${rowIndex + 3}`, row[columnIndex])).join('')}</row>`),
  ].join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="گزارش" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView showGridLines="0" rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${sheetRows}</sheetData><mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells><autoFilter ref="A2:${lastColumn}${lastRow}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`),
  };
  return zipSync(files, { level: 6 });
}

export function downloadExcel(filename: string, title: string, headers: ExportCell[], rows: ExportCell[][]) {
  const archive = createExcelWorkbook(title, headers, rows);
  downloadBinary(
    filename.replace(/\.(?:xls|xlsx)$/i, '') + '.xlsx',
    archive,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
