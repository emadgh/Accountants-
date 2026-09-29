'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { seedData } from './data';
import type {
  Account,
  AccountAdjustment,
  AccountingData,
  BusinessSettings,
  CheckRecord,
  Customer,
  DocumentSequenceKey,
  Invoice,
  InvoiceAuditAction,
  MoneyTransaction,
  OperationResult,
  Payment,
  Product,
  ReturnAuditAction,
  ReturnDocument,
  ReturnItem,
  ReturnOperationResult,
  StockAdjustmentInput,
  StockMovement,
  StockMovementAction,
  StoreOperationResult,
} from './types';
import {
  expectedPaymentDirection,
  invoiceTotal,
  returnDocumentAmount,
  returnedQuantityForItem,
  resolvedPaymentDirection,
  settledForInvoice,
  todayFa,
  uid,
} from './utils';
import {
  buildOpeningJournal,
  journalForCustomerAdjustment,
  journalForInvoice,
  journalForMoneyTransaction,
  journalForPayment,
  journalForReturn,
  journalForStockAdjustment,
  normalizeAccounts,
  reverseActiveSourceEntries,
} from './accounting';
import { formatDocumentNumber, normalizeStoredDate } from './standards';

type Store = AccountingData & {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  reserveDocumentNumber: (key: DocumentSequenceKey) => string;
  upsertCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  upsertProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  saveInvoiceDraft: (invoice: Invoice) => StoreOperationResult;
  finalizeInvoice: (invoice: Invoice) => StoreOperationResult;
  reviseInvoice: (invoice: Invoice, reason: string) => StoreOperationResult;
  voidInvoice: (id: string, reason: string) => StoreOperationResult;
  deleteInvoice: (id: string) => StoreOperationResult;
  saveReturnDraft: (document: ReturnDocument) => ReturnOperationResult;
  finalizeReturn: (document: ReturnDocument) => ReturnOperationResult;
  voidReturn: (id: string, reason: string) => ReturnOperationResult;
  deleteReturn: (id: string) => OperationResult;
  addPayment: (payment: Payment) => OperationResult;
  deletePayment: (id: string) => void;
  addAdjustment: (adjustment: AccountAdjustment) => OperationResult;
  addStockAdjustment: (input: StockAdjustmentInput) => OperationResult;
  upsertAccount: (account: Account) => OperationResult;
  deleteAccount: (id: string) => OperationResult;
  addMoneyTransaction: (transaction: MoneyTransaction) => OperationResult;
  voidMoneyTransaction: (id: string, reason: string) => OperationResult;
  upsertCheck: (check: CheckRecord) => OperationResult;
  deleteCheck: (id: string) => OperationResult;
  setSettings: (settings: BusinessSettings) => void;
  replaceAll: (data: AccountingData) => void;
  resetAll: () => void;
};

function isPosted(status: Invoice['status']) {
  return status === 'final' || status === 'partial' || status === 'settled';
}

const MAIN_WAREHOUSE_ID = 'main';

type InventoryApplyResult = OperationResult & {
  products: Product[];
  stockMovements: StockMovement[];
};

function normalizeProducts(products: Product[]) {
  return products.map((product) => ({
    ...product,
    averageCost: Number(product.averageCost ?? product.buyPrice ?? 0),
  }));
}

function buildOpeningMovements(products: Product[]): StockMovement[] {
  return products
    .filter((product) => product.kind === 'product' && Math.abs(Number(product.stock || 0)) > 0.0001)
    .map((product) => {
      const averageCost = Number(product.averageCost ?? product.buyPrice ?? 0);
      return {
        id: 'stock_open_' + product.id,
        productId: product.id,
        warehouseId: MAIN_WAREHOUSE_ID,
        date: 'ابتدای دوره',
        createdAt: '2000-01-01T00:00:00.000Z',
        quantity: Number(product.stock || 0),
        balanceAfter: Number(product.stock || 0),
        averageCostAfter: averageCost,
        unitCost: averageCost,
        type: 'opening' as const,
        action: 'migration-opening' as const,
        sourceType: 'system' as const,
        sourceId: 'migration-v3',
        sourceReference: 'موجودی انتقالی',
        note: 'مانده موجودی پیش از فعال شدن کاردکس انبار',
      };
    });
}

