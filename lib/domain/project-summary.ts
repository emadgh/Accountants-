import { projectPurchaseInvoiceAllocation, projectPurchaseReturnAllocation } from '../accounting';
import type { AccountingData } from '../types';
import { invoiceTotal, settledForInvoice } from '../utils';

export function projectFinancialSummary(store: Pick<AccountingData, 'invoices' | 'returns' | 'products' | 'stockMovements' | 'moneyTransactions' | 'payments' | 'checks'>, projectId?: string) {
  const projectInvoices = projectId ? store.invoices.filter((invoice) => invoice.projectId === projectId && invoice.kind === 'sale' && invoice.status !== 'draft' && invoice.status !== 'void') : [];
  const linkedInvoiceIds = new Set(projectInvoices.map((invoice) => invoice.id));
  const projectReturns = projectId ? store.returns.filter((document) => document.status === 'final' && linkedInvoiceIds.has(document.originalInvoiceId)) : [];
  const grossSalesExcludingTax = projectInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice) - Number(invoice.tax || 0), 0);
  const netReturnedSales = projectReturns.reduce((sum, document) => {
    const invoice = projectInvoices.find((item) => item.id === document.originalInvoiceId);
    if (!invoice) return sum;
    const total = invoiceTotal(invoice);
    const returnedTax = total > 0 ? Number(document.totalAmount || 0) * Number(invoice.tax || 0) / total : 0;
    return sum + Number(document.totalAmount || 0) - returnedTax;
  }, 0);
  const income = Math.max(0, grossSalesExcludingTax - netReturnedSales);
  const projectReturnIds = new Set(projectReturns.map((document) => document.id));
  const saleCost = store.stockMovements.filter((movement) => movement.sourceType === 'invoice' && linkedInvoiceIds.has(movement.sourceId) && movement.sourceKind === 'sale')
    .reduce((sum, movement) => sum - movement.quantity * movement.unitCost, 0);
  const returnedCost = store.stockMovements.filter((movement) => movement.sourceType === 'return' && projectReturnIds.has(movement.sourceId) && movement.sourceKind === 'sale-return')
    .reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);
  const costOfGoodsSold = Math.max(0, saleCost - returnedCost);
  const expenses = projectId ? store.moneyTransactions.filter((transaction) => transaction.projectId === projectId && transaction.status === 'final' && transaction.kind === 'expense') : [];
  const purchaseInvoices = projectId ? store.invoices.filter((invoice) => invoice.projectId === projectId && invoice.kind === 'purchase' && invoice.status !== 'draft' && invoice.status !== 'void') : [];
  const purchaseInvoiceIds = new Set(purchaseInvoices.map((invoice) => invoice.id));
  const purchaseReturns = projectId ? store.returns.filter((document) => document.kind === 'purchase-return' && document.status === 'final' && purchaseInvoiceIds.has(document.originalInvoiceId)) : [];
  const purchaseExpense = purchaseInvoices.reduce((sum, invoice) => sum + projectPurchaseInvoiceAllocation(invoice, store.products).service, 0);
  const returnedPurchaseExpense = purchaseReturns.reduce((sum, document) => {
    const invoice = purchaseInvoices.find((item) => item.id === document.originalInvoiceId);
    return invoice ? sum + projectPurchaseReturnAllocation(document, invoice, store.products).service : sum;
  }, 0);
  const purchaseInventory = purchaseInvoices.reduce((sum, invoice) => sum + projectPurchaseInvoiceAllocation(invoice, store.products).product, 0);
  const returnedPurchaseInventory = purchaseReturns.reduce((sum, document) => {
    const invoice = purchaseInvoices.find((item) => item.id === document.originalInvoiceId);
    return invoice ? sum + projectPurchaseReturnAllocation(document, invoice, store.products).product : sum;
  }, 0);
  const cost = expenses.reduce((sum, transaction) => sum + transaction.amount, 0) + Math.max(0, purchaseExpense - returnedPurchaseExpense);
  const inventoryPurchases = Math.max(0, purchaseInventory - returnedPurchaseInventory);
  const estimatedProfit = income - cost - costOfGoodsSold;
  const received = projectInvoices.reduce((sum, invoice) => sum + settledForInvoice(invoice, store.payments, store.checks), 0);
  return { projectInvoices, projectReturns, income, expenses, purchaseInvoices, purchaseReturns, cost, costOfGoodsSold, inventoryPurchases, estimatedProfit, received };
}
