import type { AccountingData, Invoice, Payment } from '../types';
import { invoiceOutstandingAmount, invoiceReservedByPendingChecks } from '../utils';
import { recordsByField, recordsById } from './indexes';

export function paymentCapacity(invoice: Invoice, data: Pick<AccountingData, 'payments' | 'checks' | 'returns'>, excludePaymentId?: string) {
  const linkedPayments = recordsByField(data.payments, 'invoiceId').get(invoice.id) || [];
  const payments = linkedPayments.filter(item => item.id !== excludePaymentId);
  const checkIndex = recordsById(data.checks);
  const checks = [...new Set(payments.map(item => item.checkId).filter(Boolean))].flatMap(id => { const check = checkIndex.get(id!); return check ? [check] : []; });
  const returns = [...(recordsByField(data.returns, 'originalInvoiceId').get(invoice.id) || [])];
  const outstanding = invoiceOutstandingAmount(invoice, payments, checks, returns);
  const reserved = invoiceReservedByPendingChecks(invoice, payments, checks);
  return { outstanding, reserved, available: Math.max(0, outstanding - reserved) };
}

export function eligiblePaymentChecks(form: Pick<Payment, 'customerId' | 'direction'>, data: Pick<AccountingData, 'payments' | 'checks'>, available = Infinity) {
  const used = new Set(data.payments.map((payment) => payment.checkId).filter(Boolean));
  return data.checks.filter((check) => check.status !== 'bounced'
    && check.direction === (form.direction === 'receipt' ? 'received' : 'issued')
    && (!form.customerId || check.customerId === form.customerId)
    && !used.has(check.id) && check.amount <= available + 0.0001);
}
