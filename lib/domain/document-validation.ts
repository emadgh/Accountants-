import type {
  Invoice,
  OperationResult
} from '../types';
import {
  invoiceTotal
} from '../utils';

export function isPosted(status: Invoice['status']) {
  return status === 'final' || status === 'partial' || status === 'settled';
}

export function partialInvoiceContentSignature(invoice: Invoice) {
  return JSON.stringify({
    ...invoice,
    notes: undefined,
    status: undefined,
    revision: undefined,
    updatedAt: undefined,
    auditTrail: undefined,
  });
}

export function validateInstallments(invoice: Invoice): OperationResult {
  const installments = invoice.installments || [];
  if (!installments.length) return { ok: true };
  if (installments.some((item) => !item.dueDate || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)) {
    return { ok: false, message: 'برای هر قسط تاریخ و مبلغ بیشتر از صفر وارد کنید.' };
  }
  const scheduled = installments.reduce((sum, item) => sum + Number(item.amount), 0);
  if (Math.abs(scheduled - invoiceTotal(invoice)) > 1) {
    return { ok: false, message: 'جمع اقساط باید با مبلغ فاکتور برابر باشد.' };
  }
  return { ok: true };
}

