'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { seedData } from './data';
import type {
  AccountingData,
  BusinessSettings,
  CheckRecord,
  Customer,
  Invoice,
  InvoiceAuditAction,
  Payment,
  Product,
  StoreOperationResult,
} from './types';
import { invoiceTotal, uid } from './utils';

type Store = AccountingData & {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  upsertCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  saveInvoiceDraft: (invoice: Invoice) => StoreOperationResult;
  finalizeInvoice: (invoice: Invoice) => StoreOperationResult;
  reviseInvoice: (invoice: Invoice, reason: string) => StoreOperationResult;
  voidInvoice: (id: string, reason: string) => StoreOperationResult;
  deleteInvoice: (id: string) => StoreOperationResult;
  addPayment: (payment: Payment) => void;
  deletePayment: (id: string) => void;
  upsertCheck: (check: CheckRecord) => void;
  deleteCheck: (id: string) => void;
  setSettings: (settings: BusinessSettings) => void;
  replaceAll: (data: AccountingData) => void;
  resetAll: () => void;
};

function isPosted(status: Invoice['status']) {
  return status === 'final' || status === 'partial' || status === 'settled';
}

function applyInventory(products: Product[], invoice: Invoice, direction: 1 | -1) {
  if (!isPosted(invoice.status)) return products;
  const map = new Map(products.map((p) => [p.id, { ...p }]));
  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = map.get(item.productId);
    if (!product || product.kind !== 'product') continue;
    const movement = invoice.kind === 'sale' ? -Number(item.qty || 0) : Number(item.qty || 0);
    product.stock += movement * direction;
  }
  return Array.from(map.values());
}

function withInvoiceStatuses(invoices: Invoice[], payments: Payment[]) {
  return invoices.map((invoice) => {
    if (invoice.status === 'draft' || invoice.status === 'void') return invoice;
    const paid = payments.filter((p) => p.invoiceId === invoice.id).reduce((s, p) => s + p.amount, 0);
    const total = invoiceTotal(invoice);
    const status: Invoice['status'] = paid <= 0 ? 'final' : paid >= total ? 'settled' : 'partial';
    return { ...invoice, status };
  });
}

