import type {
  Account,
  AccountAdjustment,
  AccountingData,
  CheckRecord,
  Invoice,
  JournalAction,
  JournalEntry,
  JournalLine,
  JournalSourceType,
  MoneyTransaction,
  Payment,
  Product,
  ReturnDocument,
  StockMovement,
  SystemAccountKey,
} from './types';
import { effectivePaymentAmount, invoiceLineNet, invoiceTotal, resolvedPaymentDirection, uid } from './utils';

export const SYSTEM_ACCOUNTS: Account[] = [
  { id: 'acct_cash', code: '1101', name: 'صندوق', type: 'asset', normalBalance: 'debit', systemKey: 'cash', active: true },
  { id: 'acct_bank', code: '1102', name: 'بانک', type: 'asset', normalBalance: 'debit', systemKey: 'bank', active: true },
  { id: 'acct_ar', code: '1201', name: 'حساب‌های دریافتنی', type: 'asset', normalBalance: 'debit', systemKey: 'accounts-receivable', active: true },
  { id: 'acct_inventory', code: '1301', name: 'موجودی کالا', type: 'asset', normalBalance: 'debit', systemKey: 'inventory', active: true },
  { id: 'acct_ap', code: '2101', name: 'حساب‌های پرداختنی', type: 'liability', normalBalance: 'credit', systemKey: 'accounts-payable', active: true },
  { id: 'acct_opening', code: '3101', name: 'سرمایه / مانده افتتاحیه', type: 'equity', normalBalance: 'credit', systemKey: 'opening-equity', active: true },
  { id: 'acct_sales', code: '4101', name: 'فروش', type: 'revenue', normalBalance: 'credit', systemKey: 'sales-revenue', active: true },
  { id: 'acct_sales_returns', code: '4102', name: 'برگشت از فروش', type: 'revenue', normalBalance: 'debit', systemKey: 'sales-returns', active: true },
  { id: 'acct_other_income', code: '4201', name: 'سایر درآمدها', type: 'revenue', normalBalance: 'credit', systemKey: 'other-income', active: true },
  { id: 'acct_cogs', code: '5101', name: 'بهای تمام‌شده کالای فروش‌رفته', type: 'expense', normalBalance: 'debit', systemKey: 'cogs', active: true },
  { id: 'acct_general_expense', code: '5201', name: 'هزینه‌های عمومی', type: 'expense', normalBalance: 'debit', systemKey: 'general-expense', active: true },
  { id: 'acct_purchase_service', code: '5202', name: 'خرید خدمات / هزینه مستقیم', type: 'expense', normalBalance: 'debit', systemKey: 'purchase-service-expense', active: true },
];

export function normalizeAccounts(accounts?: Account[]) {
  const custom = (accounts || []).filter((account) => !account.systemKey);
  const overrides = new Map((accounts || []).filter((account) => account.systemKey).map((account) => [account.systemKey, account]));
  return [
    ...SYSTEM_ACCOUNTS.map((system) => ({ ...system, ...(overrides.get(system.systemKey!) || {}), id: system.id, systemKey: system.systemKey })),
    ...custom,
  ];
}

export function systemAccountId(accounts: Account[], key: SystemAccountKey) {
  return accounts.find((account) => account.systemKey === key)?.id || SYSTEM_ACCOUNTS.find((account) => account.systemKey === key)!.id;
}

export function journalTotals(entry: Pick<JournalEntry, 'lines'>) {
  return entry.lines.reduce(
    (total, line) => ({ debit: total.debit + Number(line.debit || 0), credit: total.credit + Number(line.credit || 0) }),
    { debit: 0, credit: 0 }
  );
}

export function isBalancedJournal(entry: Pick<JournalEntry, 'lines'>) {
  const total = journalTotals(entry);
  return total.debit > 0 && Math.abs(total.debit - total.credit) < 0.01;
}

function line(accountId: string, debit = 0, credit = 0, memo?: string): JournalLine {
  return { id: uid('jl'), accountId, debit: Number(debit || 0), credit: Number(credit || 0), ...(memo ? { memo } : {}) };
}

function entry(
  date: string,
  description: string,
  sourceType: JournalSourceType,
  sourceId: string,
  sourceReference: string | undefined,
  action: JournalAction,
  lines: JournalLine[],
  reversalOf?: string
): JournalEntry | null {
  const cleaned = lines.filter((item) => Math.abs(item.debit) > 0.0001 || Math.abs(item.credit) > 0.0001);
  const result: JournalEntry = {
    id: uid('je'),
    date,
    description,
    sourceType,
    sourceId,
    sourceReference,
    action,
    ...(reversalOf ? { reversalOf } : {}),
    createdAt: new Date().toISOString(),
    lines: cleaned,
  };
  return isBalancedJournal(result) ? result : null;
}