function applyInvoiceInventory(
  products: Product[],
  stockMovements: StockMovement[],
  invoice: Invoice,
  direction: 1 | -1,
  action: StockMovementAction
): InventoryApplyResult {
  const nextProducts = normalizeProducts(products);
  const nextMovements = [...stockMovements];

  for (const item of invoice.items) {
    if (!item.productId) continue;
    const index = nextProducts.findIndex((product) => product.id === item.productId);
    if (index < 0) continue;
    const product = { ...nextProducts[index] };
    if (product.kind !== 'product') continue;

    const baseQuantity = invoice.kind === 'sale' ? -Number(item.qty || 0) : Number(item.qty || 0);
    const quantity = baseQuantity * direction;
    const currentStock = Number(product.stock || 0);
    const currentAverage = Number(product.averageCost ?? product.buyPrice ?? 0);
    const newStock = currentStock + quantity;

    if (newStock < -0.0001) {
      return {
        ok: false,
        message: 'برگشت/ثبت سند باعث موجودی منفی برای «' + product.name + '» می‌شود. موجودی فعلی: ' + currentStock + ' ' + product.unit + '.',
        products,
        stockMovements,
      };
    }

    let unitCost = currentAverage;
    let newAverage = currentAverage;

    if (invoice.kind === 'purchase') {
      unitCost = Math.max(0, Number(item.unitPrice || 0));
      const newValue = currentStock * currentAverage + quantity * unitCost;
      newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
      if (direction === 1) product.buyPrice = unitCost;
    } else if (direction === -1) {
      const originalSale = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'invoice' &&
          movement.sourceId === invoice.id &&
          movement.productId === product.id &&
          movement.type === 'sale' &&
          movement.quantity < 0
      );
      unitCost = Number(originalSale?.unitCost ?? currentAverage);
      const newValue = currentStock * currentAverage + quantity * unitCost;
      newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
    }

    product.stock = Math.abs(newStock) < 0.0001 ? 0 : newStock;
    product.averageCost = newAverage;
    nextProducts[index] = product;

    nextMovements.push({
      id: uid('stock'),
      productId: product.id,
      warehouseId: MAIN_WAREHOUSE_ID,
      date: invoice.date,
      createdAt: new Date().toISOString(),
      quantity,
      balanceAfter: product.stock,
      averageCostAfter: newAverage,
      unitCost,
      type: direction === -1 ? 'reversal' : invoice.kind === 'sale' ? 'sale' : 'purchase',
      action,
      sourceType: 'invoice',
      sourceId: invoice.id,
      sourceReference: invoice.number,
      sourceKind: invoice.kind,
      note: action === 'revision-reversal'
        ? 'برگشت اثر نسخه قبلی فاکتور'
        : action === 'void-reversal'
          ? 'برگشت اثر فاکتور باطل‌شده'
          : action === 'revision'
            ? 'ثبت Revision جدید فاکتور'
            : undefined,
    });
  }

  return { ok: true, products: nextProducts, stockMovements: nextMovements };
}


function applyReturnInventory(
  products: Product[],
  stockMovements: StockMovement[],
  document: ReturnDocument,
  originalInvoice: Invoice,
  direction: 1 | -1,
  action: StockMovementAction
): InventoryApplyResult {
  const nextProducts = normalizeProducts(products);
  const nextMovements = [...stockMovements];

  for (const item of document.items) {
    if (!item.productId) continue;
    const index = nextProducts.findIndex((product) => product.id === item.productId);
    if (index < 0) continue;
    const product = { ...nextProducts[index] };
    if (product.kind !== 'product') continue;

    const baseQuantity = document.kind === 'sale-return' ? Number(item.qty || 0) : -Number(item.qty || 0);
    const quantity = baseQuantity * direction;
    const currentStock = Number(product.stock || 0);
    const currentAverage = Number(product.averageCost ?? product.buyPrice ?? 0);
    const newStock = currentStock + quantity;

    if (newStock < -0.0001) {
      return {
        ok: false,
        message: 'مرجوعی باعث موجودی منفی برای «' + product.name + '» می‌شود. موجودی فعلی: ' + currentStock + ' ' + product.unit + '.',
        products,
        stockMovements,
      };
    }

    let unitCost = currentAverage;
    if (direction === -1) {
      const originalReturnMovement = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'return' &&
          movement.sourceId === document.id &&
          movement.productId === product.id &&
          (movement.type === 'sale-return' || movement.type === 'purchase-return')
      );
      unitCost = Number(originalReturnMovement?.unitCost ?? currentAverage);
    } else if (document.kind === 'sale-return') {
      const originalSaleMovement = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'invoice' &&
          movement.sourceId === originalInvoice.id &&
          movement.productId === product.id &&
          movement.type === 'sale'
      );
      unitCost = Number(originalSaleMovement?.unitCost ?? currentAverage);
    } else {
      const originalItem = originalInvoice.items.find((source) => source.id === item.originalItemId);
      unitCost = Number(originalItem?.unitPrice ?? item.unitPrice ?? currentAverage);
    }

    const newValue = currentStock * currentAverage + quantity * unitCost;
    const newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
    product.stock = Math.abs(newStock) < 0.0001 ? 0 : newStock;
    product.averageCost = newAverage;
    nextProducts[index] = product;

    nextMovements.push({
      id: uid('stock'),
      productId: product.id,
      warehouseId: MAIN_WAREHOUSE_ID,
      date: document.date,
      createdAt: new Date().toISOString(),
      quantity,
      balanceAfter: product.stock,
      averageCostAfter: newAverage,
      unitCost,
      type: direction === -1 ? 'reversal' : document.kind,
      action,
      sourceType: 'return',
      sourceId: document.id,
      sourceReference: document.number,
      sourceKind: document.kind,
      note: direction === -1 ? 'برگشت اثر سند مرجوعی باطل‌شده' : 'مرجوعی مرتبط با فاکتور ' + originalInvoice.number,
    });
  }

  return { ok: true, products: nextProducts, stockMovements: nextMovements };
}

