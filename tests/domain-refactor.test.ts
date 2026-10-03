import { describe, expect, it } from 'vitest';
import { createEmptyAccountingData, createSeedData } from '../lib/data';
import { normalizeAccountingData } from '../lib/domain/shared';
import { executeDomainOperation } from '../lib/domain/engine';
import { paymentCapacity, eligiblePaymentChecks } from '../lib/domain/payment-capacity';
import { projectFinancialSummary } from '../lib/domain/project-summary';
import { projectPurchaseInvoiceAllocation } from '../lib/accounting';
import { productKindForInvoice } from '../lib/domain/product-kind';
import { documentList } from '../lib/domain/document-list';
import { validateAccountingData } from '../lib/accounting-validation';
import { documentsAliasHref } from '../lib/document-routes';
import { buildViewHref, getViewForPathname } from '../components/app-routes';
import type { Invoice, Payment } from '../lib/types';

function fixture() {
  const data = createEmptyAccountingData();
  data.customers.push({ id: 'customer', code: 'C1', name: 'مشتری', kind: 'customer', status: 'active', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0 });
  data.products.push({ id: 'product', code: 'P1', name: 'کالا', kind: 'product', unit: 'عدد', stock: 10, minStock: 0, salePrice: 100, buyPrice: 20, averageCost: 20 });
  const invoice: Invoice = { id: 'invoice', number: '300001', kind: 'sale', status: 'draft', businessProfileId: 'business_default', templateId: 'classic', paperSize: 'A4', date: '2026-01-01', dueDate: '2026-12-01', customerId: 'customer', customerName: 'مشتری', customerPhone: '', customerAddress: '', items: [{ id: 'line', productId: 'product', description: 'کالا', unit: 'عدد', qty: 2, unitPrice: 100, discount: 0 }], discount: 0, tax: 0, shipping: 0, notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  return { data: normalizeAccountingData(data), invoice };
}
const filters = { q: '', status: 'all', from: '', to: '', customerId: '', projectId: '', balance: 'all' };

describe('shared accounting domain', () => {
  it('reclassifies legacy products without revalidating or modifying settled invoices', () => {
    const { data, invoice } = fixture();
    data.products[0].stock = -93;
    data.invoices.push({ ...invoice, status: 'settled', items: [{ ...invoice.items[0], qty: 0 }] });
    const before = structuredClone(data);
    const changed = executeDomainOperation(data, 'upsertProduct', [{ ...data.products[0], kind: 'service', invoiceKinds: { invoice: 'service' } }]);
    expect(changed.result).toMatchObject({ ok: true });
    expect(validateAccountingData(changed.data, data)).toMatchObject({ ok: true });
    expect(validateAccountingData(changed.data).ok).toBe(false);
    expect(changed.data.products[0]).toMatchObject({ kind: 'service', stock: -93, invoiceKinds: { invoice: 'product' } });
    for (const key of ['invoices', 'payments', 'stockMovements', 'journalEntries'] as const) expect(changed.data[key]).toEqual(before[key]);
    // Future service sales are independent of the imported historical stock balance.
    const fresh = { ...invoice, id: 'new-invoice', number: '300002' };
    const posted = executeDomainOperation(changed.data, 'finalizeInvoice', [fresh]);
    expect(posted.result).toMatchObject({ ok: true });
    expect(validateAccountingData(posted.data, changed.data)).toMatchObject({ ok: true });
    expect(posted.data.stockMovements).toEqual(before.stockMovements);
    expect(posted.data.products[0].stock).toBe(-93);
  });

  it('preserves historical purchases, returns and service invoices across repeated reclassification', () => {
    const { data, invoice } = fixture();
    const purchase = { ...invoice, kind: 'purchase' as const };
    const posted = executeDomainOperation(data, 'finalizeInvoice', [purchase]).data;
    const before = projectPurchaseInvoiceAllocation(posted.invoices[0], posted.products);
    const changed = executeDomainOperation(posted, 'upsertProduct', [{ ...posted.products[0], kind: 'service' }]).data;
    expect(projectPurchaseInvoiceAllocation(changed.invoices[0], changed.products)).toEqual(before);
    expect(validateAccountingData(changed)).toMatchObject({ ok: true });
    const returned = executeDomainOperation(changed, 'finalizeReturn', [{ id: 'return', number: 'RET1', kind: 'purchase-return', status: 'draft', date: '2026-01-02', originalInvoiceId: invoice.id, originalInvoiceNumber: invoice.number, customerId: invoice.customerId, customerName: invoice.customerName, items: [{ id: 'return-line', originalItemId: 'line', productId: 'product', description: 'کالا', unit: 'عدد', qty: 1, unitPrice: 100 }], totalAmount: 100, notes: '', createdAt: '2026-01-02', updatedAt: '2026-01-02' }]);
    expect(returned.result).toMatchObject({ ok: true });
    expect(returned.data.products[0].stock).toBe(11);
    expect(validateAccountingData(returned.data, changed)).toMatchObject({ ok: true });
    const newService = { ...invoice, id: 'service-invoice', number: '300002' };
    const servicePosted = executeDomainOperation(returned.data, 'finalizeInvoice', [newService]).data;
    const back = executeDomainOperation(servicePosted, 'upsertProduct', [{ ...servicePosted.products[0], kind: 'product' }]).data;
    expect(productKindForInvoice(back.products[0], back.invoices.find((item) => item.id === 'invoice')!)).toBe('product');
    expect(productKindForInvoice(back.products[0], back.invoices.find((item) => item.id === 'service-invoice')!)).toBe('service');
    expect(validateAccountingData(back)).toMatchObject({ ok: true });
    const voided = executeDomainOperation(back, 'voidInvoice', ['service-invoice', 'ابطال']);
    expect(voided.result).toMatchObject({ ok: true });
    expect(voided.data.products[0].stock).toBe(back.products[0].stock);
    expect(voided.data.stockMovements).toEqual(back.stockMovements);
  });

  it('reverses an old stock sale after reclassification and preserves the kind in backup', async () => {
    const { data, invoice } = fixture();
    const posted = executeDomainOperation(data, 'finalizeInvoice', [invoice]).data;
    const changed = executeDomainOperation(posted, 'upsertProduct', [{ ...posted.products[0], kind: 'service' }]).data;
    expect(productKindForInvoice(changed.products[0], { id: invoice.id, status: 'draft' })).toBe('service');
    const { parseAccountingBackup } = await import('../lib/backup');
    const restored = (await parseAccountingBackup(JSON.stringify(changed))).data;
    expect(restored.products[0].invoiceKinds).toEqual({ invoice: 'product' });
    expect(restored.stockMovements).toEqual(changed.stockMovements);
    const voided = executeDomainOperation(restored, 'voidInvoice', [invoice.id, 'ابطال ثبت قدیمی']);
    expect(voided.result).toMatchObject({ ok: true });
    expect(voided.data.products[0].stock).toBe(10);
    expect(validateAccountingData(voided.data, restored)).toMatchObject({ ok: true });
  });
  it('posts without React and leaves the original data unchanged', () => {
    const { data, invoice } = fixture();
    const before = structuredClone(data);
    const posted = executeDomainOperation(data, 'finalizeInvoice', [invoice], 'deterministic_seed_01');
    expect(posted.result).toMatchObject({ ok: true });
    expect(data).toEqual(before);
    expect(posted.data.products[0].stock).toBe(8);
    expect(validateAccountingData(posted.data, data)).toMatchObject({ ok: true });
    expect(Object.values(posted.data).some((value) => typeof value === 'function')).toBe(false);
  });

  it('reserves pending checks consistently and frees capacity on bounce', () => {
    const { data, invoice } = fixture();
    const posted = executeDomainOperation(data, 'finalizeInvoice', [invoice]).data;
    posted.checks.push({ id: 'check', documentNumber: 'CH1', direction: 'received', customerId: 'customer', amount: 150, dueDate: '2026-10-01', number: '001', bank: '', owner: '', status: 'pending', notes: '' });
    const payment: Payment = { id: 'payment', documentNumber: 'R1', invoiceId: invoice.id, customerId: invoice.customerId, direction: 'receipt', method: 'check', checkId: 'check', amount: 150, date: '2026-01-01' };
    const reserved = executeDomainOperation(posted, 'addPayment', [payment]).data;
    expect(paymentCapacity(reserved.invoices[0], reserved)).toEqual({ outstanding: 200, reserved: 150, available: 50 });
    expect(eligiblePaymentChecks(payment, reserved, 50)).toEqual([]);
    expect(executeDomainOperation(reserved, 'addPayment', [{ ...payment, id: 'cash', documentNumber: 'R2', method: 'cash', checkId: undefined, amount: 51 }]).result).toMatchObject({ ok: false });
    const bounced = executeDomainOperation(reserved, 'upsertCheck', [{ ...reserved.checks[0], status: 'bounced' }]).data;
    expect(paymentCapacity(bounced.invoices[0], bounced).available).toBe(200);
  });

  it('finds an overdue installment even if the invoice due date is in the future', () => {
    const { data, invoice } = fixture();
    invoice.installments = [{ id: 'early', dueDate: '2026-01-01', amount: 100 }, { id: 'late', dueDate: '2026-12-01', amount: 100 }];
    const posted = executeDomainOperation(data, 'finalizeInvoice', [invoice]).data;
    expect(documentList(posted, 'sale', { ...filters, balance: 'overdue' }, '2026-02-01')).toHaveLength(1);
    expect(documentList(posted, 'sale', { ...filters, customerId: 'another-customer' }, '2026-02-01')).toHaveLength(0);
  });

  it('does not reject an unrelated project edit because of an invalid legacy invoice', () => {
    const { data, invoice } = fixture();
    data.invoices.push({ ...invoice, status: 'draft', items: [{ ...invoice.items[0], qty: 0 }] });
    const next = structuredClone(data);
    next.projects.push({ id: 'project', customerId: 'customer', title: 'پروژه', status: 'in-progress', agreedAmount: 100, notes: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' });
    expect(validateAccountingData(next, data)).toMatchObject({ ok: true });
    expect(validateAccountingData(next).ok).toBe(false);
    next.invoices[0].notes = 'edited invalid document';
    expect(validateAccountingData(next, data).ok).toBe(false);
  });

  it('keeps project totals consistent for every existing starter preset', () => {
    for (const name of ['supermarket', 'creative-studio', 'construction-suite'] as const) {
      const data = createSeedData(name);
      for (const project of data.projects) {
        const summary = projectFinancialSummary(data, project.id);
        expect(summary.estimatedProfit).toBe(summary.income - summary.cost - summary.costOfGoodsSold);
        expect(Number.isFinite(summary.received)).toBe(true);
      }
    }
  });

  it('preserves filters through old routes and links to the correct menu item', () => {
    const href = documentsAliasHref('purchase', { q: 'کاغذ', status: 'draft', kind: 'sale', customerId: 'customer', projectId: 'project' });
    const params = new URL(href, 'http://localhost').searchParams;
    expect(params.get('kind')).toBe('purchase'); expect(params.get('q')).toBe('کاغذ'); expect(params.get('projectId')).toBe('project');
    expect(buildViewHref('sales', { projectId: 'project' })).toBe('/documents?kind=sale&projectId=project');
    expect(getViewForPathname('/documents', 'kind=purchase')).toBe('purchases');
  });
  it('uses the same net amounts and stock valuation in report calculations', async () => {
    const { invoiceAmountForProduct, returnAmountForProduct, asOfInventory } = await import('../lib/domain/report-calculations');
    const { data, invoice } = fixture();
    expect(invoiceAmountForProduct(invoice, 'product')).toBe(200);
    const posted = executeDomainOperation(data, 'finalizeInvoice', [invoice]).data;
    const returned = executeDomainOperation(posted, 'finalizeReturn', [{ id: 'return', number: 'RET1', kind: 'sale-return', status: 'draft', date: '2026-01-02', originalInvoiceId: invoice.id, originalInvoiceNumber: invoice.number, customerId: invoice.customerId, customerName: invoice.customerName, items: [{id:'return-line',originalItemId:'line',productId:'product',description:'کالا',unit:'عدد',qty:1,unitPrice:100}], totalAmount:100, notes:'', createdAt:'2026-01-02',updatedAt:'2026-01-02' }]);
    expect(returned.result).toMatchObject({ok:true});
    expect(returnAmountForProduct(returned.data.returns[0], 'product')).toBe(100);
    expect(returned.data.products[0].stock).toBe(9);
    expect(asOfInventory(returned.data.products[0], returned.data.stockMovements, '2026-01-03').stock).toBe(9);
  });

});
