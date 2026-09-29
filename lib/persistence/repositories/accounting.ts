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

  await sqliteTransaction(statements);
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

  return {
    customers,
    products,
    invoices,
    returns,
    payments,
    checks,
    adjustments,
    stockMovements,
    accounts,
    journalEntries,
    moneyTransactions,
    settings,
  };
}
