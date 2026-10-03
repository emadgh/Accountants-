import type {
  CheckRecord,
  Customer,
  Invoice,
  InvoiceAuditAction,
  Payment,
  Product,
  ReturnDocument,
  StoreOperationResult
} from '../types';
import {
  invoiceTotal,
  settledForInvoice,
  uid
} from '../utils';
import { productKindForInvoice } from './product-kind';

export function withInvoiceStatuses(
  invoices: Invoice[],
  payments: Payment[],
  checks: CheckRecord[],
  returns: ReturnDocument[] = []
) {
  return invoices.map((invoice) => {
    if (invoice.status === 'draft' || invoice.status === 'void') return invoice;
    const settled = settledForInvoice(invoice, payments, checks);
    const returnedAmount = returns
      .filter((document) => document.originalInvoiceId === invoice.id && document.status === 'final')
      .reduce((sum, document) => sum + Number(document.totalAmount || 0), 0);
    const total = Math.max(0, invoiceTotal(invoice) - returnedAmount);
    const status: Invoice['status'] = total <= 0.0001 || settled >= total - 0.0001
      ? 'settled'
      : settled <= 0
        ? 'final'
        : 'partial';
    return { ...invoice, status };
  });
}

export function appendAudit(invoice: Invoice, action: InvoiceAuditAction, revision: number, note?: string) {
  return [
    ...(invoice.auditTrail || []),
    {
      id: uid('audit'),
      action,
      at: new Date().toISOString(),
      revision,
      ...(note?.trim() ? { note: note.trim() } : {}),
    },
  ];
}

export function validatePosting(customers: Customer[], products: Product[], invoice: Invoice, allInvoices: Invoice[]): StoreOperationResult {
  if (!invoice.number.trim()) return { ok: false, message: 'شماره فاکتور نمی‌تواند خالی باشد.' };
  if (!invoice.customerName.trim()) return { ok: false, message: 'طرف حساب را مشخص کنید.' };
  if (!invoice.customerId || !customers.some((customer) => customer.id === invoice.customerId)) {
    return { ok: false, message: 'طرف حساب معتبر را انتخاب یا در همین فاکتور ایجاد کنید.' };
  }
  if (!invoice.items.length) return { ok: false, message: 'فاکتور باید حداقل یک ردیف داشته باشد.' };

  const duplicateNumber = allInvoices.some(
    (item) =>
      item.id !== invoice.id &&
      item.kind === invoice.kind &&
      item.number.trim() === invoice.number.trim()
  );
  if (duplicateNumber) return { ok: false, message: 'شماره فاکتور برای این نوع سند تکراری است.' };

  for (const item of invoice.items) {
    if (!item.description.trim()) return { ok: false, message: 'شرح همه ردیف‌های فاکتور باید تکمیل شود.' };
    if (!Number.isFinite(item.qty) || item.qty <= 0) return { ok: false, message: 'مقدار هر ردیف باید بزرگ‌تر از صفر باشد.' };
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return { ok: false, message: 'قیمت واحد نمی‌تواند منفی باشد.' };
  }

  if (invoice.kind === 'sale') {
    const requested = new Map<string, number>();
    for (const item of invoice.items) {
      if (!item.productId) continue;
      requested.set(item.productId, (requested.get(item.productId) || 0) + Number(item.qty || 0));
    }

    for (const [productId, qty] of requested) {
      const product = products.find((p) => p.id === productId);
      if (!product || productKindForInvoice(product, invoice) !== 'product') continue;
      if (product.stock - qty < -1e-9) {
        return {
          ok: false,
          message: `موجودی «${product.name}» کافی نیست. موجودی فعلی: ${product.stock} ${product.unit}، مقدار درخواستی: ${qty} ${product.unit}.`,
        };
      }
    }
  }

  return { ok: true };
}

export function normalizeForDraft(invoice: Invoice, previous?: Invoice): Invoice {
  const now = new Date().toISOString();
  const revision = previous?.revision ?? invoice.revision ?? 0;
  const base: Invoice = {
    ...invoice,
    status: 'draft',
    revision,
    finalizedAt: undefined,
    voidedAt: undefined,
    voidReason: undefined,
    createdAt: previous?.createdAt || invoice.createdAt || now,
    updatedAt: now,
    auditTrail: previous?.auditTrail || invoice.auditTrail || [],
  };

  const action: InvoiceAuditAction = previous ? 'draft_saved' : 'created';
  return { ...base, auditTrail: appendAudit(base, action, revision) };
}

