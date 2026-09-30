import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAccountingData } from '../lib/data';
import { todayIso } from '../lib/standards';
import { getReceivableDueBuckets } from '../lib/receivables';
import type { Customer, Invoice, Payment, Product, ReturnDocument } from '../lib/types';
import type { Quote } from '../lib/types';

vi.mock('../lib/storage', () => ({
  ACCOUNTING_SCHEMA_VERSION: 9,
  accountingStateStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

const { useAccountingStore } = await import('../lib/store');

const customer: Customer = {
  id: 'customer_1', code: '1001', name: 'مشتری آزمایشی', kind: 'customer', status: 'active',
  phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
};

function invoice(items: Invoice['items'], number: string): Invoice {
  const now = new Date().toISOString();
  return {
    id: `invoice_${number}`, number, businessProfileId: 'business_default', templateId: 'classic', paperSize: 'A4',
    kind: 'sale', status: 'draft', date: todayIso(), customerId: customer.id, customerName: customer.name,
    customerPhone: '', customerAddress: '', items, discount: 0, tax: 0, shipping: 0, notes: '',
    createdAt: now, updatedAt: now,
  };
}

function setup(products: Product[] = []) {
  const data = createEmptyAccountingData();
  data.customers = [customer];
  data.products = products;
  useAccountingStore.getState().replaceAll(data);
}

describe('accounting store flows', () => {
  beforeEach(() => setup());

  it('posts a service invoice, treats pending checks as unsettled, and settles after clearing', () => {
    const service: Product = {
      id: 'service_1', code: 'S1', name: 'طراحی', kind: 'service', unit: 'پروژه',
      salePrice: 100_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0,
    };
    setup([service]);
    const draft = invoice([{ id: 'line_1', productId: service.id, description: service.name, unit: service.unit, qty: 1, unitPrice: 100_000 }], 'S-1');
    expect(useAccountingStore.getState().saveInvoiceDraft(draft).ok).toBe(true);
    expect(useAccountingStore.getState().finalizeInvoice(draft).ok).toBe(true);

    const check = {
      id: 'check_1', documentNumber: 'C-1', direction: 'received' as const, customerId: customer.id,
      amount: 60_000, dueDate: todayIso(), number: '123', bank: 'آزمایشی', owner: customer.name,
      status: 'pending' as const,
    };
    expect(useAccountingStore.getState().upsertCheck(check).ok).toBe(true);
    const payment: Payment = {
      id: 'payment_1', documentNumber: 'R-1', invoiceId: draft.id, customerId: customer.id,
      direction: 'receipt', method: 'check', checkId: check.id, amount: check.amount,
      date: todayIso(), reference: check.number,
    };
    expect(useAccountingStore.getState().addPayment(payment).ok).toBe(true);
    expect(useAccountingStore.getState().invoices.find((item) => item.id === draft.id)?.status).toBe('final');

    expect(useAccountingStore.getState().upsertCheck({ ...check, status: 'cleared' }).ok).toBe(true);
    expect(useAccountingStore.getState().invoices.find((item) => item.id === draft.id)?.status).toBe('partial');
    expect(useAccountingStore.getState().journalEntries.some((entry) => entry.sourceType === 'payment' && entry.sourceId === payment.id)).toBe(true);

    const cashPayment: Payment = {
      id: 'payment_2', documentNumber: 'R-2', invoiceId: draft.id, customerId: customer.id,
      direction: 'receipt', method: 'cash', amount: 40_000, date: todayIso(),
    };
    expect(useAccountingStore.getState().addPayment(cashPayment).ok).toBe(true);
    expect(useAccountingStore.getState().invoices.find((item) => item.id === draft.id)?.status).toBe('settled');
  });

  it('prevents overselling and returns stock through a linked return document', () => {
    const product: Product = {
      id: 'product_1', code: 'P1', name: 'کالا', kind: 'product', unit: 'عدد',
      salePrice: 50_000, buyPrice: 30_000, averageCost: 30_000, stock: 5, minStock: 1,
    };
    setup([product]);
    const draft = invoice([{ id: 'line_1', productId: product.id, description: product.name, unit: product.unit, qty: 2, unitPrice: 50_000 }], 'S-2');
    expect(useAccountingStore.getState().finalizeInvoice(draft).ok).toBe(true);
    expect(useAccountingStore.getState().products.find((item) => item.id === product.id)?.stock).toBe(3);

    const oversell = invoice([{ id: 'line_2', productId: product.id, description: product.name, unit: product.unit, qty: 4, unitPrice: 50_000 }], 'S-3');
    expect(useAccountingStore.getState().finalizeInvoice(oversell).ok).toBe(false);
    expect(useAccountingStore.getState().products.find((item) => item.id === product.id)?.stock).toBe(3);

    const now = new Date().toISOString();
    const returnDraft: ReturnDocument = {
      id: 'return_1', number: 'SR-1', kind: 'sale-return', status: 'draft', originalInvoiceId: draft.id,
      originalInvoiceNumber: draft.number, customerId: customer.id, customerName: customer.name,
      date: todayIso(), items: [{ id: 'return_line_1', originalItemId: 'line_1', productId: product.id, description: product.name, unit: product.unit, qty: 1, unitPrice: 50_000 }],
      totalAmount: 0, notes: '', createdAt: now, updatedAt: now,
    };
    expect(useAccountingStore.getState().saveReturnDraft(returnDraft).ok).toBe(true);
    expect(useAccountingStore.getState().finalizeReturn(returnDraft).ok).toBe(true);
    expect(useAccountingStore.getState().products.find((item) => item.id === product.id)?.stock).toBe(4);
    expect(useAccountingStore.getState().returns.find((item) => item.id === returnDraft.id)?.totalAmount).toBe(50_000);
  });

  it('posts a multi-product retail invoice, applies partial receipt, and leaves stock untouched when a later line is short', () => {
    const products: Product[] = [
      { id: 'retail_1', code: 'R1', name: 'کالای یک', kind: 'product', unit: 'عدد', salePrice: 80_000, buyPrice: 50_000, averageCost: 50_000, stock: 5, minStock: 1, barcode: '111' },
      { id: 'retail_2', code: 'R2', name: 'کالای دو', kind: 'product', unit: 'عدد', salePrice: 40_000, buyPrice: 20_000, averageCost: 20_000, stock: 2, minStock: 1, barcode: '222' },
    ];
    setup(products);
    const sale = invoice([
      { id: 'retail_line_1', productId: 'retail_1', description: products[0].name, unit: 'عدد', qty: 2, unitPrice: 80_000 },
      { id: 'retail_line_2', productId: 'retail_2', description: products[1].name, unit: 'عدد', qty: 1, unitPrice: 40_000 },
    ], 'R-1');
    expect(useAccountingStore.getState().finalizeInvoice(sale).ok).toBe(true);
    expect(useAccountingStore.getState().products.map((product) => product.stock)).toEqual([3, 1]);

    const receipt: Payment = {
      id: 'retail_receipt_1', documentNumber: 'R-1', invoiceId: sale.id, customerId: customer.id,
      direction: 'receipt', method: 'cash', amount: 100_000, date: todayIso(),
    };
    expect(useAccountingStore.getState().addPayment(receipt).ok).toBe(true);
    expect(useAccountingStore.getState().invoices.find((item) => item.id === sale.id)?.status).toBe('partial');

    const shortage = invoice([
      { id: 'retail_line_3', productId: 'retail_1', description: products[0].name, unit: 'عدد', qty: 1, unitPrice: 80_000 },
      { id: 'retail_line_4', productId: 'retail_2', description: products[1].name, unit: 'عدد', qty: 2, unitPrice: 40_000 },
    ], 'R-2');
    expect(useAccountingStore.getState().finalizeInvoice(shortage).ok).toBe(false);
    expect(useAccountingStore.getState().products.map((product) => product.stock)).toEqual([3, 1]);
  });

  it('converts an accepted quote to one unposted sales draft and keeps quote history', () => {
    const now = new Date().toISOString();
    const quote: Quote = {
      id: 'quote_1', number: 'Q-000001', status: 'accepted', customerId: customer.id, customerName: customer.name,
      customerPhone: '', customerAddress: '', businessProfileId: 'business_default', date: todayIso(),
      items: [{ id: 'quote_line_1', description: 'طراحی بسته‌بندی', unit: 'پروژه', qty: 1, unitPrice: 250_000 }],
      discount: 0, tax: 0, shipping: 0, notes: '', createdAt: now, updatedAt: now,
    };
    expect(useAccountingStore.getState().upsertQuote(quote).ok).toBe(true);
    const beforeJournalCount = useAccountingStore.getState().journalEntries.length;
    const first = useAccountingStore.getState().convertQuoteToInvoice(quote.id);
    const second = useAccountingStore.getState().convertQuoteToInvoice(quote.id);
    expect(first.ok).toBe(true);
    expect(second.invoice?.id).toBe(first.invoice?.id);
    expect(useAccountingStore.getState().invoices.filter((invoice) => invoice.quoteId === quote.id)).toHaveLength(1);
    expect(useAccountingStore.getState().invoices[0].status).toBe('draft');
    expect(useAccountingStore.getState().quotes[0].status).toBe('converted');
    expect(useAccountingStore.getState().journalEntries).toHaveLength(beforeJournalCount);
  });

  it('rejects duplicate product barcodes and validates an invoice installment schedule', () => {
    const state = useAccountingStore.getState();
    const product: Product = { id: 'barcode_product_1', code: 'B1', sku: 'SKU-1', barcode: '1234567890', name: 'نمونه', kind: 'product', unit: 'عدد', salePrice: 100, buyPrice: 40, averageCost: 40, stock: 5, minStock: 1 };
    expect(state.upsertProduct(product).ok).toBe(true);
    expect(useAccountingStore.getState().upsertProduct({ ...product, id: 'barcode_product_2', code: 'B2', sku: 'SKU-2' })).toMatchObject({ ok: false, message: 'بارکد تکراری است.' });

    const draft = invoice([{ id: 'installment_line', description: 'خدمت', unit: 'پروژه', qty: 1, unitPrice: 100_000 }], 'S-4');
    draft.dueDate = todayIso();
    draft.installments = [
      { id: 'installment_1', dueDate: todayIso(), amount: 40_000 },
      { id: 'installment_2', dueDate: todayIso(), amount: 60_000 },
    ];
    expect(useAccountingStore.getState().saveInvoiceDraft(draft).ok).toBe(true);
    expect(useAccountingStore.getState().finalizeInvoice(draft).ok).toBe(true);
    expect(useAccountingStore.getState().invoices.find((item) => item.id === draft.id)).toMatchObject({ dueDate: todayIso(), installments: draft.installments });
  });

  it('rejects an invoice whose customer id is not in the customer list', () => {
    const invalid = invoice([{ id: 'orphan_line', description: 'خدمت', unit: 'پروژه', qty: 1, unitPrice: 100 }], 'S-6');
    invalid.customerId = 'missing_customer';
    expect(useAccountingStore.getState().saveInvoiceDraft(invalid)).toMatchObject({ ok: false });
  });

  it('groups only outstanding sales due before today or within the next seven days', () => {
    const withDueDate = (number: string, dueDate: string, status: Invoice['status'] = 'final') => {
      const document = invoice([{ id: `${number}_line`, description: 'خدمت', unit: 'پروژه', qty: 1, unitPrice: 100 }], number);
      document.status = status;
      document.dueDate = dueDate;
      return document;
    };
    const overdue = withDueDate('DUE-1', '2026-01-04');
    const upcoming = withDueDate('DUE-2', '2026-01-10');
    const later = withDueDate('DUE-3', '2026-01-20');
    const settled = withDueDate('DUE-4', '2026-01-03', 'settled');
    const payment: Payment = { id: 'due_payment', documentNumber: 'RP-1', invoiceId: settled.id, customerId: customer.id, direction: 'receipt', method: 'cash', amount: 100, date: '2026-01-02' };

    const buckets = getReceivableDueBuckets([overdue, upcoming, later, settled], [payment], [], [], '2026-01-05', '2026-01-12');
    expect(buckets.overdue.map((item) => item.id)).toEqual([overdue.id]);
    expect(buckets.upcoming.map((item) => item.id)).toEqual([upcoming.id]);
  });
});
