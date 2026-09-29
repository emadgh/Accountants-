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
  OperationResult,
  Payment,
  Product,
  StoreOperationResult,
} from './types';
import {
  expectedPaymentDirection,
  invoiceTotal,
  resolvedPaymentDirection,
  settledForInvoice,
  uid,
} from './utils';

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
  addPayment: (payment: Payment) => OperationResult;
  deletePayment: (id: string) => void;
  upsertCheck: (check: CheckRecord) => OperationResult;
  deleteCheck: (id: string) => OperationResult;
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

function withInvoiceStatuses(invoices: Invoice[], payments: Payment[], checks: CheckRecord[]) {
  return invoices.map((invoice) => {
    if (invoice.status === 'draft' || invoice.status === 'void') return invoice;
    const settled = settledForInvoice(invoice, payments, checks);
    const total = invoiceTotal(invoice);
    const status: Invoice['status'] = settled <= 0 ? 'final' : settled >= total ? 'settled' : 'partial';
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

function normalizeImportedPayments(data: AccountingData) {
  return data.payments.map((payment) => {
    const invoice = payment.invoiceId ? data.invoices.find((item) => item.id === payment.invoiceId) : undefined;
    return {
      ...payment,
      direction: resolvedPaymentDirection(payment, invoice),
    };
  });
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
        const invoices = withInvoiceStatuses(merged, state.payments, state.checks);
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
        const invoices = withInvoiceStatuses(merged, state.payments, state.checks);
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
          return { ok: false, message: 'این فاکتور دریافت/پرداخت متصل دارد. ابتدا تراکنش‌های مرتبط را اصلاح یا حذف کنید.' };
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

      addPayment: (payment) => {
        const state = get();
        if (!payment.customerId) return { ok: false, message: 'طرف حساب را انتخاب کنید.' };
        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          return { ok: false, message: 'مبلغ تراکنش باید بزرگ‌تر از صفر باشد.' };
        }

        const linkedInvoice = payment.invoiceId
          ? state.invoices.find((invoice) => invoice.id === payment.invoiceId)
          : undefined;
        if (payment.invoiceId && !linkedInvoice) return { ok: false, message: 'فاکتور مرتبط پیدا نشد.' };
        if (linkedInvoice && (linkedInvoice.status === 'draft' || linkedInvoice.status === 'void')) {
          return { ok: false, message: 'به پیش‌نویس یا فاکتور باطل نمی‌توان تراکنش متصل کرد.' };
        }

        let normalized: Payment = {
          ...payment,
          direction: linkedInvoice ? expectedPaymentDirection(linkedInvoice) : payment.direction,
          customerId: linkedInvoice ? linkedInvoice.customerId : payment.customerId,
        };

        if (normalized.method === 'check') {
          if (!normalized.checkId) return { ok: false, message: 'برای روش چک، یک چک ثبت‌شده را انتخاب کنید.' };
          const check = state.checks.find((item) => item.id === normalized.checkId);
          if (!check) return { ok: false, message: 'چک انتخاب‌شده پیدا نشد.' };
          const expectedCheckDirection = normalized.direction === 'receipt' ? 'received' : 'issued';
          if (check.direction !== expectedCheckDirection) {
            return { ok: false, message: 'نوع چک با جهت دریافت/پرداخت سازگار نیست.' };
          }
          if (check.customerId !== normalized.customerId) {
            return { ok: false, message: 'طرف حساب چک با طرف حساب تراکنش یکسان نیست.' };
          }
          if (Math.abs(Number(check.amount) - Number(normalized.amount)) > 0.0001) {
            return { ok: false, message: 'مبلغ تراکنش چکی باید با مبلغ چک برابر باشد.' };
          }
          if (state.payments.some((item) => item.checkId === normalized.checkId)) {
            return { ok: false, message: 'این چک قبلاً به یک تراکنش متصل شده است.' };
          }
        } else {
          normalized = { ...normalized, checkId: undefined };
        }

        const payments = [normalized, ...state.payments];
        const invoices = withInvoiceStatuses(state.invoices, payments, state.checks);
        set({ payments, invoices });
        return { ok: true };
      },

      deletePayment: (id) =>
        set((state) => {
          const payments = state.payments.filter((payment) => payment.id !== id);
          return {
            payments,
            invoices: withInvoiceStatuses(state.invoices, payments, state.checks),
          };
        }),

      upsertCheck: (check) => {
        const state = get();
        const previous = state.checks.find((item) => item.id === check.id);
        const linkedPayment = state.payments.find((payment) => payment.checkId === check.id);

        if (linkedPayment && previous) {
          const structuralChange =
            previous.customerId !== check.customerId ||
            previous.direction !== check.direction ||
            Math.abs(Number(previous.amount) - Number(check.amount)) > 0.0001;
          if (structuralChange) {
            return {
              ok: false,
              message: 'چک به یک تراکنش متصل است؛ طرف حساب، نوع و مبلغ آن قابل تغییر نیست. وضعیت، سررسید و اطلاعات بانکی قابل ویرایش‌اند.',
            };
          }
        }

        const checks = previous
          ? state.checks.map((item) => (item.id === check.id ? check : item))
          : [check, ...state.checks];
        const invoices = withInvoiceStatuses(state.invoices, state.payments, checks);
        set({ checks, invoices });
        return { ok: true };
      },

      deleteCheck: (id) => {
        const state = get();
        if (state.payments.some((payment) => payment.checkId === id)) {
          return { ok: false, message: 'این چک به تراکنش متصل است و قابل حذف نیست. ابتدا تراکنش مرتبط را حذف کنید.' };
        }
        const checks = state.checks.filter((check) => check.id !== id);
        set({ checks, invoices: withInvoiceStatuses(state.invoices, state.payments, checks) });
        return { ok: true };
      },

      setSettings: (settings) => set({ settings }),

      replaceAll: (data) => {
        const payments = normalizeImportedPayments(data);
        set({
          ...data,
          payments,
          invoices: withInvoiceStatuses(data.invoices, payments, data.checks),
        });
      },

      resetAll: () => {
        const payments = normalizeImportedPayments(seedData);
        set({
          ...seedData,
          payments,
          invoices: withInvoiceStatuses(seedData.invoices, payments, seedData.checks),
        });
      },
    }),
    {
      name: 'accountants-web-v1',
      partialize: (state) => ({
        customers: state.customers,
        products: state.products,
        invoices: state.invoices,
        payments: state.payments,
        checks: state.checks,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    }
  )
);
