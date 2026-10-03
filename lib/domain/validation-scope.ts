import { ACCOUNTING_COLLECTIONS } from '../accounting-commands';
import type { AccountingData } from '../types';

/** Validate changed records and their dependants while retaining full lookup data. */
export function validationScope(data: AccountingData, previous?: AccountingData) {
  if (!previous) return data;
  const ids = Object.fromEntries(ACCOUNTING_COLLECTIONS.map((key) => {
    const before = new Map((previous[key] as Array<{ id: string }>).map((row) => [row.id, JSON.stringify(row)]));
    const after = data[key] as Array<{ id: string }>;
    const changed = new Set(after.filter((row) => before.get(row.id) !== JSON.stringify(row)).map((row) => row.id));
    const remaining = new Set(after.map((row) => row.id));
    for (const id of before.keys()) if (!remaining.has(id)) changed.add(id);
    return [key, changed];
  })) as Record<typeof ACCOUNTING_COLLECTIONS[number], Set<string>>;
  const allPayments = [...previous.payments, ...data.payments];
  const allReturns = [...previous.returns, ...data.returns];
  for (const payment of allPayments) if (ids.payments.has(payment.id) || (payment.checkId && ids.checks.has(payment.checkId))) {
    ids.payments.add(payment.id); if (payment.invoiceId) ids.invoices.add(payment.invoiceId);
  }
  for (const document of allReturns) if (ids.returns.has(document.id)) ids.invoices.add(document.originalInvoiceId);
  // Catalogue reclassification preserves posting-time kinds; only deletion breaks links.
  for (const invoice of data.invoices) {
    const removedCustomer = ids.customers.has(invoice.customerId) && !data.customers.some((row) => row.id === invoice.customerId);
    const affectedProduct = invoice.items.some((line) => line.productId && ids.products.has(line.productId)
      && !data.products.some((row) => row.id === line.productId));
    if (removedCustomer || affectedProduct || (invoice.projectId && ids.projects.has(invoice.projectId) && !data.projects.some((row) => row.id === invoice.projectId))) ids.invoices.add(invoice.id);
  }
  for (const payment of allPayments) if (payment.invoiceId && ids.invoices.has(payment.invoiceId)) ids.payments.add(payment.id);
  for (const document of allReturns) if (ids.invoices.has(document.originalInvoiceId)) ids.returns.add(document.id);
  for (const entry of data.journalEntries) {
    const source = entry.sourceType === 'invoice' ? ids.invoices : entry.sourceType === 'return' ? ids.returns
      : entry.sourceType === 'payment' ? ids.payments : entry.sourceType === 'money-transaction' ? ids.moneyTransactions : undefined;
    if (source?.has(entry.sourceId) || entry.lines.some((line) => ids.accounts.has(line.accountId) && !data.accounts.some((account) => account.id === line.accountId))) ids.journalEntries.add(entry.id);
  }
  for (const movement of data.stockMovements) if ((ids.products.has(movement.productId) && !data.products.some((row) => row.id === movement.productId))
    || (movement.sourceType === 'invoice' && ids.invoices.has(movement.sourceId))
    || (movement.sourceType === 'return' && ids.returns.has(movement.sourceId))) ids.stockMovements.add(movement.id);
  for (const project of data.projects) if (ids.customers.has(project.customerId) && !data.customers.some((row) => row.id === project.customerId)) ids.projects.add(project.id);
  for (const quote of data.quotes) if (ids.customers.has(quote.customerId) && !data.customers.some((row) => row.id === quote.customerId)
    || (quote.projectId && ids.projects.has(quote.projectId) && !data.projects.some((row) => row.id === quote.projectId))
    || quote.items.some((item) => item.productId && ids.products.has(item.productId) && !data.products.some((row) => row.id === item.productId))) ids.quotes.add(quote.id);
  for (const payment of data.payments) if (ids.customers.has(payment.customerId) && !data.customers.some((row) => row.id === payment.customerId)) ids.payments.add(payment.id);
  for (const attachment of data.attachments) if (ids.projects.has(attachment.projectId) && !data.projects.some((row) => row.id === attachment.projectId)) ids.attachments.add(attachment.id);
  return { ...data, ...Object.fromEntries(ACCOUNTING_COLLECTIONS.map((key) => [key, (data[key] as Array<{ id: string }>).filter((row) => ids[key].has(row.id))])) } as AccountingData;
}
