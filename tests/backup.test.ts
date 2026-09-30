import { describe, expect, it } from 'vitest';
import { createEmptyAccountingData } from '../lib/data';
import { parseAccountingBackup } from '../lib/backup';

describe('backup compatibility', () => {
  it('restores a legacy JSON backup without quote, project, or attachment arrays', async () => {
    const { quotes: _quotes, projects: _projects, attachments: _attachments, ...legacyData } = createEmptyAccountingData();
    const result = await parseAccountingBackup(JSON.stringify(legacyData));

    expect(result.preview.source).toBe('legacy');
    expect(result.data.quotes).toEqual([]);
    expect(result.data.projects).toEqual([]);
    expect(result.data.attachments).toEqual([]);
    expect(result.preview.warnings).toContain('پشتیبان قدیمی بدون schemaVersion شناسایی شد و هنگام بازیابی Migration می‌شود.');
  });
});
