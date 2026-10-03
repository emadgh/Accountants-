import { getReceivableDueBuckets } from '../receivables';
import type { AccountingData, InvoiceKind } from '../types';
import { invoiceTotal, normalizeDateKey, settledForInvoice } from '../utils';
import { recordsByField } from './indexes';
import { paymentCapacity } from './payment-capacity';

export interface DocumentFilters { q: string; status: string; from: string; to: string; customerId: string; projectId: string; balance: string }
export function documentList(data: Pick<AccountingData, 'invoices' | 'payments' | 'checks' | 'returns'>, kind: InvoiceKind, filters: DocumentFilters, today: string) {
  const returned = new Map<string, number>();
  for (const item of data.returns) if (item.status === 'final') returned.set(item.originalInvoiceId, (returned.get(item.originalInvoiceId) || 0) + item.totalAmount);
  return data.invoices.filter((invoice) => invoice.kind === kind)
    .filter((invoice) => `${invoice.number} ${invoice.customerName}`.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase()))
    .filter((invoice) => filters.status === 'all' || invoice.status === filters.status)
    .filter((invoice) => !filters.from || normalizeDateKey(invoice.date) >= normalizeDateKey(filters.from))
    .filter((invoice) => !filters.to || normalizeDateKey(invoice.date) <= normalizeDateKey(filters.to))
    .filter((invoice) => !filters.customerId || invoice.customerId === filters.customerId)
    .filter((invoice) => !filters.projectId || invoice.projectId === filters.projectId)
    .map((invoice) => {
      const total = invoiceTotal(invoice); const returnedAmount = returned.get(invoice.id) || 0;
      const linked = { payments: [...(recordsByField(data.payments, 'invoiceId').get(invoice.id) || [])], returns: [...(recordsByField(data.returns, 'originalInvoiceId').get(invoice.id) || [])], checks: data.checks };
      const capacity = paymentCapacity(invoice, linked);
      const paid = settledForInvoice(invoice, linked.payments, linked.checks);
      const posted = invoice.status !== 'draft' && invoice.status !== 'void';
      const overdue = posted && (invoice.kind === 'sale'
        ? getReceivableDueBuckets([invoice], linked.payments, linked.checks, linked.returns, today, today).overdue.length > 0
        : capacity.outstanding > 0 && !!invoice.dueDate && normalizeDateKey(invoice.dueDate) < normalizeDateKey(today));
      return { invoice, total, returned: returnedAmount, netTotal: Math.max(0, total - returnedAmount), paid, ...capacity, posted, overdue };
    }).filter((row) => filters.balance === 'all' || (row.posted && (filters.balance === 'open' ? row.outstanding > 0 : filters.balance === 'settled' ? row.outstanding <= 0 : row.overdue)));
}