function appendReturnAudit(document: ReturnDocument, action: ReturnAuditAction, note?: string) {
  return [
    ...(document.auditTrail || []),
    {
      id: uid('audit'),
      action,
      at: new Date().toISOString(),
      ...(note?.trim() ? { note: note.trim() } : {}),
    },
  ];
}

function normalizeReturnItems(document: ReturnDocument, originalInvoice: Invoice): ReturnItem[] {
  const items: ReturnItem[] = [];
  for (const item of document.items) {
    const source = originalInvoice.items.find((original) => original.id === item.originalItemId);
    const qty = Number(item.qty || 0);
    if (!source || qty <= 0) continue;
    items.push({
      id: item.id || uid('retrow'),
      originalItemId: source.id,
      productId: source.productId,
      description: source.description,
      unit: source.unit,
      qty,
      unitPrice: Number(source.unitPrice || 0),
    });
  }
  return items;
}

function validateReturn(
  document: ReturnDocument,
  originalInvoice: Invoice | undefined,
  allReturns: ReturnDocument[]
): ReturnOperationResult {
  if (!originalInvoice || !isPosted(originalInvoice.status)) {
    return { ok: false, message: 'فاکتور اصلی باید قطعی و فعال باشد.' };
  }
  const expectedKind = originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return';
  if (document.kind !== expectedKind) {
    return { ok: false, message: 'نوع مرجوعی با فاکتور اصلی سازگار نیست.' };
  }
  if (!document.number.trim()) return { ok: false, message: 'شماره سند مرجوعی الزامی است.' };
  const duplicate = allReturns.some(
    (item) => item.id !== document.id && item.kind === document.kind && item.number.trim() === document.number.trim()
  );
  if (duplicate) return { ok: false, message: 'شماره سند مرجوعی تکراری است.' };

  const items = normalizeReturnItems(document, originalInvoice);
  if (!items.length) return { ok: false, message: 'حداقل یک ردیف با مقدار مرجوعی بزرگ‌تر از صفر لازم است.' };

  for (const item of items) {
    const source = originalInvoice.items.find((original) => original.id === item.originalItemId);
    if (!source) return { ok: false, message: 'یکی از ردیف‌های مرجوعی در فاکتور اصلی پیدا نشد.' };
    const alreadyReturned = returnedQuantityForItem(source.id, allReturns, document.id);
    const remaining = Number(source.qty || 0) - alreadyReturned;
    if (item.qty > remaining + 0.0001) {
      return {
        ok: false,
        message: 'مقدار مرجوعی «' + source.description + '» بیشتر از مانده قابل مرجوعی است. مانده: ' + remaining + ' ' + source.unit + '.',
      };
    }
  }
  return { ok: true };
}

