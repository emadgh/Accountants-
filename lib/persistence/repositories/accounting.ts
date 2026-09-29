import type {
  AccountingData,
  BusinessSettings,
  DocumentSequenceKey,
  Invoice,
  JournalEntry,
  ReturnDocument,
} from '@/lib/types';
import { sqliteQuery, sqliteTransaction, type SqlStatement } from '../database';

type PayloadRow = { payload: string };
type CountRow = { count: number };
type MetaRow = { value: string };

const ACCOUNTING_ORDER_META_KEY = 'accounting-array-order';

function json(value: unknown) {
  return JSON.stringify(value);
}

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function add(
  statements: SqlStatement[],
  sql: string,
  bind: Array<string | number | null>
) {
  statements.push({ sql, bind });
}

const DELETE_ACCOUNTING_SQL = [
  'DELETE FROM return_items',
  'DELETE FROM returns',
  'DELETE FROM journal_lines',
  'DELETE FROM journal_entries',
  'DELETE FROM stock_movements',
  'DELETE FROM payments',
  'DELETE FROM checks',
  'DELETE FROM account_adjustments',
  'DELETE FROM money_transactions',
  'DELETE FROM invoice_items',
  'DELETE FROM invoices',
  'DELETE FROM document_sequences',
  'DELETE FROM accounts',
  'DELETE FROM products',
  'DELETE FROM customers',
  'DELETE FROM business_profiles',
  'DELETE FROM settings',
  "DELETE FROM app_meta WHERE key = 'accounting-array-order'",
];

export async function hasAccountingData() {
  const rows = await sqliteQuery<CountRow>('SELECT COUNT(*) AS count FROM settings');
  return Number(rows[0]?.count || 0) > 0;
}

export async function clearAccountingData() {
  await sqliteTransaction(DELETE_ACCOUNTING_SQL.map((sql) => ({ sql })));
}

