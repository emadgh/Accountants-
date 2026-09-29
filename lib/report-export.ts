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

function escapeHtml(value: ExportCell) {
  return safeSpreadsheetValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export function downloadCsv(filename: string, headers: ExportCell[], rows: ExportCell[][]) {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  downloadBlob(filename.endsWith('.csv') ? filename : filename + '.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export function downloadExcel(filename: string, title: string, headers: ExportCell[], rows: ExportCell[][]) {
  const table = [
    '<table border="1" cellspacing="0" cellpadding="4" dir="rtl">',
    '<thead><tr>' + headers.map((value) => '<th>' + escapeHtml(value) + '</th>').join('') + '</tr></thead>',
    '<tbody>',
    ...rows.map((row) => '<tr>' + row.map((value) => '<td>' + escapeHtml(value) + '</td>').join('') + '</tr>'),
    '</tbody></table>',
  ].join('');

  const html = [
    '<!doctype html><html><head><meta charset="UTF-8">',
    '<style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl}table{border-collapse:collapse}th{font-weight:bold;background:#f3f4f6}td,th{mso-number-format:"\\@";}</style>',
    '</head><body><h2>' + escapeHtml(title) + '</h2>',
    table,
    '</body></html>',
  ].join('');

  downloadBlob(
    filename.endsWith('.xls') ? filename : filename + '.xls',
    html,
    'application/vnd.ms-excel;charset=utf-8'
  );
}