export function projectPurchaseInvoiceAllocation(invoice: Invoice, products: Product[]) {
  const raw = invoice.items.map((item) => {
    const product = item.productId ? products.find((candidate) => candidate.id === item.productId) : undefined;
    return { amount: invoiceLineNet(item), product: product?.kind === 'product' };
  });
  const subtotal = raw.reduce((sum, item) => sum + item.amount, 0);
  const productRaw = raw.filter((item) => item.product).reduce((sum, item) => sum + item.amount, 0);
  const total = invoiceTotal(invoice);
  if (subtotal <= 0) return { product: 0, service: total };
  const product = total * (productRaw / subtotal);
  return { product, service: total - product };
}

export function projectPurchaseReturnAllocation(document: ReturnDocument, original: Invoice, products: Product[]) {
  const raw = document.items.map((item) => {
    const source = original.items.find((candidate) => candidate.id === item.originalItemId);
    const product = source?.productId ? products.find((candidate) => candidate.id === source.productId) : undefined;
    const sourceQty = Number(source?.qty || 0);
    const amount = source && sourceQty > 0 ? invoiceLineNet(source) / sourceQty * Number(item.qty || 0) : Number(item.qty || 0) * Number(item.unitPrice || 0);
    return { amount, product: product?.kind === 'product' };
  });
  const subtotal = raw.reduce((sum, item) => sum + item.amount, 0);
  const productRaw = raw.filter((item) => item.product).reduce((sum, item) => sum + item.amount, 0);
  const total = Number(document.totalAmount || 0);
  if (subtotal <= 0) return { product: 0, service: total };
  const product = total * (productRaw / subtotal);
  return { product, service: total - product };
}

export function journalForInvoice(
  invoice: Invoice,
  products: Product[],
  movements: StockMovement[],
  accounts: Account[],
  action: 'post' | 'revision-post' = 'post'
) {
  const results: JournalEntry[] = [];
  const total = invoiceTotal(invoice);
  if (invoice.kind === 'sale') {
    const financial = entry(
      invoice.date,
      'ثبت فاکتور فروش ' + invoice.number,
      'invoice',
      invoice.id,
      invoice.number,
      action,
      [
        line(systemAccountId(accounts, 'accounts-receivable'), total, 0, invoice.customerName),
        line(systemAccountId(accounts, 'sales-revenue'), 0, total, invoice.customerName),
      ]
    );
    if (financial) results.push(financial);

    const cogs = movements
      .filter((movement) => movement.sourceType === 'invoice' && movement.sourceId === invoice.id && movement.quantity < 0)
      .reduce((sum, movement) => sum + Math.abs(movement.quantity) * Number(movement.unitCost || 0), 0);
    if (cogs > 0.0001) {
      const costEntry = entry(
        invoice.date,
        'بهای تمام‌شده فاکتور فروش ' + invoice.number,
        'invoice',
        invoice.id,
        invoice.number,
        action,
        [
          line(systemAccountId(accounts, 'cogs'), cogs, 0),
          line(systemAccountId(accounts, 'inventory'), 0, cogs),
        ]
      );
      if (costEntry) results.push(costEntry);
    }
  } else {
    const allocation = projectPurchaseInvoiceAllocation(invoice, products);
    const financial = entry(
      invoice.date,
      'ثبت فاکتور خرید ' + invoice.number,
      'invoice',
      invoice.id,
      invoice.number,
      action,
      [
        line(systemAccountId(accounts, 'inventory'), allocation.product, 0),
        line(systemAccountId(accounts, 'purchase-service-expense'), allocation.service, 0),
        line(systemAccountId(accounts, 'accounts-payable'), 0, total, invoice.customerName),
      ]
    );
    if (financial) results.push(financial);
  }
  return results;
}