export async function replaceAccountingData(data: AccountingData) {
  const statements: SqlStatement[] = DELETE_ACCOUNTING_SQL.map((sql) => ({ sql }));

  add(statements, 'INSERT INTO settings(id, payload) VALUES (1, ?)', [json(data.settings)]);

  for (const profile of data.settings.businessProfiles || []) {
    add(
      statements,
      'INSERT INTO business_profiles(id, label, payload) VALUES (?, ?, ?)',
      [profile.id, profile.label, json(profile)]
    );
  }

  for (const customer of data.customers) {
    add(
      statements,
      'INSERT INTO customers(id, code, name, kind, payload) VALUES (?, ?, ?, ?, ?)',
      [customer.id, customer.code, customer.name, customer.kind, json(customer)]
    );
  }

  for (const product of data.products) {
    add(
      statements,
      'INSERT INTO products(id, code, name, kind, payload) VALUES (?, ?, ?, ?, ?)',
      [product.id, product.code, product.name, product.kind, json(product)]
    );
  }

  for (const account of data.accounts) {
    add(
      statements,
      'INSERT INTO accounts(id, code, parent_id, payload) VALUES (?, ?, ?, ?)',
      [account.id, account.code, account.parentId || null, json(account)]
    );
  }

  for (const invoice of data.invoices) {
    add(
      statements,
      'INSERT INTO invoices(id, number, kind, status, date, customer_id, business_profile_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        invoice.id,
        invoice.number,
        invoice.kind,
        invoice.status,
        invoice.date,
        invoice.customerId,
        invoice.businessProfileId,
        json({ ...invoice, items: [] }),
      ]
    );
    invoice.items.forEach((item, position) => {
      add(
        statements,
        'INSERT INTO invoice_items(id, invoice_id, product_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [item.id, invoice.id, item.productId || null, position, json(item)]
      );
    });
  }

  for (const document of data.returns) {
    add(
      statements,
      'INSERT INTO returns(id, number, kind, status, date, original_invoice_id, customer_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        document.id,
        document.number,
        document.kind,
        document.status,
        document.date,
        document.originalInvoiceId,
        document.customerId,
        json({ ...document, items: [] }),
      ]
    );
    document.items.forEach((item, position) => {
      add(
        statements,
        'INSERT INTO return_items(id, return_id, product_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [item.id, document.id, item.productId || null, position, json(item)]
      );
    });
  }

  for (const check of data.checks) {
    add(
      statements,
      'INSERT INTO checks(id, document_number, customer_id, due_date, status, payload) VALUES (?, ?, ?, ?, ?, ?)',
      [check.id, check.documentNumber, check.customerId, check.dueDate, check.status, json(check)]
    );
  }

  for (const payment of data.payments) {
    add(
      statements,
      'INSERT INTO payments(id, document_number, invoice_id, customer_id, check_id, date, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        payment.id,
        payment.documentNumber,
        payment.invoiceId || null,
        payment.customerId,
        payment.checkId || null,
        payment.date,
        json(payment),
      ]
    );
  }

  for (const adjustment of data.adjustments) {
    add(
      statements,
      'INSERT INTO account_adjustments(id, customer_id, date, payload) VALUES (?, ?, ?, ?)',
      [adjustment.id, adjustment.customerId, adjustment.date, json(adjustment)]
    );
  }

  for (const movement of data.stockMovements) {
    add(
      statements,
      'INSERT INTO stock_movements(id, product_id, date, source_type, source_id, payload) VALUES (?, ?, ?, ?, ?, ?)',
      [movement.id, movement.productId, movement.date, movement.sourceType, movement.sourceId, json(movement)]
    );
  }

  for (const entry of data.journalEntries) {
    add(
      statements,
      'INSERT INTO journal_entries(id, date, source_type, source_id, source_reference, action, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        entry.id,
        entry.date,
        entry.sourceType,
        entry.sourceId,
        entry.sourceReference || null,
        entry.action,
        json({ ...entry, lines: [] }),
      ]
    );
    entry.lines.forEach((line, position) => {
      add(
        statements,
        'INSERT INTO journal_lines(id, journal_entry_id, account_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [line.id, entry.id, line.accountId, position, json(line)]
      );
    });
  }

  for (const transaction of data.moneyTransactions) {
    add(
      statements,
      'INSERT INTO money_transactions(id, date, status, settlement_account_id, category_account_id, payload) VALUES (?, ?, ?, ?, ?, ?)',
      [
        transaction.id,
        transaction.date,
        transaction.status,
        transaction.settlementAccountId,
        transaction.categoryAccountId,
        json(transaction),
      ]
    );
  }

  const sequenceEntries = Object.entries(data.settings.numbering) as Array<
    [DocumentSequenceKey, BusinessSettings['numbering'][DocumentSequenceKey]]
  >;
  for (const [key, sequence] of sequenceEntries) {
    add(
      statements,
      'INSERT INTO document_sequences(key, prefix, next_value, padding) VALUES (?, ?, ?, ?)',
      [key, sequence.prefix, Number(sequence.next), Number(sequence.padding)]
    );
  }

  add(
    statements,
    "INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [ACCOUNTING_ORDER_META_KEY, json(accountingArrayOrder(data))]
  );

  await sqliteTransaction(statements);
}

type OrderedCollectionKey =
  | 'businessProfiles'
  | 'customers'
  | 'products'
  | 'invoices'
  | 'returns'
  | 'payments'
  | 'checks'
  | 'adjustments'
  | 'stockMovements'
  | 'accounts'
  | 'journalEntries'
  | 'moneyTransactions';

type AccountingArrayOrder = Partial<Record<OrderedCollectionKey, string[]>>;