function appendAudit(invoice: Invoice, action: InvoiceAuditAction, revision: number, note?: string) {
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

function validatePosting(products: Product[], invoice: Invoice, allInvoices: Invoice[]): StoreOperationResult {
  if (!invoice.number.trim()) return { ok: false, message: 'شماره فاکتور نمی‌تواند خالی باشد.' };
  if (!invoice.customerName.trim()) return { ok: false, message: 'طرف حساب را مشخص کنید.' };
  if (!invoice.items.length) return { ok: false, message: 'فاکتور باید حداقل یک ردیف داشته باشد.' };

  const duplicateNumber = allInvoices.some(
    (item) =>
      item.id !== invoice.id &&
      item.kind === invoice.kind &&
      item.number.trim() === invoice.number.trim() &&
      item.status !== 'void'
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
      if (!product || product.kind !== 'product') continue;
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

function normalizeForDraft(invoice: Invoice, previous?: Invoice): Invoice {
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

export const useAccountingStore = create<Store>()(
  persist(
    (set, get) => ({
      ...seedData,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      upsertCustomer: (customer) =>
        set((s) => ({
          customers: s.customers.some((c) => c.id === customer.id)
            ? s.customers.map((c) => (c.id === customer.id ? customer : c))
            : [customer, ...s.customers],
        })),

      deleteCustomer: (id) => set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),

      upsertProduct: (product) =>
        set((s) => ({
          products: s.products.some((p) => p.id === product.id)
            ? s.products.map((p) => (p.id === product.id ? product : p))
            : [product, ...s.products],
        })),

      deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      saveInvoiceDraft: (invoice) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === invoice.id);
        if (previous && previous.status !== 'draft') {
          return { ok: false, message: 'سند قطعی را نمی‌توان به پیش‌نویس برگرداند. برای تغییر از ثبت Revision استفاده کنید.' };
        }

        const next = normalizeForDraft(invoice, previous);
        const invoices = previous
          ? state.invoices.map((item) => (item.id === next.id ? next : item))
          : [next, ...state.invoices];
        set({ invoices });
        return { ok: true, invoice: next };
      },

      finalizeInvoice: (invoice) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === invoice.id);
        if (previous && previous.status !== 'draft') {
          return { ok: false, message: 'این فاکتور قبلاً قطعی شده است.' };
        }

        const now = new Date().toISOString();
        const revision = Math.max(1, previous?.revision || invoice.revision || 0);
        const base: Invoice = {
          ...invoice,
          status: 'final',
          revision,
          finalizedAt: previous?.finalizedAt || now,
          voidedAt: undefined,
          voidReason: undefined,
          createdAt: previous?.createdAt || invoice.createdAt || now,
          updatedAt: now,
          auditTrail: previous?.auditTrail || invoice.auditTrail || [],
        };
        const next: Invoice = { ...base, auditTrail: appendAudit(base, 'finalized', revision) };
        const valid = validatePosting(state.products, next, state.invoices);
        if (!valid.ok) return valid;

        const products = applyInventory(state.products, next, 1);
        const merged = previous
          ? state.invoices.map((item) => (item.id === next.id ? next : item))
          : [next, ...state.invoices];
        const invoices = withInvoiceStatuses(merged, state.payments);
        const saved = invoices.find((item) => item.id === next.id) || next;
        set({ products, invoices });
        return { ok: true, invoice: saved };
      },

      reviseInvoice: (invoice, reason) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === invoice.id);
        if (!previous || !isPosted(previous.status)) {
          return { ok: false, message: 'فقط فاکتور قطعی قابل Revision است.' };
        }
        if (!reason.trim()) return { ok: false, message: 'دلیل ویرایش سند قطعی را وارد کنید.' };
        if (invoice.number.trim() !== previous.number.trim()) {
          return { ok: false, message: 'شماره فاکتور قطعی قابل تغییر نیست.' };
        }

        const baseProducts = applyInventory(state.products, previous, -1);
        const now = new Date().toISOString();
        const revision = Math.max(1, previous.revision || 1) + 1;
        const base: Invoice = {
          ...invoice,
          number: previous.number,
          status: previous.status,
          revision,
          finalizedAt: previous.finalizedAt || previous.updatedAt || now,
          voidedAt: undefined,
          voidReason: undefined,
          createdAt: previous.createdAt,
          updatedAt: now,
          auditTrail: previous.auditTrail || [],
        };
        const next: Invoice = { ...base, auditTrail: appendAudit(base, 'revised', revision, reason) };
        const valid = validatePosting(baseProducts, next, state.invoices);
        if (!valid.ok) return valid;

        const products = applyInventory(baseProducts, next, 1);
        const merged = state.invoices.map((item) => (item.id === next.id ? next : item));
        const invoices = withInvoiceStatuses(merged, state.payments);
        const saved = invoices.find((item) => item.id === next.id) || next;
        set({ products, invoices });
        return { ok: true, invoice: saved };
      },

      voidInvoice: (id, reason) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === id);
        if (!previous || !isPosted(previous.status)) {
          return { ok: false, message: 'فقط فاکتور قطعی قابل ابطال است.' };
        }
        if (!reason.trim()) return { ok: false, message: 'دلیل ابطال را وارد کنید.' };
        if (state.payments.some((payment) => payment.invoiceId === id)) {
          return { ok: false, message: 'این فاکتور پرداخت/دریافت متصل دارد. ابتدا تراکنش‌های مرتبط را اصلاح یا حذف کنید.' };
        }

        const now = new Date().toISOString();
        const revision = Math.max(1, previous.revision || 1);
        const base: Invoice = {
          ...previous,
          status: 'void',
          voidedAt: now,
          voidReason: reason.trim(),
          updatedAt: now,
        };
        const next: Invoice = { ...base, auditTrail: appendAudit(base, 'voided', revision, reason) };
        const products = applyInventory(state.products, previous, -1);
        const invoices = state.invoices.map((item) => (item.id === id ? next : item));
        set({ products, invoices });
        return { ok: true, invoice: next };
      },

      deleteInvoice: (id) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === id);
        if (!previous) return { ok: false, message: 'فاکتور پیدا نشد.' };
        if (previous.status !== 'draft') {
          return { ok: false, message: 'فاکتور قطعی یا ابطال‌شده حذف نمی‌شود. برای اسناد قطعی از ابطال استفاده کنید.' };
        }
        set({ invoices: state.invoices.filter((item) => item.id !== id) });
        return { ok: true };
      },

      addPayment: (payment) =>
        set((s) => {
          const payments = [payment, ...s.payments];
          return { payments, invoices: withInvoiceStatuses(s.invoices, payments) };
        }),

      deletePayment: (id) =>
        set((s) => {
          const payments = s.payments.filter((p) => p.id !== id);
          return { payments, invoices: withInvoiceStatuses(s.invoices, payments) };
        }),

      upsertCheck: (check) =>
        set((s) => ({
          checks: s.checks.some((c) => c.id === check.id)
            ? s.checks.map((c) => (c.id === check.id ? check : c))
            : [check, ...s.checks],
        })),

      deleteCheck: (id) => set((s) => ({ checks: s.checks.filter((c) => c.id !== id) })),

      setSettings: (settings) => set({ settings }),
      replaceAll: (data) => set({ ...data }),
      resetAll: () => set({ ...seedData }),
    }),
    {
      name: 'accountants-web-v1',
      partialize: (s) => ({
        customers: s.customers,
        products: s.products,
        invoices: s.invoices,
        payments: s.payments,
        checks: s.checks,
        settings: s.settings,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    }
  )
);
