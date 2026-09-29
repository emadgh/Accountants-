import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Invoice, Payment } from './types';

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

export function paidForInvoice(invoiceId: string, payments: Payment[]) {
  return payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + Number(p.amount || 0), 0);
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