export function journalForReturn(
  document: ReturnDocument,
  original: Invoice,
  products: Product[],
  movements: StockMovement[],
  accounts: Account[]
) {
  const results: JournalEntry[] = [];
  const total = Number(document.totalAmount || 0);
  if (document.kind === 'sale-return') {
    const financial = entry(
      document.date,
      'مرجوعی فروش ' + document.number,
      'return',
      document.id,
      document.number,
      'post',
      [
        line(systemAccountId(accounts, 'sales-returns'), total, 0),
        line(systemAccountId(accounts, 'accounts-receivable'), 0, total, document.customerName),
      ]
    );
    if (financial) results.push(financial);

    const restoredCost = movements
      .filter((movement) => movement.sourceType === 'return' && movement.sourceId === document.id && movement.quantity > 0)
      .reduce((sum, movement) => sum + movement.quantity * Number(movement.unitCost || 0), 0);
    if (restoredCost > 0.0001) {
      const costEntry = entry(
        document.date,
        'برگشت بهای تمام‌شده مرجوعی فروش ' + document.number,
        'return',
        document.id,
        document.number,
        'post',
        [
          line(systemAccountId(accounts, 'inventory'), restoredCost, 0),
          line(systemAccountId(accounts, 'cogs'), 0, restoredCost),
        ]
      );
      if (costEntry) results.push(costEntry);
    }
  } else {
    const allocation = projectPurchaseReturnAllocation(document, original, products);
    const financial = entry(
      document.date,
      'مرجوعی خرید ' + document.number,
      'return',
      document.id,
      document.number,
      'post',
      [
        line(systemAccountId(accounts, 'accounts-payable'), total, 0, document.customerName),
        line(systemAccountId(accounts, 'inventory'), 0, allocation.product),
        line(systemAccountId(accounts, 'purchase-service-expense'), 0, allocation.service),
      ]
    );
    if (financial) results.push(financial);
  }
  return results;
}

export function journalForPayment(payment: Payment, accounts: Account[]) {
  const amount = Number(payment.amount || 0);
  const settlementKey: SystemAccountKey = payment.method === 'cash' ? 'cash' : 'bank';
  const settlement = systemAccountId(accounts, settlementKey);
  const direction = payment.direction;
  const result = entry(
    payment.date,
    direction === 'receipt' ? 'دریافت از طرف حساب' : 'پرداخت به طرف حساب',
    'payment',
    payment.id,
    payment.reference,
    payment.method === 'check' ? 'status-post' : 'post',
    direction === 'receipt'
      ? [
          line(settlement, amount, 0),
          line(systemAccountId(accounts, 'accounts-receivable'), 0, amount),
        ]
      : [
          line(systemAccountId(accounts, 'accounts-payable'), amount, 0),
          line(settlement, 0, amount),
        ]
  );
  return result ? [result] : [];
}

export function journalForMoneyTransaction(transaction: MoneyTransaction, accounts: Account[]) {
  const amount = Number(transaction.amount || 0);
  const result = entry(
    transaction.date,
    transaction.description,
    'money-transaction',
    transaction.id,
    transaction.reference,
    'post',
    transaction.kind === 'income'
      ? [line(transaction.settlementAccountId, amount, 0), line(transaction.categoryAccountId, 0, amount)]
      : [line(transaction.categoryAccountId, amount, 0), line(transaction.settlementAccountId, 0, amount)]
  );
  return result ? [result] : [];
}

export function journalForCustomerAdjustment(adjustment: AccountAdjustment, accounts: Account[]) {
  const amount = Math.abs(Number(adjustment.amount || 0));
  const result = entry(
    adjustment.date,
    adjustment.note,
    'system',
    adjustment.id,
    adjustment.id,
    'post',
    adjustment.amount >= 0
      ? [
          line(systemAccountId(accounts, 'accounts-receivable'), amount, 0),
          line(systemAccountId(accounts, 'opening-equity'), 0, amount),
        ]
      : [
          line(systemAccountId(accounts, 'opening-equity'), amount, 0),
          line(systemAccountId(accounts, 'accounts-payable'), 0, amount),
        ]
  );
  return result ? [result] : [];
}

export function journalForStockAdjustment(movement: StockMovement, accounts: Account[]) {
  const amount = Math.abs(Number(movement.quantity || 0) * Number(movement.unitCost || 0));
  if (amount <= 0.0001) return [];
  const result = entry(
    movement.date,
    movement.note || 'اصلاح موجودی',
    'system',
    movement.sourceId,
    movement.sourceReference,
    'post',
    movement.quantity > 0
      ? [
          line(systemAccountId(accounts, 'inventory'), amount, 0),
          line(systemAccountId(accounts, 'opening-equity'), 0, amount),
        ]
      : [
          line(systemAccountId(accounts, 'general-expense'), amount, 0),
          line(systemAccountId(accounts, 'inventory'), 0, amount),
        ]
  );
  return result ? [result] : [];
}

export function reverseActiveSourceEntries(
  journalEntries: JournalEntry[],
  sourceType: JournalSourceType,
  sourceId: string,
  date: string,
  description: string,
  action: 'revision-reversal' | 'void-reversal' | 'status-reversal'
) {
  const reversed = new Set(journalEntries.map((candidate) => candidate.reversalOf).filter(Boolean));
  return journalEntries
    .filter((candidate) => candidate.sourceType === sourceType && candidate.sourceId === sourceId)
    .filter((candidate) => candidate.action === 'post' || candidate.action === 'revision-post' || candidate.action === 'status-post')
    .filter((candidate) => !reversed.has(candidate.id))
    .map((candidate) =>
      entry(
        date,
        description,
        sourceType,
        sourceId,
        candidate.sourceReference,
        action,
        candidate.lines.map((item) => line(item.accountId, item.credit, item.debit, item.memo)),
        candidate.id
      )
    )
    .filter((candidate): candidate is JournalEntry => !!candidate);
}