function accountingArrayOrder(data: AccountingData): AccountingArrayOrder {
  return {
    businessProfiles: data.settings.businessProfiles.map((item) => item.id),
    customers: data.customers.map((item) => item.id),
    products: data.products.map((item) => item.id),
    invoices: data.invoices.map((item) => item.id),
    returns: data.returns.map((item) => item.id),
    payments: data.payments.map((item) => item.id),
    checks: data.checks.map((item) => item.id),
    adjustments: data.adjustments.map((item) => item.id),
    stockMovements: data.stockMovements.map((item) => item.id),
    accounts: data.accounts.map((item) => item.id),
    journalEntries: data.journalEntries.map((item) => item.id),
    moneyTransactions: data.moneyTransactions.map((item) => item.id),
  };
}

function diffById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  return {
    removed: previous.filter((item) => !nextIds.has(item.id)),
    changed: next.filter((item) => {
      const before = previousById.get(item.id);
      return !before || json(before) !== json(item);
    }),
  };
}

function upsertOrderMeta(statements: SqlStatement[], data: AccountingData) {
  add(
    statements,
    "INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [ACCOUNTING_ORDER_META_KEY, json(accountingArrayOrder(data))]
  );
}

export async function syncAccountingData(previous: AccountingData, next: AccountingData) {
  const statements: SqlStatement[] = [];

  const profiles = diffById(previous.settings.businessProfiles, next.settings.businessProfiles);
  const customers = diffById(previous.customers, next.customers);
  const products = diffById(previous.products, next.products);
  const invoices = diffById(previous.invoices, next.invoices);
  const returns = diffById(previous.returns, next.returns);
  const payments = diffById(previous.payments, next.payments);
  const checks = diffById(previous.checks, next.checks);
  const adjustments = diffById(previous.adjustments, next.adjustments);
  const movements = diffById(previous.stockMovements, next.stockMovements);
  const accounts = diffById(previous.accounts, next.accounts);
  const journals = diffById(previous.journalEntries, next.journalEntries);
  const money = diffById(previous.moneyTransactions, next.moneyTransactions);

  // Deletions run first. Foreign-key checks are deferred by the database transaction,
  // so a multi-entity accounting operation is validated against its final state.
  for (const item of returns.removed) add(statements, 'DELETE FROM returns WHERE id = ?', [item.id]);
  for (const item of payments.removed) add(statements, 'DELETE FROM payments WHERE id = ?', [item.id]);
  for (const item of checks.removed) add(statements, 'DELETE FROM checks WHERE id = ?', [item.id]);
  for (const item of adjustments.removed) add(statements, 'DELETE FROM account_adjustments WHERE id = ?', [item.id]);
  for (const item of money.removed) add(statements, 'DELETE FROM money_transactions WHERE id = ?', [item.id]);
  for (const item of journals.removed) add(statements, 'DELETE FROM journal_entries WHERE id = ?', [item.id]);
  for (const item of movements.removed) add(statements, 'DELETE FROM stock_movements WHERE id = ?', [item.id]);
  for (const item of invoices.removed) add(statements, 'DELETE FROM invoices WHERE id = ?', [item.id]);
  for (const item of accounts.removed) add(statements, 'DELETE FROM accounts WHERE id = ?', [item.id]);
  for (const item of products.removed) add(statements, 'DELETE FROM products WHERE id = ?', [item.id]);
  for (const item of customers.removed) add(statements, 'DELETE FROM customers WHERE id = ?', [item.id]);
  for (const item of profiles.removed) add(statements, 'DELETE FROM business_profiles WHERE id = ?', [item.id]);

  if (json(previous.settings) !== json(next.settings)) {
    add(
      statements,
      'INSERT INTO settings(id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
      [json(next.settings)]
    );

    const previousKeys = new Set(Object.keys(previous.settings.numbering));
    for (const key of previousKeys) {
      if (!(key in next.settings.numbering)) {
        add(statements, 'DELETE FROM document_sequences WHERE key = ?', [key]);
      }
    }
    const sequenceEntries = Object.entries(next.settings.numbering) as Array<
      [DocumentSequenceKey, BusinessSettings['numbering'][DocumentSequenceKey]]
    >;
    for (const [key, sequence] of sequenceEntries) {
      add(
        statements,
        'INSERT INTO document_sequences(key, prefix, next_value, padding) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET prefix = excluded.prefix, next_value = excluded.next_value, padding = excluded.padding',
        [key, sequence.prefix, Number(sequence.next), Number(sequence.padding)]
      );
    }
  }

  for (const profile of profiles.changed) {
    add(
      statements,
      'INSERT INTO business_profiles(id, label, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET label = excluded.label, payload = excluded.payload',
      [profile.id, profile.label, json(profile)]
    );
  }

  for (const customer of customers.changed) {
    add(
      statements,
      'INSERT INTO customers(id, code, name, kind, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, kind = excluded.kind, payload = excluded.payload',
      [customer.id, customer.code, customer.name, customer.kind, json(customer)]
    );
  }

  for (const product of products.changed) {
    add(
      statements,
      'INSERT INTO products(id, code, name, kind, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, kind = excluded.kind, payload = excluded.payload',
      [product.id, product.code, product.name, product.kind, json(product)]
    );
  }

  for (const account of accounts.changed) {
    add(
      statements,
      'INSERT INTO accounts(id, code, parent_id, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code = excluded.code, parent_id = excluded.parent_id, payload = excluded.payload',
      [account.id, account.code, account.parentId || null, json(account)]
    );
  }

  for (const invoice of invoices.changed) {
    add(statements, 'DELETE FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
    add(
      statements,
      'INSERT INTO invoices(id, number, kind, status, date, customer_id, business_profile_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET number = excluded.number, kind = excluded.kind, status = excluded.status, date = excluded.date, customer_id = excluded.customer_id, business_profile_id = excluded.business_profile_id, payload = excluded.payload',
      [
        invoice.id,
        invoice.number,
        invoice.kind,
        invoice.status,
        invoice.date,
        invoice.customerId,
        invoice.businessProfileId,
        json({ ...invoice, items: [] }),
      ]
    );
    invoice.items.forEach((item, position) => {
      add(
        statements,
        'INSERT INTO invoice_items(id, invoice_id, product_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [item.id, invoice.id, item.productId || null, position, json(item)]
      );
    });
  }

  for (const document of returns.changed) {
    add(statements, 'DELETE FROM return_items WHERE return_id = ?', [document.id]);
    add(
      statements,
      'INSERT INTO returns(id, number, kind, status, date, original_invoice_id, customer_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET number = excluded.number, kind = excluded.kind, status = excluded.status, date = excluded.date, original_invoice_id = excluded.original_invoice_id, customer_id = excluded.customer_id, payload = excluded.payload',
      [
        document.id,
        document.number,
        document.kind,
        document.status,
        document.date,
        document.originalInvoiceId,
        document.customerId,
        json({ ...document, items: [] }),
      ]
    );
    document.items.forEach((item, position) => {
      add(
        statements,
        'INSERT INTO return_items(id, return_id, product_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [item.id, document.id, item.productId || null, position, json(item)]
      );
    });
  }

  for (const check of checks.changed) {
    add(
      statements,
      'INSERT INTO checks(id, document_number, customer_id, due_date, status, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET document_number = excluded.document_number, customer_id = excluded.customer_id, due_date = excluded.due_date, status = excluded.status, payload = excluded.payload',
      [check.id, check.documentNumber, check.customerId, check.dueDate, check.status, json(check)]
    );
  }

  for (const payment of payments.changed) {
    add(
      statements,
      'INSERT INTO payments(id, document_number, invoice_id, customer_id, check_id, date, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET document_number = excluded.document_number, invoice_id = excluded.invoice_id, customer_id = excluded.customer_id, check_id = excluded.check_id, date = excluded.date, payload = excluded.payload',
      [
        payment.id,
        payment.documentNumber,
        payment.invoiceId || null,
        payment.customerId,
        payment.checkId || null,
        payment.date,
        json(payment),
      ]
    );
  }

  for (const adjustment of adjustments.changed) {
    add(
      statements,
      'INSERT INTO account_adjustments(id, customer_id, date, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET customer_id = excluded.customer_id, date = excluded.date, payload = excluded.payload',
      [adjustment.id, adjustment.customerId, adjustment.date, json(adjustment)]
    );
  }

  for (const movement of movements.changed) {
    add(
      statements,
      'INSERT INTO stock_movements(id, product_id, date, source_type, source_id, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, date = excluded.date, source_type = excluded.source_type, source_id = excluded.source_id, payload = excluded.payload',
      [movement.id, movement.productId, movement.date, movement.sourceType, movement.sourceId, json(movement)]
    );
  }

  for (const entry of journals.changed) {
    add(statements, 'DELETE FROM journal_lines WHERE journal_entry_id = ?', [entry.id]);
    add(
      statements,
      'INSERT INTO journal_entries(id, date, source_type, source_id, source_reference, action, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, source_type = excluded.source_type, source_id = excluded.source_id, source_reference = excluded.source_reference, action = excluded.action, payload = excluded.payload',
      [
        entry.id,
        entry.date,
        entry.sourceType,
        entry.sourceId,
        entry.sourceReference || null,
        entry.action,
        json({ ...entry, lines: [] }),
      ]
    );
    entry.lines.forEach((line, position) => {
      add(
        statements,
        'INSERT INTO journal_lines(id, journal_entry_id, account_id, position, payload) VALUES (?, ?, ?, ?, ?)',
        [line.id, entry.id, line.accountId, position, json(line)]
      );
    });
  }

  for (const transaction of money.changed) {
    add(
      statements,
      'INSERT INTO money_transactions(id, date, status, settlement_account_id, category_account_id, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, status = excluded.status, settlement_account_id = excluded.settlement_account_id, category_account_id = excluded.category_account_id, payload = excluded.payload',
      [
        transaction.id,
        transaction.date,
        transaction.status,
        transaction.settlementAccountId,
        transaction.categoryAccountId,
        json(transaction),
      ]
    );
  }

  upsertOrderMeta(statements, next);

  if (statements.length) await sqliteTransaction(statements);
}

async function payloads<T>(sql: string) {
  const rows = await sqliteQuery<PayloadRow>(sql);
  return rows.map((row) => parse<T>(row.payload));
}

export async function loadAccountingData(): Promise<AccountingData | null> {
  if (!(await hasAccountingData())) return null;

  const [
    settingsRows,
    profiles,
    customers,
    products,
    invoiceRows,
    invoiceItemRows,
    returnRows,
    returnItemRows,
    payments,
    checks,
    adjustments,
    stockMovements,
    accounts,
    journalRows,
    journalLineRows,
    moneyTransactions,
    sequences,
    orderRows,
  ] = await Promise.all([
    sqliteQuery<PayloadRow>('SELECT payload FROM settings WHERE id = 1'),
    payloads<BusinessSettings['businessProfiles'][number]>('SELECT payload FROM business_profiles ORDER BY rowid'),
    payloads<AccountingData['customers'][number]>('SELECT payload FROM customers ORDER BY rowid'),
    payloads<AccountingData['products'][number]>('SELECT payload FROM products ORDER BY rowid'),
    sqliteQuery<{ id: string; payload: string }>('SELECT id, payload FROM invoices ORDER BY rowid'),
    sqliteQuery<{ invoice_id: string; payload: string }>('SELECT invoice_id, payload FROM invoice_items ORDER BY invoice_id, position'),
    sqliteQuery<{ id: string; payload: string }>('SELECT id, payload FROM returns ORDER BY rowid'),
    sqliteQuery<{ return_id: string; payload: string }>('SELECT return_id, payload FROM return_items ORDER BY return_id, position'),
    payloads<AccountingData['payments'][number]>('SELECT payload FROM payments ORDER BY rowid'),
    payloads<AccountingData['checks'][number]>('SELECT payload FROM checks ORDER BY rowid'),
    payloads<AccountingData['adjustments'][number]>('SELECT payload FROM account_adjustments ORDER BY rowid'),
    payloads<AccountingData['stockMovements'][number]>('SELECT payload FROM stock_movements ORDER BY rowid'),
    payloads<AccountingData['accounts'][number]>('SELECT payload FROM accounts ORDER BY rowid'),
    sqliteQuery<{ id: string; payload: string }>('SELECT id, payload FROM journal_entries ORDER BY rowid'),
    sqliteQuery<{ journal_entry_id: string; payload: string }>('SELECT journal_entry_id, payload FROM journal_lines ORDER BY journal_entry_id, position'),
    payloads<AccountingData['moneyTransactions'][number]>('SELECT payload FROM money_transactions ORDER BY rowid'),
    sqliteQuery<{ key: DocumentSequenceKey; prefix: string; next_value: number; padding: number }>(
      'SELECT key, prefix, next_value, padding FROM document_sequences'
    ),
    sqliteQuery<MetaRow>('SELECT value FROM app_meta WHERE key = ? LIMIT 1', [ACCOUNTING_ORDER_META_KEY]),
  ]);

  const invoiceItems = new Map<string, Invoice['items']>();
  for (const row of invoiceItemRows) {
    const items = invoiceItems.get(row.invoice_id) || [];
    items.push(parse<Invoice['items'][number]>(row.payload));
    invoiceItems.set(row.invoice_id, items);
  }
  const invoices = invoiceRows.map((row) => ({
    ...parse<Invoice>(row.payload),
    items: invoiceItems.get(row.id) || [],
  }));

  const returnItems = new Map<string, ReturnDocument['items']>();
  for (const row of returnItemRows) {
    const items = returnItems.get(row.return_id) || [];
    items.push(parse<ReturnDocument['items'][number]>(row.payload));
    returnItems.set(row.return_id, items);
  }
  const returns = returnRows.map((row) => ({
    ...parse<ReturnDocument>(row.payload),
    items: returnItems.get(row.id) || [],
  }));

  const journalLines = new Map<string, JournalEntry['lines']>();
  for (const row of journalLineRows) {
    const lines = journalLines.get(row.journal_entry_id) || [];
    lines.push(parse<JournalEntry['lines'][number]>(row.payload));
    journalLines.set(row.journal_entry_id, lines);
  }
  const journalEntries = journalRows.map((row) => ({
    ...parse<JournalEntry>(row.payload),
    lines: journalLines.get(row.id) || [],
  }));

  const settings = parse<BusinessSettings>(settingsRows[0].payload);
  settings.businessProfiles = profiles;
  settings.numbering = {
    ...settings.numbering,
    ...Object.fromEntries(
      sequences.map((sequence) => [
        sequence.key,
        {
          prefix: sequence.prefix,
          next: Number(sequence.next_value),
          padding: Number(sequence.padding),
        },
      ])
    ),
  };

  let order: AccountingArrayOrder = {};
  try {
    order = orderRows[0]?.value ? parse<AccountingArrayOrder>(orderRows[0].value) : {};
  } catch {
    order = {};
  }

  const sortByOrder = <T extends { id: string }>(items: T[], ids?: string[]) => {
    if (!ids?.length) return items;
    const rank = new Map(ids.map((id, index) => [id, index]));
    return [...items].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  };

  settings.businessProfiles = sortByOrder(settings.businessProfiles, order.businessProfiles);

  return {
    customers: sortByOrder(customers, order.customers),
    products: sortByOrder(products, order.products),
    invoices: sortByOrder(invoices, order.invoices),
    returns: sortByOrder(returns, order.returns),
    payments: sortByOrder(payments, order.payments),
    checks: sortByOrder(checks, order.checks),
    adjustments: sortByOrder(adjustments, order.adjustments),
    stockMovements: sortByOrder(stockMovements, order.stockMovements),
    accounts: sortByOrder(accounts, order.accounts),
    journalEntries: sortByOrder(journalEntries, order.journalEntries),
    moneyTransactions: sortByOrder(moneyTransactions, order.moneyTransactions),
    settings,
  };
}
