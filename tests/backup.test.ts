import { describe, expect, it } from 'vitest';
import { createEmptyAccountingData } from '../lib/data';
import { parseAccountingBackup, parseAccountingBackupFile } from '../lib/backup';
import { validateAccountingData } from '../lib/accounting-validation';

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

  it('normalizes an older posted invoice backup and reconstructs missing accounts, stock movements, and journals', async () => {
    const defaults = createEmptyAccountingData();
    const legacy = {
      settings: { businessName: 'دفتر قدیمی', currency: 'تومان', defaultTax: 0 },
      customers: [],
      products: [{ id: 'old_product', code: 'P-1', name: 'کالای قدیمی', kind: 'product', unit: 'عدد', salePrice: 100, buyPrice: 40, averageCost: 40, stock: 3, minStock: 0 }],
      invoices: [{ id: 'old_invoice', number: 'S-1', kind: 'sale', status: 'final', date: '2026-01-01', customerName: 'مشتری قدیمی', items: [{ id: 'old_line', productId: 'old_product', description: 'کالا', unit: 'عدد', qty: 1, unitPrice: 100 }], discount: 0, tax: 0, shipping: 0, notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      returns: [], payments: [], checks: [], adjustments: [], moneyTransactions: [],
    };
    const result = await parseAccountingBackup(JSON.stringify(legacy));

    expect(result.data.customers[0].name).toBe('مشتری قدیمی');
    expect(result.data.invoices[0].businessProfileId).toBe(defaults.settings.defaultBusinessProfileId);
    expect(result.data.stockMovements.some((movement) => movement.sourceType === 'invoice' && movement.sourceId === 'old_invoice' && movement.quantity === -1)).toBe(true);
    expect(result.data.journalEntries.some((entry) => entry.sourceType === 'invoice' && entry.sourceId === 'old_invoice')).toBe(true);
    expect(validateAccountingData(result.data)).toMatchObject({ ok: true });
  });

  it('does not treat a JSON backup with attachment metadata as a complete restore package', async () => {
    const data = createEmptyAccountingData();
    data.projects.push({ id: 'project_backup', customerId: 'customer_missing', title: 'پروژه', status: 'in-progress', agreedAmount: 0, notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    data.customers.push({ id: 'customer_missing', code: 'C-1', name: 'مشتری', kind: 'customer', status: 'active', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0 });
    data.attachments.push({ id: 'attachment_backup', projectId: 'project_backup', filename: 'design.pdf', mimeType: 'application/pdf', size: 8, storageKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf', createdAt: '2026-01-01T00:00:00.000Z' });
    const file = new File([JSON.stringify(data)], 'data-only.json', { type: 'application/json' });

    await expect(parseAccountingBackupFile(file)).rejects.toThrow('فایل‌های پیوست را شامل نمی‌شود');
  });
});
