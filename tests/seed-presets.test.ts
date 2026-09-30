import { describe, expect, it } from 'vitest';
import { createSeedData, SEED_PRESETS, seedData } from '../lib/data';
import { invoiceTotal } from '../lib/utils';

describe('account setup seed presets', () => {
  it('offers an empty preset and returns no operational records for it', () => {
    expect(SEED_PRESETS.map((preset) => preset.id)).toEqual([
      'empty', 'supermarket', 'creative-studio', 'construction-suite',
    ]);
    const data = createSeedData('empty');
    expect(data.customers).toHaveLength(0);
    expect(data.products).toHaveLength(0);
    expect(data.invoices).toHaveLength(0);
    expect(data.quotes).toHaveLength(0);
    expect(data.projects).toHaveLength(0);
    expect(data.moneyTransactions).toHaveLength(0);
    expect(data.accounts.length).toBeGreaterThan(0);
  });

  it('provides supermarket products with unique barcode and SKU values and opening stock', () => {
    const data = createSeedData('supermarket');
    const skus = data.products.map((product) => product.sku);
    const barcodes = data.products.map((product) => product.barcode);
    expect(data.settings.businessName).toContain('سوپرمارکت');
    expect(data.products.every((product) => product.kind === 'product' && product.category)).toBe(true);
    expect(new Set(skus).size).toBe(data.products.length);
    expect(new Set(barcodes).size).toBe(data.products.length);
    expect(data.stockMovements).toHaveLength(data.products.length);
    expect(data.products.some((product) => product.stock < product.minStock)).toBe(true);
  });

  it('provides a design studio project, quote, and a draft invoice with balanced installments', () => {
    const data = createSeedData('creative-studio');
    const quote = data.quotes[0];
    const invoice = data.invoices[0];
    const project = data.projects[0];
    expect(data.products.map((product) => product.name).join(' ')).toMatch(/چاپ/);
    expect(data.products.map((product) => product.name).join(' ')).toMatch(/وب‌سایت/);
    expect(quote.projectId).toBe(project.id);
    expect(quote.items.every((item) => data.products.some((product) => product.id === item.productId))).toBe(true);
    expect(invoice.status).toBe('draft');
    expect(invoice.projectId).toBe(project.id);
    expect(data.settings.numbering.sale.next).toBeGreaterThan(1);
    expect(data.settings.numbering.quote.next).toBeGreaterThan(1);
    expect(invoice.installments?.reduce((sum, installment) => sum + installment.amount, 0)).toBe(invoiceTotal(invoice));
    expect(data.moneyTransactions[0].projectId).toBe(project.id);
    expect(data.journalEntries[0].sourceId).toBe(data.moneyTransactions[0].id);
  });

  it('provides the specified one-bedroom suite construction project and a linked accepted estimate', () => {
    const data = createSeedData('construction-suite');
    const project = data.projects[0];
    const quote = data.quotes[0];
    expect(project.title).toContain('یک‌خوابه');
    expect(project.title).toContain('سرویس بهداشتی');
    expect(project.notes).toContain('یک اتاق‌خواب');
    expect(quote.status).toBe('accepted');
    expect(quote.projectId).toBe(project.id);
    expect(data.settings.numbering.quote.next).toBeGreaterThan(1);
    expect(invoiceTotal(quote)).toBe(project.agreedAmount);
    expect(data.moneyTransactions[0].projectId).toBe(project.id);
  });

  it('returns a fresh supermarket dataset for each setup and keeps the legacy sample export useful', () => {
    const first = createSeedData('supermarket');
    const second = createSeedData('supermarket');
    first.products[0].stock = 0;
    expect(second.products[0].stock).toBeGreaterThan(0);
    expect(seedData.settings.businessName).toContain('سوپرمارکت');
  });
});
