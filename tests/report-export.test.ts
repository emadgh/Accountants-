import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createExcelWorkbook } from '../lib/report-export';

describe('Excel report export', () => {
  it('creates an OOXML workbook and stores formula-like user values as safe text', () => {
    const workbook = unzipSync(createExcelWorkbook('گزارش فروش', ['شرح', 'مبلغ'], [['=HYPERLINK("https://example.com")', 1250]]));
    expect(Object.keys(workbook)).toContain('[Content_Types].xml');
    expect(Object.keys(workbook)).toContain('xl/workbook.xml');
    const sheet = strFromU8(workbook['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('&apos;=HYPERLINK');
    expect(sheet).toContain('t="n"><v>1250</v>');
    expect(sheet).toContain('rightToLeft="1"');
  });
});
