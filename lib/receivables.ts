import type { CheckRecord, Invoice, Payment, ReturnDocument } from './types';
import { effectivePaymentAmount, invoiceTotal, normalizeDateKey } from './utils';

export interface ReceivableDueItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  amount: number;
  installmentNumber?: number;
  downPayment?: boolean;
}

function invoiceDueItems(invoice: Invoice, payments: Payment[], checks: CheckRecord[], returns: ReturnDocument[]) {
  let installmentNumber = 0;
  const installments = invoice.installments?.length
    ? invoice.installments.map((item) => {
      const downPayment = item.id === `installment-down-${invoice.id}`;
      return { id: item.id, dueDate: item.dueDate, amount: Number(item.amount), installmentNumber: downPayment ? undefined : ++installmentNumber, downPayment };
    })
    : invoice.dueDate
      ? [{ id: 'invoice-due', dueDate: invoice.dueDate, amount: invoiceTotal(invoice), installmentNumber: undefined, downPayment: false }]
      : [];
  installments.sort((left, right) => normalizeDateKey(left.dueDate).localeCompare(normalizeDateKey(right.dueDate)) || (left.installmentNumber || 0) - (right.installmentNumber || 0));

  const finalReturns = returns.filter((document) => document.originalInvoiceId === invoice.id && document.status === 'final');
  let returnRemainder = finalReturns.reduce((sum, document) => sum + Number(document.totalAmount || 0), 0);
  for (let index = installments.length - 1; index >= 0 && returnRemainder > 0; index -= 1) {
    const amount = Math.min(installments[index].amount, returnRemainder);
    installments[index].amount -= amount;
    returnRemainder -= amount;
  }

  const collected = payments
    .filter((payment) => payment.invoiceId === invoice.id && payment.direction === 'receipt')
    .reduce((sum, payment) => sum + effectivePaymentAmount(payment, checks), 0);
  let collectionRemainder = collected;
  return installments.map((installment) => {
    const allocated = Math.min(installment.amount, collectionRemainder);
    collectionRemainder -= allocated;
    const amount = Math.max(0, installment.amount - allocated);
    return {
      id: `${invoice.id}:${installment.id}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerName: invoice.customerName,
      dueDate: installment.dueDate,
      amount,
      installmentNumber: installment.installmentNumber,
      downPayment: installment.downPayment,
    } satisfies ReceivableDueItem;
  }).filter((item) => item.amount > 0.01);
}

export function getReceivableDueBuckets(
  invoices: Invoice[],
  payments: Payment[],
  checks: CheckRecord[],
  returns: ReturnDocument[],
  today: string,
  throughDate: string,
) {
  const todayKey = normalizeDateKey(today);
  const throughKey = normalizeDateKey(throughDate);
  const due: ReceivableDueItem[] = invoices
    .filter((invoice) => invoice.kind === 'sale' && invoice.status !== 'draft' && invoice.status !== 'void')
    .flatMap((invoice) => invoiceDueItems(invoice, payments, checks, returns))
    .sort((left, right) => normalizeDateKey(left.dueDate).localeCompare(normalizeDateKey(right.dueDate)));

  return {
    overdue: due.filter((item) => normalizeDateKey(item.dueDate) < todayKey),
    upcoming: due.filter((item) => {
      const dueKey = normalizeDateKey(item.dueDate);
      return dueKey >= todayKey && dueKey <= throughKey;
    }),
  };
}
