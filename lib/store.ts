'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { seedData } from './data';
import type { AccountingData, BusinessSettings, CheckRecord, Customer, Invoice, Payment, Product } from './types';
import { invoiceTotal } from './utils';

type Store = AccountingData & {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  upsertCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  saveInvoice: (invoice: Invoice) => void;
  deleteInvoice: (id: string) => void;
  addPayment: (payment: Payment) => void;
  deletePayment: (id: string) => void;
  upsertCheck: (check: CheckRecord) => void;
  deleteCheck: (id: string) => void;
  setSettings: (settings: BusinessSettings) => void;
  replaceAll: (data: AccountingData) => void;
  resetAll: () => void;
};

function isPosted(status: Invoice['status']) {
  return status !== 'draft';
}

function applyInventory(products: Product[], invoice: Invoice, direction: 1 | -1) {
  if (!isPosted(invoice.status)) return products;
  const map = new Map(products.map((p) => [p.id, { ...p }]));
  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = map.get(item.productId);
    if (!product || product.kind !== 'product') continue;
    const movement = invoice.kind === 'sale' ? -item.qty : item.qty;
    product.stock += movement * direction;
  }
  return Array.from(map.values());
}

function withInvoiceStatuses(invoices: Invoice[], payments: Payment[]) {
  return invoices.map((invoice) => {
    if (invoice.status === 'draft') return invoice;
    const paid = payments.filter((p) => p.invoiceId === invoice.id).reduce((s, p) => s + p.amount, 0);
    const total = invoiceTotal(invoice);
    const status: Invoice['status'] = paid <= 0 ? 'final' : paid >= total ? 'settled' : 'partial';
    return { ...invoice, status };
  });
}

export const useAccountingStore = create<Store>()(
  persist(
    (set, get) => ({
      ...seedData,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      upsertCustomer: (customer) => set((s) => ({ customers: s.customers.some((c) => c.id === customer.id) ? s.customers.map((c) => c.id === customer.id ? customer : c) : [customer, ...s.customers] })),
      deleteCustomer: (id) => set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),
      upsertProduct: (product) => set((s) => ({ products: s.products.some((p) => p.id === product.id) ? s.products.map((p) => p.id === product.id ? product : p) : [product, ...s.products] })),
      deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),
      saveInvoice: (invoice) => set((s) => {
        const prev = s.invoices.find((i) => i.id === invoice.id);
        let products = s.products;
        if (prev) products = applyInventory(products, prev, -1);
        products = applyInventory(products, invoice, 1);
        const invoices = prev ? s.invoices.map((i) => i.id === invoice.id ? invoice : i) : [invoice, ...s.invoices];
        return { products, invoices: withInvoiceStatuses(invoices, s.payments) };
      }),
      deleteInvoice: (id) => set((s) => {
        const prev = s.invoices.find((i) => i.id === id);
        const products = prev ? applyInventory(s.products, prev, -1) : s.products;
        const payments = s.payments.filter((p) => p.invoiceId !== id);
        return { products, payments, invoices: s.invoices.filter((i) => i.id !== id) };
      }),
      addPayment: (payment) => set((s) => {
        const payments = [payment, ...s.payments];
        return { payments, invoices: withInvoiceStatuses(s.invoices, payments) };
      }),
      deletePayment: (id) => set((s) => {
        const payments = s.payments.filter((p) => p.id !== id);
        return { payments, invoices: withInvoiceStatuses(s.invoices, payments) };
      }),
      upsertCheck: (check) => set((s) => ({ checks: s.checks.some((c) => c.id === check.id) ? s.checks.map((c) => c.id === check.id ? check : c) : [check, ...s.checks] })),
      deleteCheck: (id) => set((s) => ({ checks: s.checks.filter((c) => c.id !== id) })),
      setSettings: (settings) => set({ settings }),
      replaceAll: (data) => set({ ...data }),
      resetAll: () => set({ ...seedData }),
    }),
    {
      name: 'accountants-web-v1',
      partialize: (s) => ({ customers: s.customers, products: s.products, invoices: s.invoices, payments: s.payments, checks: s.checks, settings: s.settings }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    }
  )
);
