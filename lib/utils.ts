import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CheckRecord, Invoice, Payment, PaymentDirection } from './types';

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

export function customerNetBalance(
  customerId: string,
  invoices: Invoice[],
  payments: Payment[],
  checks: CheckRecord[]
) {
  const posted = invoices.filter(
    (invoice) => invoice.customerId === customerId && invoice.status !== 'draft' && invoice.status !== 'void'
  );
  const sales = posted
    .filter((invoice) => invoice.kind === 'sale')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const purchases = posted
    .filter((invoice) => invoice.kind === 'purchase')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);

  const effective = payments
    .filter((payment) => payment.customerId === customerId)
    .map((payment) => {
      const invoice = payment.invoiceId ? invoices.find((item) => item.id === payment.invoiceId) : undefined;
      return {
        direction: resolvedPaymentDirection(payment, invoice),
        amount: effectivePaymentAmount(payment, checks),
      };
    });

  const receipts = effective
    .filter((item) => item.direction === 'receipt')
    .reduce((sum, item) => sum + item.amount, 0);
  const outgoing = effective
    .filter((item) => item.direction === 'payment')
    .reduce((sum, item) => sum + item.amount, 0);

  // Positive = طرف حساب بدهکار است. Negative = طرف حساب بستانکار است.
  return sales - purchases - receipts + outgoing;
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
