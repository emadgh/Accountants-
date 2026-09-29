import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AccountAdjustment, CheckRecord, Customer, CustomerLedgerEntry, Invoice, Payment, PaymentDirection, ReturnDocument, ReturnItem } from './types';
import { normalizeStoredDate } from './standards';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function money(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function invoiceTotal(invoice: Pick<Invoice, 'items' | 'discount' | 'tax' | 'shipping'>) {
  const sub = invoice.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  return Math.max(0, sub - Number(invoice.discount || 0) + Number(invoice.tax || 0) + Number(invoice.shipping || 0));
}

export function returnDocumentAmount(
  originalInvoice: Pick<Invoice, 'items' | 'discount' | 'tax' | 'shipping'>,
  items: Pick<ReturnItem, 'qty' | 'unitPrice'>[]
) {
  const originalSubtotal = originalInvoice.items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0),
    0
  );
  if (originalSubtotal <= 0) return 0;
  const rawReturn = items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0),
    0
  );
  const factor = invoiceTotal(originalInvoice) / originalSubtotal;
  return Math.min(invoiceTotal(originalInvoice), Math.max(0, rawReturn * factor));
}

export function returnedQuantityForItem(
  originalItemId: string,
  returns: ReturnDocument[],
  excludeReturnId?: string
) {
  return returns
    .filter((document) => document.id !== excludeReturnId && document.status === 'final')
    .flatMap((document) => document.items)
    .filter((item) => item.originalItemId === originalItemId)
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export function expectedPaymentDirection(invoice: Pick<Invoice, 'kind'>): PaymentDirection {
  return invoice.kind === 'sale' ? 'receipt' : 'payment';
}

export function resolvedPaymentDirection(
  payment: Payment,
  invoice?: Pick<Invoice, 'kind'> | null
): PaymentDirection {
  // Legacy local backups may not contain direction; infer it from the linked invoice.
  return payment.direction || (invoice ? expectedPaymentDirection(invoice) : 'receipt');
}

export function paymentIsEffective(payment: Payment, checks: CheckRecord[]) {
  if (payment.method !== 'check') return true;
  if (!payment.checkId) return false;
  return checks.find((check) => check.id === payment.checkId)?.status === 'cleared';
}

export function effectivePaymentAmount(payment: Payment, checks: CheckRecord[]) {
  return paymentIsEffective(payment, checks) ? Number(payment.amount || 0) : 0;
}

export function settledForInvoice(invoice: Pick<Invoice, 'id' | 'kind'>, payments: Payment[], checks: CheckRecord[]) {
  const expected = expectedPaymentDirection(invoice);
  return payments
    .filter((payment) => payment.invoiceId === invoice.id)
    .filter((payment) => resolvedPaymentDirection(payment, invoice) === expected)
    .reduce((sum, payment) => sum + effectivePaymentAmount(payment, checks), 0);
}

export function normalizeDateKey(value: string) {
  if (!value || value === 'ابتدای دوره') return value;
  return normalizeStoredDate(value);
}

export function buildCustomerLedger(
  customer: Customer,
  invoices: Invoice[],
  payments: Payment[],
  checks: CheckRecord[],
  adjustments: AccountAdjustment[] = [],
  returns: ReturnDocument[] = []
): CustomerLedgerEntry[] {
  const entries: Omit<CustomerLedgerEntry, 'balance'>[] = [];
  const opening = Number(customer.openingBalance || 0);

  if (Math.abs(opening) > 0.0001) {
    entries.push({
      id: `opening_${customer.id}`,
      customerId: customer.id,
      date: 'ابتدای دوره',
      sortKey: '0000-00-00|0000',
      kind: 'opening',
      title: 'مانده اول دوره',
      debit: opening > 0 ? opening : 0,
      credit: opening < 0 ? Math.abs(opening) : 0,
      nominalAmount: Math.abs(opening),
      effective: true,
    });
  }

  adjustments
    .filter((item) => item.customerId === customer.id)
    .forEach((item) => {
      const amount = Number(item.amount || 0);
      entries.push({
        id: item.id,
        customerId: customer.id,
        date: item.date,
        sortKey: `${normalizeDateKey(item.date)}|${item.createdAt || item.id}`,
        kind: 'adjustment',
        title: amount >= 0 ? 'اصلاحیه بدهکار' : 'اصلاحیه بستانکار',
        reference: item.id,
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
        nominalAmount: Math.abs(amount),
        effective: true,
        note: item.note,
      });
    });

  invoices
    .filter((invoice) => invoice.customerId === customer.id && invoice.status !== 'draft')
    .forEach((invoice) => {
      const sortDate = invoice.voidedAt || invoice.finalizedAt || invoice.updatedAt || invoice.createdAt;
      if (invoice.status === 'void') {
        entries.push({
          id: `void_${invoice.id}`,
          customerId: customer.id,
          date: invoice.date,
          sortKey: `${normalizeDateKey(invoice.date)}|${sortDate}`,
          kind: 'void',
          title: `ابطال فاکتور ${invoice.kind === 'sale' ? 'فروش' : 'خرید'}`,
          reference: invoice.number,
          debit: 0,
          credit: 0,
          nominalAmount: invoiceTotal(invoice),
          effective: false,
          status: 'void',
          note: invoice.voidReason,
          invoiceId: invoice.id,
          invoiceKind: invoice.kind,
        });
        return;
      }

      const total = invoiceTotal(invoice);
      entries.push({
        id: `invoice_${invoice.id}`,
        customerId: customer.id,
        date: invoice.date,
        sortKey: `${normalizeDateKey(invoice.date)}|${invoice.finalizedAt || invoice.updatedAt || invoice.createdAt}`,
        kind: invoice.kind === 'sale' ? 'sale' : 'purchase',
        title: invoice.kind === 'sale' ? 'فاکتور فروش' : 'فاکتور خرید',
        reference: invoice.number,
        debit: invoice.kind === 'sale' ? total : 0,
        credit: invoice.kind === 'purchase' ? total : 0,
        nominalAmount: total,
        effective: true,
        status: invoice.status,
        invoiceId: invoice.id,
        invoiceKind: invoice.kind,
      });
    });

  returns
    .filter((document) => document.customerId === customer.id && document.status !== 'draft')
    .forEach((document) => {
      if (document.status === 'void') {
        entries.push({
          id: 'void_return_' + document.id,
          customerId: customer.id,
          date: document.date,
          sortKey: normalizeDateKey(document.date) + '|' + (document.voidedAt || document.updatedAt),
          kind: 'void',
          title: 'ابطال ' + (document.kind === 'sale-return' ? 'مرجوعی فروش' : 'مرجوعی خرید'),
          reference: document.number,
          debit: 0,
          credit: 0,
          nominalAmount: Number(document.totalAmount || 0),
          effective: false,
          status: 'void',
          note: document.voidReason,
          returnId: document.id,
          returnKind: document.kind,
        });
        return;
      }

      const amount = Number(document.totalAmount || 0);
      const saleReturn = document.kind === 'sale-return';
      entries.push({
        id: 'return_' + document.id,
        customerId: customer.id,
        date: document.date,
        sortKey: normalizeDateKey(document.date) + '|' + (document.finalizedAt || document.updatedAt),
        kind: document.kind,
        title: saleReturn ? 'مرجوعی فروش' : 'مرجوعی خرید',
        reference: document.number,
        debit: saleReturn ? 0 : amount,
        credit: saleReturn ? amount : 0,
        nominalAmount: amount,
        effective: true,
        status: 'final',
        note: document.notes,
        returnId: document.id,
        returnKind: document.kind,
      });
    });

  const linkedCheckIds = new Set<string>();
  payments
    .filter((payment) => payment.customerId === customer.id)
    .forEach((payment) => {
      const invoice = payment.invoiceId ? invoices.find((item) => item.id === payment.invoiceId) : undefined;
      const direction = resolvedPaymentDirection(payment, invoice);
      const effectiveAmount = effectivePaymentAmount(payment, checks);
      const nominalAmount = Number(payment.amount || 0);
      const check = payment.checkId ? checks.find((item) => item.id === payment.checkId) : undefined;
      if (payment.checkId) linkedCheckIds.add(payment.checkId);

      entries.push({
        id: `payment_${payment.id}`,
        customerId: customer.id,
        date: payment.date,
        sortKey: `${normalizeDateKey(payment.date)}|${payment.id}`,
        kind: direction === 'receipt' ? 'receipt' : 'payment',
        title: payment.method === 'check'
          ? direction === 'receipt' ? 'چک دریافتی' : 'چک پرداختی'
          : direction === 'receipt' ? 'دریافت' : 'پرداخت',
        reference: payment.reference || check?.number || payment.id,
        debit: direction === 'payment' ? effectiveAmount : 0,
        credit: direction === 'receipt' ? effectiveAmount : 0,
        nominalAmount,
        effective: effectiveAmount > 0,
        status: payment.method === 'check' ? check?.status || 'missing-check' : 'effective',
        note: payment.notes,
        invoiceId: payment.invoiceId,
        invoiceKind: invoice?.kind,
      });
    });

  checks
    .filter((check) => check.customerId === customer.id && !linkedCheckIds.has(check.id))
    .forEach((check) => {
      entries.push({
        id: `check_${check.id}`,
        customerId: customer.id,
        date: check.dueDate,
        sortKey: `${normalizeDateKey(check.dueDate)}|${check.id}`,
        kind: 'check',
        title: check.direction === 'received' ? 'چک دریافتی ثبت‌شده' : 'چک پرداختی ثبت‌شده',
        reference: check.number,
        debit: 0,
        credit: 0,
        nominalAmount: Number(check.amount || 0),
        effective: false,
        status: check.status,
        note: check.notes,
      });
    });

  const sorted = entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'en'));
  let balance = 0;
  return sorted.map((entry) => {
    balance += Number(entry.debit || 0) - Number(entry.credit || 0);
    return { ...entry, balance };
  });
}

export function customerNetBalance(
  customerId: string,
  invoices: Invoice[],
  payments: Payment[],
  checks: CheckRecord[],
  adjustments: AccountAdjustment[] = [],
  openingBalance = 0,
  returns: ReturnDocument[] = []
) {
  const customer: Customer = {
    id: customerId,
    code: '',
    name: '',
    kind: 'both',
    phone: '',
    address: '',
    nationalId: '',
    economicCode: '',
    postalCode: '',
    openingBalance,
  };
  const ledger = buildCustomerLedger(customer, invoices, payments, checks, adjustments, returns);
  return ledger.length ? ledger[ledger.length - 1].balance : Number(openingBalance || 0);
}

export function todayFa() {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function nowFa() {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date());
}

export function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