export function accountBalance(account: Account, entries: JournalEntry[]) {
  const totals = entries.flatMap((item) => item.lines).filter((item) => item.accountId === account.id).reduce(
    (sum, item) => ({ debit: sum.debit + Number(item.debit || 0), credit: sum.credit + Number(item.credit || 0) }),
    { debit: 0, credit: 0 }
  );
  const net = totals.debit - totals.credit;
  return account.normalBalance === 'debit' ? net : -net;
}

export function buildOpeningJournal(data: AccountingData, accounts: Account[]) {
  const entries: JournalEntry[] = [];

  const openingInventory = (data.stockMovements || [])
    .filter((movement) => movement.type === 'opening')
    .reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unitCost || 0), 0);
  if (openingInventory > 0.0001) {
    const opening = entry(
      'ابتدای دوره',
      'ثبت افتتاحیه موجودی',
      'system',
      'opening-inventory',
      'افتتاحیه',
      'post',
      [
        line(systemAccountId(accounts, 'inventory'), openingInventory, 0),
        line(systemAccountId(accounts, 'opening-equity'), 0, openingInventory),
      ]
    );
    if (opening) entries.push(opening);
  }

  for (const customer of data.customers || []) {
    const amount = Number(customer.openingBalance || 0);
    if (Math.abs(amount) <= 0.0001) continue;
    const opening = entry(
      'ابتدای دوره',
      'مانده افتتاحیه ' + customer.name,
      'system',
      'opening-customer-' + customer.id,
      customer.code,
      'post',
      amount > 0
        ? [
            line(systemAccountId(accounts, 'accounts-receivable'), amount, 0),
            line(systemAccountId(accounts, 'opening-equity'), 0, amount),
          ]
        : [
            line(systemAccountId(accounts, 'opening-equity'), Math.abs(amount), 0),
            line(systemAccountId(accounts, 'accounts-payable'), 0, Math.abs(amount)),
          ]
    );
    if (opening) entries.push(opening);
  }

  for (const adjustment of data.adjustments || []) entries.push(...journalForCustomerAdjustment(adjustment, accounts));

  for (const invoice of (data.invoices || []).filter((item) => item.status !== 'draft' && item.status !== 'void')) {
    const movements = (data.stockMovements || []).filter((movement) => movement.sourceType === 'invoice' && movement.sourceId === invoice.id);
    const cogsNet = -movements.reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unitCost || 0), 0);
    const synthetic = cogsNet > 0
      ? [{ ...movements[0], id: 'synthetic', sourceType: 'invoice' as const, sourceId: invoice.id, quantity: -1, unitCost: cogsNet } as StockMovement]
      : [];
    entries.push(...journalForInvoice(invoice, data.products || [], synthetic, accounts, 'post'));
  }

  for (const document of (data.returns || []).filter((item) => item.status === 'final')) {
    const original = data.invoices.find((invoice) => invoice.id === document.originalInvoiceId);
    if (!original) continue;
    const movements = (data.stockMovements || []).filter((movement) => movement.sourceType === 'return' && movement.sourceId === document.id);
    const restoredCost = movements.reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unitCost || 0), 0);
    const synthetic = restoredCost > 0
      ? [{ ...movements[0], id: 'synthetic', sourceType: 'return' as const, sourceId: document.id, quantity: 1, unitCost: restoredCost } as StockMovement]
      : [];
    entries.push(...journalForReturn(document, original, data.products || [], synthetic, accounts));
  }

  for (const payment of data.payments || []) {
    const invoice = payment.invoiceId ? data.invoices.find((item) => item.id === payment.invoiceId) : undefined;
    const normalized = { ...payment, direction: resolvedPaymentDirection(payment, invoice) };
    if (effectivePaymentAmount(normalized, data.checks || []) <= 0) continue;
    entries.push(...journalForPayment(normalized, accounts));
  }

  for (const movement of (data.stockMovements || []).filter((item) => item.sourceType === 'adjustment')) {
    entries.push(...journalForStockAdjustment(movement, accounts));
  }

  for (const transaction of (data.moneyTransactions || []).filter((item) => item.status === 'final')) {
    entries.push(...journalForMoneyTransaction(transaction, accounts));
  }

  return entries;
}

export function effectiveCheckPayment(payment: Payment, checks: CheckRecord[]) {
  return effectivePaymentAmount(payment, checks) > 0;
}
