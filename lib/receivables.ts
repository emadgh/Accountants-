import type { CheckRecord, Invoice, Payment, ReturnDocument } from './types';
import { invoiceOutstandingAmount, normalizeDateKey } from './utils';

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
  const due = invoices
    .filter((invoice) => invoice.kind === 'sale' && invoice.status !== 'draft' && invoice.status !== 'void' && invoice.dueDate)
    .filter((invoice) => invoiceOutstandingAmount(invoice, payments, checks, returns) > 0)
    .sort((left, right) => normalizeDateKey(left.dueDate || '').localeCompare(normalizeDateKey(right.dueDate || '')));

  return {
    overdue: due.filter((invoice) => normalizeDateKey(invoice.dueDate || '') < todayKey),
    upcoming: due.filter((invoice) => {
      const dueKey = normalizeDateKey(invoice.dueDate || '');
      return dueKey >= todayKey && dueKey <= throughKey;
    }),
  };
}