function withInvoiceStatuses(
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

function normalizeImportedPayments(data: Pick<AccountingData, 'payments' | 'invoices'>) {
  return data.payments.map((payment) => {
    const invoice = payment.invoiceId ? data.invoices.find((item) => item.id === payment.invoiceId) : undefined;
    return {
      ...payment,
      direction: resolvedPaymentDirection(payment, invoice),
    };
  });
}

function normalizeAccountingData(data: AccountingData): AccountingData {
  const customers = (data.customers || []).map((customer) => ({
    ...customer,
    openingBalance: Number(customer.openingBalance || 0),
  }));
  const products = normalizeProducts(data.products || []);
  const invoices = (data.invoices || []).map((invoice) => ({ ...invoice, date: normalizeStoredDate(invoice.date) }));
  const returns = (data.returns || []).map((document) => ({ ...document, date: normalizeStoredDate(document.date) }));
  const checks = (data.checks || []).map((check, index) => ({
    ...check,
    documentNumber: check.documentNumber || 'C-' + String(index + 1).padStart(6, '0'),
    dueDate: normalizeStoredDate(check.dueDate),
  }));
  const rawPayments = (data.payments || []).map((payment, index) => ({
    ...payment,
    documentNumber: payment.documentNumber || (payment.direction === 'payment' ? 'PY-' : 'R-') + String(index + 1).padStart(6, '0'),
    date: normalizeStoredDate(payment.date),
  }));
  const payments = normalizeImportedPayments({ invoices, payments: rawPayments });
  const adjustments = (data.adjustments || []).map((item) => ({ ...item, date: normalizeStoredDate(item.date) }));
  const stockMovements = (data.stockMovements?.length ? data.stockMovements : buildOpeningMovements(products)).map((movement) => ({
    ...movement,
    date: movement.date === 'ابتدای دوره' ? movement.date : normalizeStoredDate(movement.date),
  }));
  const accounts = normalizeAccounts(data.accounts || []);
  const journalEntries = (data.journalEntries || []).map((entry) => ({
    ...entry,
    date: entry.date === 'ابتدای دوره' ? entry.date : normalizeStoredDate(entry.date),
  }));
  const moneyTransactions = (data.moneyTransactions || []).map((transaction) => ({
    ...transaction,
    date: normalizeStoredDate(transaction.date),
  }));
  const numbering = {
    ...seedData.settings.numbering,
    ...(data.settings?.numbering || {}),
  };

  const base: AccountingData = {
    customers,
    products,
    invoices: withInvoiceStatuses(invoices, payments, checks, returns),
    returns,
    payments,
    checks,
    adjustments,
    stockMovements,
    accounts,
    journalEntries,
    moneyTransactions,
    settings: { ...seedData.settings, ...(data.settings || {}), numbering },
  };

  return {
    ...base,
    journalEntries: base.journalEntries.length ? base.journalEntries : buildOpeningJournal(base, accounts),
  };
}

export const useAccountingStore = create<Store>()(
  persist(
    (set, get) => ({
      ...normalizeAccountingData(seedData),
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      reserveDocumentNumber: (key) => {
        const state = get();
        const current = state.settings.numbering[key] || seedData.settings.numbering[key];
        const used = new Set<string>();
        if (key === 'sale' || key === 'purchase') {
          state.invoices.filter((invoice) => invoice.kind === key).forEach((invoice) => used.add(invoice.number.trim()));
        } else if (key === 'receipt' || key === 'payment') {
          state.payments
            .filter((payment) => payment.direction === key)
            .forEach((payment) => used.add(payment.documentNumber.trim()));
        } else {
          state.checks.forEach((check) => used.add(check.documentNumber.trim()));
        }

        let next = Math.max(1, Number(current.next || 1));
        let candidate = formatDocumentNumber({ ...current, next });
        while (used.has(candidate)) {
          next++;
          candidate = formatDocumentNumber({ ...current, next });
        }

        set({
          settings: {
            ...state.settings,
            numbering: {
              ...state.settings.numbering,
              [key]: { ...current, next: next + 1 },
            },
          },
        });
        return candidate;
      },

      upsertCustomer: (customer) =>
        set((state) => {
          const exists = state.customers.some((item) => item.id === customer.id);
          const customers = exists
            ? state.customers.map((item) => (item.id === customer.id ? customer : item))
            : [customer, ...state.customers];
          if (exists || Math.abs(Number(customer.openingBalance || 0)) <= 0.0001) return { customers };

          const opening: AccountAdjustment = {
            id: 'opening-customer-' + customer.id,
            customerId: customer.id,
            date: 'ابتدای دوره',
            amount: Number(customer.openingBalance || 0),
            note: 'مانده افتتاحیه ' + customer.name,
            createdAt: new Date().toISOString(),
          };
          return {
            customers,
            journalEntries: [...state.journalEntries, ...journalForCustomerAdjustment(opening, state.accounts)],
          };
        }),

      deleteCustomer: (id) => set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),

      upsertProduct: (product) =>
        set((state) => {
          const previous = state.products.find((item) => item.id === product.id);
          if (previous) {
            const normalized: Product = {
              ...product,
              stock: previous.stock,
              averageCost: Number(previous.averageCost ?? previous.buyPrice ?? product.buyPrice ?? 0),
            };
            return { products: state.products.map((item) => (item.id === product.id ? normalized : item)) };
          }

          const normalized: Product = {
            ...product,
            averageCost: Number(product.averageCost ?? product.buyPrice ?? 0),
          };
          let stockMovements = state.stockMovements;
          if (normalized.kind === 'product' && Math.abs(Number(normalized.stock || 0)) > 0.0001) {
            const averageCost = Number(normalized.averageCost || 0);
            stockMovements = [...stockMovements, {
              id: uid('stock'),
              productId: normalized.id,
              warehouseId: MAIN_WAREHOUSE_ID,
              date: todayFa(),
              createdAt: new Date().toISOString(),
              quantity: Number(normalized.stock || 0),
              balanceAfter: Number(normalized.stock || 0),
              averageCostAfter: averageCost,
              unitCost: averageCost,
              type: 'opening',
              action: 'product-opening',
              sourceType: 'system',
              sourceId: normalized.id,
              sourceReference: 'موجودی اولیه کالا',
            }];
          }
          const newMovements = stockMovements.slice(state.stockMovements.length);
          return {
            products: [normalized, ...state.products],
            stockMovements,
            journalEntries: [
              ...state.journalEntries,
              ...newMovements.flatMap((movement) => journalForStockAdjustment(movement, state.accounts)),
            ],
          };
        }),

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

        const inventory = applyInvoiceInventory(state.products, state.stockMovements, next, 1, 'finalize');
        if (!inventory.ok) return { ok: false, message: inventory.message };
        const merged = previous
          ? state.invoices.map((item) => (item.id === next.id ? next : item))
          : [next, ...state.invoices];
        const invoices = withInvoiceStatuses(merged, state.payments, state.checks, state.returns);
        const saved = invoices.find((item) => item.id === next.id) || next;
        const newMovements = inventory.stockMovements.slice(state.stockMovements.length);
        const journalEntries = [
          ...state.journalEntries,
          ...journalForInvoice(next, state.products, newMovements, state.accounts, 'post'),
        ];
        set({ products: inventory.products, stockMovements: inventory.stockMovements, invoices, journalEntries });
        return { ok: true, invoice: saved };
      },

      reviseInvoice: (invoice, reason) => {
        const state = get();
        const previous = state.invoices.find((item) => item.id === invoice.id);
        if (!previous || !isPosted(previous.status)) {
          return { ok: false, message: 'فقط فاکتور قطعی قابل Revision است.' };
        }
        if (!reason.trim()) return { ok: false, message: 'دلیل ویرایش سند قطعی را وارد کنید.' };
        if (state.returns.some((document) => document.originalInvoiceId === invoice.id && document.status === 'final')) {
          return { ok: false, message: 'این فاکتور مرجوعی قطعی دارد. ابتدا اسناد مرجوعی مرتبط را ابطال کنید.' };
        }
        if (invoice.number.trim() !== previous.number.trim()) {
          return { ok: false, message: 'شماره فاکتور قطعی قابل تغییر نیست.' };
        }

        const reversedInventory = applyInvoiceInventory(state.products, state.stockMovements, previous, -1, 'revision-reversal');
        if (!reversedInventory.ok) return { ok: false, message: reversedInventory.message };
        const baseProducts = reversedInventory.products;
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

        const appliedInventory = applyInvoiceInventory(baseProducts, reversedInventory.stockMovements, next, 1, 'revision');
        if (!appliedInventory.ok) return { ok: false, message: appliedInventory.message };
        const merged = state.invoices.map((item) => (item.id === next.id ? next : item));
        const invoices = withInvoiceStatuses(merged, state.payments, state.checks, state.returns);
        const saved = invoices.find((item) => item.id === next.id) || next;
        const reversals = reverseActiveSourceEntries(
          state.journalEntries,
          'invoice',
          previous.id,
          next.date,
          'برگشت ثبت قبلی فاکتور ' + previous.number,
          'revision-reversal'
        );
        const newMovements = appliedInventory.stockMovements.slice(reversedInventory.stockMovements.length);
        const posts = journalForInvoice(next, baseProducts, newMovements, state.accounts, 'revision-post');
        set({
          products: appliedInventory.products,
          stockMovements: appliedInventory.stockMovements,
          invoices,
          journalEntries: [...state.journalEntries, ...reversals, ...posts],
        });
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
        if (state.returns.some((document) => document.originalInvoiceId === id && document.status === 'final')) {
          return { ok: false, message: 'این فاکتور مرجوعی قطعی دارد. ابتدا اسناد مرجوعی مرتبط را ابطال کنید.' };
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
        const inventory = applyInvoiceInventory(state.products, state.stockMovements, previous, -1, 'void-reversal');
        if (!inventory.ok) return { ok: false, message: inventory.message };
        const invoices = state.invoices.map((item) => (item.id === id ? next : item));
        const reversals = reverseActiveSourceEntries(
          state.journalEntries,
          'invoice',
          previous.id,
          next.date,
          'ابطال فاکتور ' + previous.number + ' — ' + reason.trim(),
          'void-reversal'
        );
        set({
          products: inventory.products,
          stockMovements: inventory.stockMovements,
          invoices,
          journalEntries: [...state.journalEntries, ...reversals],
        });
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

      saveReturnDraft: (document) => {
        const state = get();
        const previous = state.returns.find((item) => item.id === document.id);
        if (previous && previous.status !== 'draft') {
          return { ok: false, message: 'سند مرجوعی قطعی قابل بازگشت به پیش‌نویس نیست.' };
        }
        const originalInvoice = state.invoices.find((invoice) => invoice.id === document.originalInvoiceId);
        if (!originalInvoice || !isPosted(originalInvoice.status)) {
          return { ok: false, message: 'فاکتور اصلی معتبر و قطعی پیدا نشد.' };
        }
        const now = new Date().toISOString();
        const base: ReturnDocument = {
          ...document,
          kind: originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return',
          status: 'draft',
          originalInvoiceNumber: originalInvoice.number,
          customerId: originalInvoice.customerId,
          customerName: originalInvoice.customerName,
          items: normalizeReturnItems(document, originalInvoice),
          totalAmount: 0,
          createdAt: previous?.createdAt || document.createdAt || now,
          updatedAt: now,
          finalizedAt: undefined,
          voidedAt: undefined,
          voidReason: undefined,
          auditTrail: previous?.auditTrail || document.auditTrail || [],
        };
        const next = { ...base, auditTrail: appendReturnAudit(base, previous ? 'draft_saved' : 'created') };
        const returns = previous
          ? state.returns.map((item) => item.id === next.id ? next : item)
          : [next, ...state.returns];
        set({ returns });
        return { ok: true, returnDocument: next };
      },

      finalizeReturn: (document) => {
        const state = get();
        const previous = state.returns.find((item) => item.id === document.id);
        if (previous && previous.status !== 'draft') {
          return { ok: false, message: 'این سند مرجوعی قبلاً قطعی شده است.' };
        }
        const originalInvoice = state.invoices.find((invoice) => invoice.id === document.originalInvoiceId);
        const valid = validateReturn(document, originalInvoice, state.returns);
        if (!valid.ok || !originalInvoice) return valid;

        const now = new Date().toISOString();
        const items = normalizeReturnItems(document, originalInvoice);
        const base: ReturnDocument = {
          ...document,
          kind: originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return',
          status: 'final',
          originalInvoiceNumber: originalInvoice.number,
          customerId: originalInvoice.customerId,
          customerName: originalInvoice.customerName,
          items,
          totalAmount: returnDocumentAmount(originalInvoice, items),
          createdAt: previous?.createdAt || document.createdAt || now,
          updatedAt: now,
          finalizedAt: now,
          voidedAt: undefined,
          voidReason: undefined,
          auditTrail: previous?.auditTrail || document.auditTrail || [],
        };
        const next: ReturnDocument = { ...base, auditTrail: appendReturnAudit(base, 'finalized') };
        const inventory = applyReturnInventory(state.products, state.stockMovements, next, originalInvoice, 1, 'return-finalize');
        if (!inventory.ok) return { ok: false, message: inventory.message };

        const returns = previous
          ? state.returns.map((item) => item.id === next.id ? next : item)
          : [next, ...state.returns];
        const invoices = withInvoiceStatuses(state.invoices, state.payments, state.checks, returns);
        const newMovements = inventory.stockMovements.slice(state.stockMovements.length);
        const journalEntries = [
          ...state.journalEntries,
          ...journalForReturn(next, originalInvoice, state.products, newMovements, state.accounts),
        ];
        set({ returns, invoices, products: inventory.products, stockMovements: inventory.stockMovements, journalEntries });
        return { ok: true, returnDocument: next };
      },

      voidReturn: (id, reason) => {
        const state = get();
        const previous = state.returns.find((item) => item.id === id);
        if (!previous || previous.status !== 'final') {
          return { ok: false, message: 'فقط سند مرجوعی قطعی قابل ابطال است.' };
        }
        if (!reason.trim()) return { ok: false, message: 'دلیل ابطال مرجوعی الزامی است.' };
        const originalInvoice = state.invoices.find((invoice) => invoice.id === previous.originalInvoiceId);
        if (!originalInvoice) return { ok: false, message: 'فاکتور اصلی پیدا نشد.' };

        const now = new Date().toISOString();
        const base: ReturnDocument = {
          ...previous,
          status: 'void',
          voidedAt: now,
          voidReason: reason.trim(),
          updatedAt: now,
        };
        const next: ReturnDocument = { ...base, auditTrail: appendReturnAudit(base, 'voided', reason) };
        const inventory = applyReturnInventory(state.products, state.stockMovements, previous, originalInvoice, -1, 'return-void-reversal');
        if (!inventory.ok) return { ok: false, message: inventory.message };
        const returns = state.returns.map((item) => item.id === id ? next : item);
        const invoices = withInvoiceStatuses(state.invoices, state.payments, state.checks, returns);
        const reversals = reverseActiveSourceEntries(
          state.journalEntries,
          'return',
          previous.id,
          next.date,
          'ابطال سند مرجوعی ' + previous.number + ' — ' + reason.trim(),
          'void-reversal'
        );
        set({
          returns,
          invoices,
          products: inventory.products,
          stockMovements: inventory.stockMovements,
          journalEntries: [...state.journalEntries, ...reversals],
        });
        return { ok: true, returnDocument: next };
      },

      deleteReturn: (id) => {
        const state = get();
        const previous = state.returns.find((item) => item.id === id);
        if (!previous) return { ok: false, message: 'سند مرجوعی پیدا نشد.' };
        if (previous.status !== 'draft') return { ok: false, message: 'فقط پیش‌نویس مرجوعی قابل حذف است.' };
        set({ returns: state.returns.filter((item) => item.id !== id) });
        return { ok: true };
      },

      addPayment: (payment) => {
        const state = get();
        if (!payment.customerId) return { ok: false, message: 'طرف حساب را انتخاب کنید.' };
        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          return { ok: false, message: 'مبلغ تراکنش باید بزرگ‌تر از صفر باشد.' };
        }
        if (!payment.documentNumber?.trim()) return { ok: false, message: 'شماره سند دریافت/پرداخت الزامی است.' };
        if (state.payments.some((item) => item.id !== payment.id && item.documentNumber?.trim() === payment.documentNumber.trim())) {
          return { ok: false, message: 'شماره سند دریافت/پرداخت تکراری است.' };
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
        const invoices = withInvoiceStatuses(state.invoices, payments, state.checks, state.returns);
        const linkedCheck = normalized.checkId ? state.checks.find((item) => item.id === normalized.checkId) : undefined;
        const shouldPost = normalized.method !== 'check' || linkedCheck?.status === 'cleared';
        const journalEntries = shouldPost
          ? [...state.journalEntries, ...journalForPayment(normalized, state.accounts)]
          : state.journalEntries;
        set({ payments, invoices, journalEntries });
        return { ok: true };
      },

      deletePayment: (id) => {
        const state = get();
        const payment = state.payments.find((item) => item.id === id);
        if (!payment) return;
        const payments = state.payments.filter((item) => item.id !== id);
        const reversals = reverseActiveSourceEntries(
          state.journalEntries,
          'payment',
          id,
          todayFa(),
          'برگشت تراکنش حذف‌شده',
          'status-reversal'
        );
        set({
          payments,
          invoices: withInvoiceStatuses(state.invoices, payments, state.checks, state.returns),
          journalEntries: [...state.journalEntries, ...reversals],
        });
      },

      addAdjustment: (adjustment) => {
        const state = get();
        if (!state.customers.some((customer) => customer.id === adjustment.customerId)) {
          return { ok: false, message: 'طرف حساب اصلاحیه پیدا نشد.' };
        }
        if (!Number.isFinite(adjustment.amount) || Math.abs(adjustment.amount) < 0.0001) {
          return { ok: false, message: 'مبلغ اصلاحیه باید بزرگ‌تر از صفر باشد.' };
        }
        if (!adjustment.note.trim()) {
          return { ok: false, message: 'ثبت دلیل اصلاحیه الزامی است.' };
        }
        const normalized: AccountAdjustment = {
          ...adjustment,
          amount: Number(adjustment.amount),
          note: adjustment.note.trim(),
          createdAt: adjustment.createdAt || new Date().toISOString(),
        };
        set({
          adjustments: [normalized, ...(state.adjustments || [])],
          journalEntries: [...state.journalEntries, ...journalForCustomerAdjustment(normalized, state.accounts)],
        });
        return { ok: true };
      },

      addStockAdjustment: (input) => {
        const state = get();
        const index = state.products.findIndex((product) => product.id === input.productId);
        if (index < 0) return { ok: false, message: 'کالا پیدا نشد.' };
        const current = state.products[index];
        if (current.kind !== 'product') return { ok: false, message: 'برای خدمات موجودی انبار ثبت نمی‌شود.' };
        if (!input.note.trim()) return { ok: false, message: 'دلیل اصلاح/شمارش موجودی الزامی است.' };

        const currentStock = Number(current.stock || 0);
        const quantity = input.mode === 'count' ? Number(input.quantity) - currentStock : Number(input.quantity);
        if (!Number.isFinite(quantity) || Math.abs(quantity) < 0.0001) {
          return { ok: false, message: 'تغییری در موجودی ایجاد نشده است.' };
        }
        const newStock = currentStock + quantity;
        if (newStock < -0.0001) {
          return { ok: false, message: 'اصلاح موجودی نمی‌تواند موجودی را منفی کند.' };
        }

        const averageCost = Number(current.averageCost ?? current.buyPrice ?? 0);
        const product: Product = { ...current, stock: Math.abs(newStock) < 0.0001 ? 0 : newStock, averageCost };
        const products = state.products.map((item, productIndex) => productIndex === index ? product : item);
        const sourceId = uid('stockadj');
        const movement: StockMovement = {
          id: uid('stock'),
          productId: product.id,
          warehouseId: MAIN_WAREHOUSE_ID,
          date: input.date,
          createdAt: new Date().toISOString(),
          quantity,
          balanceAfter: product.stock,
          averageCostAfter: averageCost,
          unitCost: averageCost,
          type: 'adjustment',
          action: input.mode === 'count' ? 'count' : 'manual-adjustment',
          sourceType: 'adjustment',
          sourceId,
          sourceReference: input.mode === 'count' ? 'شمارش انبار' : 'اصلاح موجودی',
          note: input.note.trim(),
        };
        set({
          products,
          stockMovements: [...state.stockMovements, movement],
          journalEntries: [...state.journalEntries, ...journalForStockAdjustment(movement, state.accounts)],
        });
        return { ok: true };
      },

      upsertAccount: (account) => {
        const state = get();
        const previous = state.accounts.find((item) => item.id === account.id);
        if (previous?.systemKey) return { ok: false, message: 'حساب سیستمی قابل تغییر ساختاری نیست.' };
        if (!account.code.trim() || !account.name.trim()) return { ok: false, message: 'کد و نام حساب الزامی است.' };
        if (state.accounts.some((item) => item.id !== account.id && item.code.trim() === account.code.trim())) {
          return { ok: false, message: 'کد حساب تکراری است.' };
        }
        const normalized: Account = { ...account, systemKey: undefined };
        set({
          accounts: previous
            ? state.accounts.map((item) => item.id === account.id ? normalized : item)
            : [...state.accounts, normalized],
        });
        return { ok: true };
      },

      deleteAccount: (id) => {
        const state = get();
        const account = state.accounts.find((item) => item.id === id);
        if (!account) return { ok: false, message: 'حساب پیدا نشد.' };
        if (account.systemKey) return { ok: false, message: 'حساب سیستمی قابل حذف نیست.' };
        const usedInJournal = state.journalEntries.some((entry) => entry.lines.some((line) => line.accountId === id));
        const usedInMoney = state.moneyTransactions.some((transaction) => transaction.settlementAccountId === id || transaction.categoryAccountId === id);
        if (usedInJournal || usedInMoney) return { ok: false, message: 'حساب دارای گردش است و قابل حذف نیست؛ آن را غیرفعال کنید.' };
        set({ accounts: state.accounts.filter((item) => item.id !== id) });
        return { ok: true };
      },

      addMoneyTransaction: (transaction) => {
        const state = get();
        const amount = Number(transaction.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'مبلغ باید بزرگ‌تر از صفر باشد.' };
        if (!transaction.description.trim()) return { ok: false, message: 'شرح تراکنش الزامی است.' };
        const settlement = state.accounts.find((account) => account.id === transaction.settlementAccountId && account.active);
        const category = state.accounts.find((account) => account.id === transaction.categoryAccountId && account.active);
        if (!settlement || settlement.type !== 'asset') return { ok: false, message: 'حساب صندوق/بانک معتبر انتخاب کنید.' };
        if (!category || (transaction.kind === 'income' ? category.type !== 'revenue' : category.type !== 'expense')) {
          return { ok: false, message: transaction.kind === 'income' ? 'حساب درآمد معتبر انتخاب کنید.' : 'حساب هزینه معتبر انتخاب کنید.' };
        }
        const now = new Date().toISOString();
        const normalized: MoneyTransaction = {
          ...transaction,
          status: 'final',
          amount,
          description: transaction.description.trim(),
          createdAt: transaction.createdAt || now,
          updatedAt: now,
          voidedAt: undefined,
          voidReason: undefined,
        };
        const journal = journalForMoneyTransaction(normalized, state.accounts);
        if (!journal.length) return { ok: false, message: 'ثبت حسابداری تراکنش تراز نشد.' };
        set({
          moneyTransactions: [normalized, ...state.moneyTransactions],
          journalEntries: [...state.journalEntries, ...journal],
        });
        return { ok: true };
      },

      voidMoneyTransaction: (id, reason) => {
        const state = get();
        const previous = state.moneyTransactions.find((item) => item.id === id);
        if (!previous || previous.status !== 'final') return { ok: false, message: 'تراکنش قطعی فعال پیدا نشد.' };
        if (!reason.trim()) return { ok: false, message: 'دلیل ابطال الزامی است.' };
        const now = new Date().toISOString();
        const transaction: MoneyTransaction = {
          ...previous,
          status: 'void',
          voidedAt: now,
          voidReason: reason.trim(),
          updatedAt: now,
        };
        const reversals = reverseActiveSourceEntries(
          state.journalEntries,
          'money-transaction',
          id,
          todayFa(),
          'ابطال ' + previous.description + ' — ' + reason.trim(),
          'void-reversal'
        );
        set({
          moneyTransactions: state.moneyTransactions.map((item) => item.id === id ? transaction : item),
          journalEntries: [...state.journalEntries, ...reversals],
        });
        return { ok: true };
      },

      upsertCheck: (check) => {
        const state = get();
        if (!check.documentNumber?.trim()) return { ok: false, message: 'شماره سند چک الزامی است.' };
        if (state.checks.some((item) => item.id !== check.id && item.documentNumber?.trim() === check.documentNumber.trim())) {
          return { ok: false, message: 'شماره سند چک تکراری است.' };
        }
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
        const invoices = withInvoiceStatuses(state.invoices, state.payments, checks, state.returns);
        let journalEntries = state.journalEntries;
        if (linkedPayment) {
          const wasEffective = previous?.status === 'cleared';
          const isEffective = check.status === 'cleared';
          if (!wasEffective && isEffective) {
            journalEntries = [...journalEntries, ...journalForPayment(linkedPayment, state.accounts)];
          } else if (wasEffective && !isEffective) {
            journalEntries = [
              ...journalEntries,
              ...reverseActiveSourceEntries(
                journalEntries,
                'payment',
                linkedPayment.id,
                todayFa(),
                'برگشت اثر چک ' + check.number + ' پس از تغییر وضعیت',
                'status-reversal'
              ),
            ];
          }
        }
        set({ checks, invoices, journalEntries });
        return { ok: true };
      },

      deleteCheck: (id) => {
        const state = get();
        if (state.payments.some((payment) => payment.checkId === id)) {
          return { ok: false, message: 'این چک به تراکنش متصل است و قابل حذف نیست. ابتدا تراکنش مرتبط را حذف کنید.' };
        }
        const checks = state.checks.filter((check) => check.id !== id);
        set({ checks, invoices: withInvoiceStatuses(state.invoices, state.payments, checks, state.returns) });
        return { ok: true };
      },

      setSettings: (settings) => set({ settings }),

      replaceAll: (data) => {
        set(normalizeAccountingData(data));
      },

      resetAll: () => {
        set(normalizeAccountingData(seedData));
      },
    }),
    {
      name: 'accountants-web-v1',
      version: 6,
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as Partial<AccountingData>;
        const products = normalizeProducts(state.products || seedData.products);
        return normalizeAccountingData({
          ...seedData,
          ...state,
          customers: (state.customers || seedData.customers).map((customer) => ({
            ...customer,
            openingBalance: Number(customer.openingBalance || 0),
          })),
          products,
          invoices: state.invoices || seedData.invoices,
          returns: state.returns || [],
          payments: state.payments || seedData.payments,
          checks: state.checks || seedData.checks,
          adjustments: state.adjustments || [],
          stockMovements: state.stockMovements?.length ? state.stockMovements : buildOpeningMovements(products),
          accounts: state.accounts || [],
          journalEntries: state.journalEntries || [],
          moneyTransactions: state.moneyTransactions || [],
          settings: { ...seedData.settings, ...(state.settings || {}) },
        });
      },
      partialize: (state) => ({
        customers: state.customers,
        products: state.products,
        invoices: state.invoices,
        returns: state.returns,
        payments: state.payments,
        checks: state.checks,
        adjustments: state.adjustments,
        stockMovements: state.stockMovements,
        accounts: state.accounts,
        journalEntries: state.journalEntries,
        moneyTransactions: state.moneyTransactions,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    }
  )
);
