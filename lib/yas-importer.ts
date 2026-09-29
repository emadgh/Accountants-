import type {
  AccountingData,
  BusinessProfile,
  Customer,
  Invoice,
  InvoiceItem,
  MoneyTransaction,
  Payment,
  Product,
  StockMovement,
} from './types';
import {
  inspectExternalSqlite,
  type ExternalSqliteSnapshot,
  type ExternalSqliteTable,
  type ExternalSqliteValue,
} from './persistence/database';
import { seedData } from './data';
import { SYSTEM_ACCOUNTS } from './accounting';
import { customerNetBalance, invoiceTotal } from './utils';
import { normalizeStoredDate } from './standards';
import { normalizeAccountingData } from './store';

type Row = Record<string, ExternalSqliteValue>;

export type YasMigrationSeverity = 'info' | 'warning' | 'conflict';

export interface YasMigrationMessage {
  severity: YasMigrationSeverity;
  code: string;
  message: string;
  entity?: string;
}

export interface YasReconciliationRow {
  kind:
    | 'customer-count'
    | 'product-count'
    | 'invoice-count'
    | 'payment-count'
    | 'customer-balance'
    | 'product-stock'
    | 'sales-total'
    | 'payment-total';
  key: string;
  label: string;
  source: number;
  imported: number;
  difference: number;
  status: 'ok' | 'mismatch';
}

export interface YasMigrationReport {
  fingerprint: string;
  analyzedAt: string;
  source: {
    quickCheck: string;
    walHeader: boolean;
    tables: Array<{ name: string; rows: number; columns: string[] }>;
  };
  mapping: {
    customers?: string;
    products?: string;
    invoiceHeaders: string[];
    invoiceItems: string[];
    payments: string[];
    income?: string;
    financialAccounts: string[];
    signature?: string;
  };
  counts: {
    customers: number;
    archivedCustomers: number;
    products: number;
    saleInvoices: number;
    purchaseInvoices: number;
    invoiceItems: number;
    receipts: number;
    payments: number;
    moneyTransactions: number;
  };
  duplicates: string[];
  messages: YasMigrationMessage[];
  reconciliation: YasReconciliationRow[];
}

export interface YasMigrationAnalysis {
  data: AccountingData;
  report: YasMigrationReport;
}

const aliases = {
  id: ['id', '_id', 'rowid', 'code', 'kod', 'pk'],
  code: ['code', 'kod', 'customer_code', 'customercode', 'personcode', 'codeperson', 'codehesab', 'productcode', 'kalacode', 'codekala'],
  name: ['name', 'nam', 'title', 'esm', 'fullname', 'namefamily', 'onvan'],
  phone: ['phone', 'tel', 'telephone', 'mobile', 'mob', 'tell'],
  address: ['address', 'adres', 'addr'],
  nationalId: ['nationalid', 'national_id', 'shenase_melli', 'shenase'],
  economicCode: ['economiccode', 'economic_code', 'codeeghtesadi'],
  postalCode: ['postalcode', 'postal_code', 'codeposti'],
  active: ['active', 'isactive', 'enable', 'enabled', 'faal', 'vaziat', 'status'],
  opening: ['openingbalance', 'opening_balance', 'mandeaval', 'mandehaval', 'avalmande', 'firstbalance', 'mande_aval'],
  unit: ['unit', 'vahed', 'unitname'],
  stock: ['stock', 'mojoodi', 'inventory', 'tedadmojood', 'mande'],
  salePrice: ['saleprice', 'sale_price', 'gheymatforoosh', 'gheymatforosh', 'foroshprice'],
  buyPrice: ['buyprice', 'buy_price', 'gheymatkharid', 'kharidprice'],
  number: ['number', 'no', 'serial', 'shomare', 'shfactor', 'shomarefactor', 'factorno', 'factornumber', 'documentnumber'],
  date: ['date', 'tarikh', 'createdate', 'factor_date', 'factordate'],
  customerRef: ['customerid', 'customer_id', 'personid', 'person_id', 'hesabid', 'hesab_id', 'codeperson', 'customercode', 'tarafhesabid', 'codeh', 'codehesab', 'shakhs', 'ashkhasid'],
  productRef: ['productid', 'product_id', 'kalaid', 'kala_id', 'codekala', 'codkala', 'kalacode', 'productcode'],
  invoiceRef: ['invoiceid', 'invoice_id', 'factorid', 'factor_id', 'idfactor', 'number', 'shomare', 'shfactor', 'shomarefactor', 'factornumber', 'factorno'],
  qty: ['qty', 'quantity', 'tedad', 'meghdar', 'count'],
  price: ['unitprice', 'unit_price', 'price', 'fee', 'fi', 'gheymat', 'gheymatvahed', 'mablaghvahed'],
  amount: ['amount', 'mablagh', 'total', 'sum', 'jam', 'price', 'mablaghkol'],
  discount: ['discount', 'takhfif', 'takhfifmablagh'],
  invoiceDiscount: ['invoicediscount', 'invoice_discount', 'factordiscount', 'factor_discount', 'takhfifkol', 'takhfiffactor', 'takhfif_factor'],
  discountPercent: ['discountpercent', 'discount_percent', 'takhfifdarsad', 'darsadtakhfif'],
  tax: ['tax', 'maliat', 'arzeshafzode'],
  shipping: ['shipping', 'haml', 'keraye', 'freight'],
  details: ['details', 'description', 'tozihat', 'sharh', 'note', 'notes'],
  kind: ['kind', 'type', 'noe', 'doctype', 'factortype', 'factor_type'],
  direction: ['direction', 'type', 'noe', 'paymenttype'],
  method: ['method', 'paymentmethod', 'noepardakht', 'noehesab'],
  settlementRef: ['settlementaccountid', 'settlement_account_id', 'accountid', 'account_id', 'hesabmali', 'hesab', 'sandogh', 'bankid', 'bank_id', 'codehesab', 'codemali'],
  balance: ['balance', 'mande', 'mandeh', 'remaining', 'baghimande'],
  businessName: ['businessname', 'companyname', 'shopname', 'namforoshgah', 'nameforoshgah'],
};

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-./\\()[\]{}]+/g, '');
}

function columnMap(row: Row) {
  return new Map(Object.keys(row).map((key) => [normalizeName(key), key]));
}

function value(row: Row, names: string[]) {
  const map = columnMap(row);
  for (const name of names) {
    const key = map.get(normalizeName(name));
    if (key != null) return row[key];
  }
  return undefined;
}

function hasColumn(table: ExternalSqliteTable, names: string[]) {
  const set = new Set(table.columns.map(normalizeName));
  return names.some((name) => set.has(normalizeName(name)));
}

function text(input: unknown) {
  if (input == null) return '';
  if (typeof input === 'object') return '';
  return String(input).trim();
}

function number(input: unknown, fallback = 0) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  const raw = text(input)
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[,٬\s]/g, '');
  const result = Number(raw);
  return Number.isFinite(result) ? result : fallback;
}

function activeState(input: unknown) {
  const raw = normalizeName(text(input));
  if (!raw) return 'active' as const;
  if (['0', 'false', 'inactive', 'archived', 'disabled', 'غیرفعال', 'آرشیو'].some((item) => raw.includes(normalizeName(item)))) {
    return 'archived' as const;
  }
  return 'active' as const;
}

function safeDate(input: unknown) {
  const raw = text(input);
  if (!raw) return '1400/01/01';
  try {
    return normalizeStoredDate(raw);
  } catch {
    return raw;
  }
}

function keyPart(input: unknown, fallback: string) {
  const raw = text(input) || fallback;
  return raw.replace(/[^a-zA-Z0-9\u0600-\u06ff_-]+/g, '_').slice(0, 80) || fallback;
}

function sourceKey(row: Row, index: number) {
  return text(value(row, aliases.id)) || text(value(row, aliases.code)) || String(index + 1);
}

function rowRef(row: Row, names: string[]) {
  return text(value(row, names));
}

function tableNameIncludes(table: ExternalSqliteTable, terms: string[]) {
  const name = normalizeName(table.name);
  return terms.some((term) => name.includes(normalizeName(term)));
}

function isDerivedTable(table: ExternalSqliteTable) {
  return /^[tk]\d+/i.test(table.name.trim());
}

function scoreCustomer(table: ExternalSqliteTable) {
  if (isDerivedTable(table)) return -100;
  let score = 0;
  if (tableNameIncludes(table, ['customer', 'person', 'ashkhas', 'moshtari', 'hesab', 'tarafhesab'])) score += 8;
  if (hasColumn(table, aliases.name)) score += 4;
  if (hasColumn(table, aliases.code) || hasColumn(table, aliases.id)) score += 2;
  if (hasColumn(table, aliases.phone)) score += 2;
  if (hasColumn(table, aliases.address)) score += 1;
  if (hasColumn(table, aliases.opening)) score += 2;
  if (hasColumn(table, aliases.qty)) score -= 5;
  return score;
}

function scoreProduct(table: ExternalSqliteTable) {
  if (isDerivedTable(table)) return -100;
  let score = 0;
  if (tableNameIncludes(table, ['product', 'kala', 'goods', 'service', 'mahsol'])) score += 8;
  if (hasColumn(table, aliases.name)) score += 4;
  if (hasColumn(table, aliases.unit)) score += 3;
  if (hasColumn(table, aliases.stock)) score += 2;
  if (hasColumn(table, aliases.salePrice) || hasColumn(table, aliases.buyPrice)) score += 2;
  if (hasColumn(table, aliases.customerRef)) score -= 4;
  return score;
}

function scoreInvoiceHeader(table: ExternalSqliteTable) {
  if (isDerivedTable(table)) return -100;
  let score = 0;
  if (tableNameIncludes(table, ['factor', 'faktor', 'invoice', 'forosh', 'kharid', 'فاکتور'])) score += 6;
  if (hasColumn(table, aliases.number)) score += 3;
  if (hasColumn(table, aliases.date)) score += 2;
  if (hasColumn(table, aliases.customerRef)) score += 4;
  if (hasColumn(table, aliases.qty)) score -= 6;
  return score;
}

function scoreInvoiceItem(table: ExternalSqliteTable) {
  if (isDerivedTable(table)) return -100;
  let score = 0;
  if (tableNameIncludes(table, ['factoritem', 'faktoritem', 'factorrow', 'invoiceitem', 'detail', 'radif', 'ریز', 'اقلام'])) score += 8;
  if (hasColumn(table, aliases.invoiceRef)) score += 4;
  if (hasColumn(table, aliases.qty)) score += 4;
  if (hasColumn(table, aliases.price)) score += 4;
  return score;
}

function scorePayment(table: ExternalSqliteTable) {
  if (isDerivedTable(table)) return -100;
  let score = 0;
  if (tableNameIncludes(table, ['payment', 'daryaft', 'pardakht', 'دریافت', 'پرداخت'])) score += 9;
  if (hasColumn(table, aliases.amount)) score += 3;
  if (hasColumn(table, aliases.date)) score += 2;
  if (hasColumn(table, aliases.customerRef)) score += 3;
  return score;
}

function bestTable(snapshot: ExternalSqliteSnapshot, scorer: (table: ExternalSqliteTable) => number, minScore: number) {
  return [...snapshot.tables]
    .map((table) => ({ table, score: scorer(table) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)[0]?.table;
}

function matchingTables(snapshot: ExternalSqliteSnapshot, scorer: (table: ExternalSqliteTable) => number, minScore: number) {
  return snapshot.tables.filter((table) => scorer(table) >= minScore);
}

function inferInvoiceKind(table: ExternalSqliteTable, row: Row): Invoice['kind'] {
  const raw = normalizeName(text(value(row, aliases.kind)) + ' ' + table.name);
  return raw.includes('kharid') || raw.includes(normalizeName('خرید')) || raw.includes('purchase') ? 'purchase' : 'sale';
}

function inferPaymentDirection(table: ExternalSqliteTable, row: Row): Payment['direction'] {
  const raw = normalizeName(text(value(row, aliases.direction)) + ' ' + table.name);
  return raw.includes('pardakht') || raw.includes(normalizeName('پرداخت')) || raw.includes('paymentout') || raw.includes('expense')
    ? 'payment'
    : 'receipt';
}

function inferPaymentMethod(table: ExternalSqliteTable, row: Row, financialAccountNames: Map<string, string>): Payment['method'] {
  const settlementRef = text(value(row, aliases.settlementRef));
  const accountLabel = financialAccountNames.get(normalizeName(settlementRef)) || '';
  const raw = normalizeName(
    [text(value(row, aliases.method)), settlementRef, accountLabel, table.name].filter(Boolean).join(' ')
  );
  if (raw.includes('check') || raw.includes(normalizeName('چک'))) return 'check';
  if (
    raw.includes('bank') ||
    raw.includes('card') ||
    raw.includes(normalizeName('بانک')) ||
    raw.includes(normalizeName('کارت')) ||
    raw.includes(normalizeName('واریز'))
  ) return 'card';
  return 'cash';
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of values) {
    const key = normalizeName(raw);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(raw);
    else seen.add(key);
  }
  return [...duplicates];
}

function blobToDataUrl(input: ExternalSqliteValue | undefined) {
  if (!input || typeof input !== 'object' || !('__blobBase64' in input)) return undefined;
  const base64 = input.__blobBase64;
  const mime = base64.startsWith('iVBOR') ? 'image/png' : base64.startsWith('/9j/') ? 'image/jpeg' : 'application/octet-stream';
  return 'data:' + mime + ';base64,' + base64;
}

async function fingerprint(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

function currentDuplicates(current: AccountingData, migrated: AccountingData) {
  const result: string[] = [];
  const customerCodes = new Set(current.customers.map((item) => item.code).filter(Boolean));
  const productCodes = new Set(current.products.map((item) => item.code).filter(Boolean));
  const invoiceKeys = new Set(current.invoices.map((item) => item.kind + ':' + item.number));
  const paymentNumbers = new Set(current.payments.map((item) => item.documentNumber));
  for (const item of migrated.customers) if (customerCodes.has(item.code)) result.push('طرف‌حساب با کد ' + item.code);
  for (const item of migrated.products) if (productCodes.has(item.code)) result.push('کالا/خدمت با کد ' + item.code);
  for (const item of migrated.invoices) if (invoiceKeys.has(item.kind + ':' + item.number)) result.push('فاکتور ' + item.number);
  for (const item of migrated.payments) if (paymentNumbers.has(item.documentNumber)) result.push('سند پرداخت/دریافت ' + item.documentNumber);
  return Array.from(new Set(result));
}

function findDerivedBalance(snapshot: ExternalSqliteSnapshot, prefix: 't' | 'k', candidateKeys: string[]) {
  const normalizedKeys = candidateKeys.map(normalizeName).filter(Boolean);
  const table = snapshot.tables.find((item) => {
    if (!item.name.toLowerCase().startsWith(prefix)) return false;
    const name = normalizeName(item.name);
    return normalizedKeys.some((key) => key.length >= 2 && name.includes(key));
  });
  if (!table?.rows.length) return undefined;
  const last = table.rows[table.rows.length - 1];
  const candidate = value(last, aliases.balance);
  if (candidate == null) return undefined;
  return number(candidate);
}

function buildStockMovements(products: Product[], invoices: Invoice[], knownFinalStockIds: Set<string>): StockMovement[] {
  const movements: StockMovement[] = [];
  const sourceInvoicesForOpening = invoices.filter((invoice) => invoice.status !== 'void');
  const finalInvoices = invoices
    .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date, 'en'));

  const netByProduct = new Map<string, number>();
  for (const invoice of sourceInvoicesForOpening) {
    for (const item of invoice.items) {
      if (!item.productId) continue;
      const delta = invoice.kind === 'purchase' ? Number(item.qty || 0) : -Number(item.qty || 0);
      netByProduct.set(item.productId, (netByProduct.get(item.productId) || 0) + delta);
    }
  }

  const balance = new Map<string, number>();
  const average = new Map<string, number>();
  for (const product of products) {
    if (product.kind !== 'product') continue;
    const opening = knownFinalStockIds.has(product.id)
      ? Number(product.stock || 0) - (netByProduct.get(product.id) || 0)
      : 0;
    const avg = Number(product.averageCost || product.buyPrice || 0);
    balance.set(product.id, opening);
    average.set(product.id, avg);
    if (Math.abs(opening) > 0.0001) {
      movements.push({
        id: 'yas_open_' + product.id,
        productId: product.id,
        warehouseId: 'main',
        date: 'ابتدای دوره',
        createdAt: '2000-01-01T00:00:00.000Z',
        quantity: opening,
        balanceAfter: opening,
        averageCostAfter: avg,
        unitCost: avg,
        type: 'opening',
        action: 'migration-opening',
        sourceType: 'system',
        sourceId: 'yas-migration',
        sourceReference: 'مانده افتتاحیه Yas',
      });
    }
  }

  let sequence = 0;
  for (const invoice of finalInvoices) {
    for (const item of invoice.items) {
      if (!item.productId) continue;
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product || product.kind !== 'product') continue;
      const before = balance.get(product.id) || 0;
      const beforeAvg = average.get(product.id) || Number(product.buyPrice || 0);
      const quantity = invoice.kind === 'purchase' ? Number(item.qty || 0) : -Number(item.qty || 0);
      const after = before + quantity;
      let unitCost = beforeAvg;
      let afterAvg = beforeAvg;
      if (invoice.kind === 'purchase') {
        unitCost = Number(item.unitPrice || product.buyPrice || beforeAvg);
        const valueBefore = before * beforeAvg;
        afterAvg = after > 0 ? Math.max(0, (valueBefore + quantity * unitCost) / after) : 0;
      }
      balance.set(product.id, after);
      average.set(product.id, afterAvg);
      movements.push({
        id: 'yas_stock_' + (++sequence),
        productId: product.id,
        warehouseId: 'main',
        date: invoice.date,
        createdAt: invoice.createdAt,
        quantity,
        balanceAfter: after,
        averageCostAfter: afterAvg,
        unitCost,
        type: invoice.kind === 'purchase' ? 'purchase' : 'sale',
        action: 'finalize',
        sourceType: 'invoice',
        sourceId: invoice.id,
        sourceReference: invoice.number,
        sourceKind: invoice.kind,
        note: 'بازسازی کاردکس از اسناد Yas',
      });
    }
  }

  for (const product of products) {
    if (product.kind !== 'product') continue;
    const finalBalance = balance.get(product.id);
    if (finalBalance != null) {
      product.stock = finalBalance;
      product.averageCost = average.get(product.id) || product.averageCost;
    }
  }
  return movements;
}

export async function analyzeYasDatabase(bytes: ArrayBuffer, current: AccountingData): Promise<YasMigrationAnalysis> {
  const [snapshot, fileFingerprint] = await Promise.all([inspectExternalSqlite(bytes), fingerprint(bytes)]);
  const messages: YasMigrationMessage[] = snapshot.warnings.map((message) => ({ severity: 'warning', code: 'sqlite-warning', message }));

  const customerTable = bestTable(snapshot, scoreCustomer, 7);
  const productTable = bestTable(snapshot, scoreProduct, 7);
  const invoiceTables = matchingTables(snapshot, scoreInvoiceHeader, 9);
  const itemTables = matchingTables(snapshot, scoreInvoiceItem, 10);
  const paymentTables = matchingTables(snapshot, scorePayment, 9);
  const signatureTable = snapshot.tables.find((table) => tableNameIncludes(table, ['signbitmap', 'signature']));
  const incomeTable = snapshot.tables.find((table) => !isDerivedTable(table) && tableNameIncludes(table, ['income', 'daramad', 'درآمد']));
  const financialAccountTables = snapshot.tables.filter(
    (table) =>
      !isDerivedTable(table) &&
      table.rowCount <= 100 &&
      tableNameIncludes(table, ['financialaccount', 'bankaccount', 'hesabmali', 'hesabha', 'sandogh', 'bank', 'accounts'])
  );
  const financialAccountNames = new Map<string, string>();
  for (const table of financialAccountTables) {
    table.rows.forEach((row, index) => {
      const label = text(value(row, aliases.name)) || text(value(row, aliases.details)) || 'حساب مالی ' + (index + 1);
      const refCandidates = [
        text(value(row, aliases.id)),
        text(value(row, aliases.code)),
        label,
      ].filter(Boolean);
      refCandidates.forEach((candidate) => financialAccountNames.set(normalizeName(candidate), label));
    });
  }

  if (!customerTable) messages.push({ severity: 'conflict', code: 'customers-table-missing', message: 'جدول طرف‌حساب‌ها با اطمینان کافی شناسایی نشد.' });
  if (!productTable) messages.push({ severity: 'warning', code: 'products-table-missing', message: 'جدول کالا/خدمت با اطمینان کافی شناسایی نشد.' });
  if (!invoiceTables.length) messages.push({ severity: 'conflict', code: 'invoice-table-missing', message: 'جدول فاکتور شناسایی نشد.' });
  if (!itemTables.length) messages.push({ severity: 'conflict', code: 'invoice-items-table-missing', message: 'جدول ردیف‌های فاکتور شناسایی نشد.' });

  const customerSource = (customerTable?.rows || []).map((row, index) => ({ row, index, source: sourceKey(row, index) }));
  const sourceOpeningKnown = new Set<string>();
  const customers: Customer[] = customerSource.map(({ row, index, source }) => {
    const customer: Customer = {
      id: 'yas_customer_' + keyPart(source, String(index + 1)),
      code: text(value(row, aliases.code)) || source,
      name: text(value(row, aliases.name)) || 'طرف حساب ' + (index + 1),
      kind: 'both',
      status: activeState(value(row, aliases.active)),
      phone: text(value(row, aliases.phone)),
      address: text(value(row, aliases.address)),
      nationalId: text(value(row, aliases.nationalId)),
      economicCode: text(value(row, aliases.economicCode)),
      postalCode: text(value(row, aliases.postalCode)),
      openingBalance: number(value(row, aliases.opening)),
      notes: 'مهاجرت‌شده از Yas',
    };
    if (value(row, aliases.opening) != null && text(value(row, aliases.opening)) !== '') sourceOpeningKnown.add(customer.id);
    return customer;
  });

  const customerByRef = new Map<string, Customer>();
  customerSource.forEach(({ row, source }, index) => {
    const customer = customers[index];
    [source, customer.code, customer.name, text(value(row, aliases.id))].filter(Boolean).forEach((key) => customerByRef.set(normalizeName(String(key)), customer));
  });

  const productSource = (productTable?.rows || []).map((row, index) => ({ row, index, source: sourceKey(row, index) }));
  const sourceStockKnown = new Set<string>();
  const products: Product[] = productSource.map(({ row, index, source }) => {
    const stockValue = value(row, aliases.stock);
    const rawKind = normalizeName(text(value(row, aliases.kind)));
    const kind: Product['kind'] = rawKind.includes('service') || rawKind.includes(normalizeName('خدمت')) ? 'service' : 'product';
    const product: Product = {
      id: 'yas_product_' + keyPart(source, String(index + 1)),
      code: text(value(row, aliases.code)) || source,
      name: text(value(row, aliases.name)) || 'کالا/خدمت ' + (index + 1),
      kind,
      unit: text(value(row, aliases.unit)) || 'عدد',
      salePrice: number(value(row, aliases.salePrice)),
      buyPrice: number(value(row, aliases.buyPrice)),
      averageCost: number(value(row, aliases.buyPrice)),
      stock: kind === 'product' ? number(stockValue) : 0,
      minStock: 0,
      notes: 'مهاجرت‌شده از Yas',
    };
    if (stockValue != null && text(stockValue) !== '') sourceStockKnown.add(product.id);
    return product;
  });

  const productByRef = new Map<string, Product>();
  productSource.forEach(({ row, source }, index) => {
    const product = products[index];
    [source, product.code, product.name, text(value(row, aliases.id))].filter(Boolean).forEach((key) => productByRef.set(normalizeName(String(key)), product));
  });

  productSource.forEach(({ source }, index) => {
    const product = products[index];
    if (!product || product.kind !== 'product' || sourceStockKnown.has(product.id)) return;
    const derivedStock = findDerivedBalance(snapshot, 'k', [source, product.code]);
    if (derivedStock == null) return;
    product.stock = derivedStock;
    sourceStockKnown.add(product.id);
    messages.push({
      severity: 'info',
      code: 'stock-inferred-from-cardex',
      entity: product.code,
      message: 'موجودی نهایی «' + product.name + '» از کاردکس مشتق‌شده Yas استنتاج شد؛ خود جدول k به‌عنوان Entity وارد نمی‌شود.',
    });
  });

  const itemRows = itemTables.flatMap((table) => table.rows.map((row, index) => ({ table, row, index })));
  const invoices: Invoice[] = [];
  const invoiceSourceMap = new Map<string, Invoice>();

  for (const table of invoiceTables) {
    for (let index = 0; index < table.rows.length; index++) {
      const row = table.rows[index];
      const source = sourceKey(row, index);
      const numberValue = text(value(row, aliases.number)) || source;
      const kind = inferInvoiceKind(table, row);
      const duplicateKey = kind + ':' + numberValue;
      if (invoices.some((invoice) => invoice.kind + ':' + invoice.number === duplicateKey)) continue;

      const customerRef = rowRef(row, aliases.customerRef);
      const customer = customerByRef.get(normalizeName(customerRef));
      if (!customer) {
        messages.push({
          severity: 'conflict',
          code: 'invoice-customer-unmapped',
          entity: numberValue,
          message: 'طرف‌حساب فاکتور ' + numberValue + ' نگاشت نشد' + (customerRef ? ': ' + customerRef : '؛ مرجع طرف‌حساب خالی است.') + ' Import تا رفع این نگاشت متوقف می‌شود.',
        });
      }

      const itemCandidates = itemRows.filter(({ row: itemRow }) => {
        const ref = rowRef(itemRow, aliases.invoiceRef);
        return !!ref && [source, numberValue, text(value(row, aliases.id))].some((candidate) => normalizeName(candidate) === normalizeName(ref));
      });

      const items: InvoiceItem[] = itemCandidates.map(({ row: itemRow }, itemIndex) => {
        const productRef = rowRef(itemRow, aliases.productRef);
        const product = productByRef.get(normalizeName(productRef));
        const qty = number(value(itemRow, aliases.qty));
        const unitPrice = number(value(itemRow, aliases.price));
        const discount = Math.max(0, number(value(itemRow, aliases.discount)));
        const discountPercentRaw = value(itemRow, aliases.discountPercent);
        return {
          id: 'yas_item_' + keyPart(numberValue, source) + '_' + (itemIndex + 1),
          productId: product?.id,
          description: product?.name || text(value(itemRow, aliases.name)) || 'ردیف ' + (itemIndex + 1),
          details: text(value(itemRow, aliases.details)),
          unit: product?.unit || text(value(itemRow, aliases.unit)) || 'عدد',
          qty,
          unitPrice,
          discount,
          ...(discountPercentRaw == null || text(discountPercentRaw) === '' ? {} : { discountPercent: Math.max(0, number(discountPercentRaw)) }),
        };
      });

      if (!items.length) {
        messages.push({ severity: 'warning', code: 'invoice-items-unmapped', entity: numberValue, message: 'برای فاکتور ' + numberValue + ' ردیفی پیدا نشد.' });
      }

      const anomaly = numberValue.replace(/\D/g, '') === '300051';
      const tableCarriesLineRows = itemTables.some((candidate) => candidate.name === table.name) &&
        hasColumn(table, aliases.qty) &&
        hasColumn(table, aliases.price);
      const invoiceDiscountValue = value(row, aliases.invoiceDiscount);
      const invoiceDiscount = invoiceDiscountValue != null
        ? Math.max(0, number(invoiceDiscountValue))
        : tableCarriesLineRows
          ? 0
          : Math.max(0, number(value(row, aliases.discount)));
      const now = new Date().toISOString();
      const invoice: Invoice = {
        id: 'yas_invoice_' + keyPart(kind + '_' + source, String(index + 1)),
        number: numberValue,
        businessProfileId: 'business_default',
        kind,
        status: anomaly ? 'draft' : 'final',
        date: safeDate(value(row, aliases.date)),
        customerId: customer?.id || '',
        customerName: customer?.name || text(value(row, aliases.customerRef)) || 'نامشخص',
        customerPhone: customer?.phone || '',
        customerAddress: customer?.address || '',
        customerNationalId: customer?.nationalId,
        customerEconomicCode: customer?.economicCode,
        customerPostalCode: customer?.postalCode,
        items,
        discount: invoiceDiscount,
        tax: Math.max(0, number(value(row, aliases.tax))),
        shipping: Math.max(0, number(value(row, aliases.shipping))),
        notes: text(value(row, aliases.details)),
        createdAt: now,
        updatedAt: now,
        ...(anomaly ? { migrationReview: { status: 'needs-review' as const, reason: 'Yas anomaly: فاکتور 300051 در دفتر طرف‌حساب اثر ندارد و دریافت متناظر ندارد.' } } : { finalizedAt: now }),
      };
      if (anomaly) {
        messages.push({
          severity: 'conflict',
          code: 'known-anomaly-300051',
          entity: numberValue,
          message: 'فاکتور 300051 (ناسازگاری شناخته‌شده Yas؛ در تحلیل منبع مبلغ 10,000,000 و بدون اثر در t100005/دریافت متناظر) به‌صورت Draft/Needs Review وارد می‌شود و تا بررسی دستی روی مانده و Journal اثر ندارد.',
        });
      }
      invoices.push(invoice);
      [source, numberValue, text(value(row, aliases.id))].filter(Boolean).forEach((key) => invoiceSourceMap.set(normalizeName(String(key)), invoice));
    }
  }

  const payments: Payment[] = [];
  const sourcePaymentDocumentNumbers: string[] = [];
  for (const table of paymentTables) {
    for (let index = 0; index < table.rows.length; index++) {
      const row = table.rows[index];
      const source = sourceKey(row, index);
      const customerRef = rowRef(row, aliases.customerRef);
      const customer = customerByRef.get(normalizeName(customerRef));
      if (!customer) {
        messages.push({ severity: 'conflict', code: 'payment-customer-unmapped', entity: source, message: 'طرف‌حساب دریافت/پرداخت نگاشت نشد: ' + (customerRef || 'مرجع خالی') + '. Import تا رفع نگاشت متوقف می‌شود.' });
        continue;
      }
      const invoiceRef = rowRef(row, aliases.invoiceRef);
      const linkedInvoice = invoiceSourceMap.get(normalizeName(invoiceRef));
      const direction = inferPaymentDirection(table, row);
      const documentNumber = text(value(row, aliases.number)) || (direction === 'receipt' ? 'YR-' : 'YP-') + String(payments.length + 1).padStart(6, '0');
      sourcePaymentDocumentNumbers.push(documentNumber);
      payments.push({
        id: 'yas_payment_' + keyPart(source, String(index + 1)),
        documentNumber,
        invoiceId: linkedInvoice?.id,
        customerId: customer.id,
        direction,
        method: inferPaymentMethod(table, row, financialAccountNames),
        amount: Math.abs(number(value(row, aliases.amount))),
        date: safeDate(value(row, aliases.date)),
        reference: text(value(row, aliases.details)) || source,
        notes: 'مهاجرت‌شده از Yas',
      });
    }
  }

  customerSource.forEach(({ source }, index) => {
    const customer = customers[index];
    if (!customer || sourceOpeningKnown.has(customer.id)) return;
    const sourceFinalBalance = findDerivedBalance(snapshot, 't', [source, customer.code]);
    if (sourceFinalBalance == null) return;
    const operationalBalance = customerNetBalance(
      customer.id,
      invoices,
      payments,
      [],
      [],
      0,
      []
    );
    customer.openingBalance = sourceFinalBalance - operationalBalance;
    sourceOpeningKnown.add(customer.id);
    messages.push({
      severity: 'info',
      code: 'opening-balance-inferred',
      entity: customer.code,
      message: 'مانده افتتاحیه «' + customer.name + '» از مانده نهایی t-cardex منهای اثر اسناد پایه استنتاج شد.',
    });
  });

  const settings = JSON.parse(JSON.stringify(seedData.settings)) as AccountingData['settings'];
  const defaultProfile = settings.businessProfiles[0] as BusinessProfile;
  if (signatureTable?.rows.length) {
    const first = signatureTable.rows[0];
    const blob = Object.values(first).map((candidate) => blobToDataUrl(candidate)).find(Boolean);
    if (blob) {
      defaultProfile.signatureImage = blob;
      defaultProfile.showSignature = true;
    } else {
      messages.push({ severity: 'warning', code: 'signature-unreadable', message: 'جدول signbitmap پیدا شد ولی BLOB تصویر قابل تشخیص نبود.' });
    }
  }

  const profileTable = snapshot.tables.find((table) => !isDerivedTable(table) && tableNameIncludes(table, ['setting', 'profile', 'company', 'business', 'foroshgah']));
  if (profileTable?.rows[0]) {
    const businessName = text(value(profileTable.rows[0], aliases.businessName));
    if (businessName) {
      defaultProfile.businessName = businessName;
      defaultProfile.label = businessName;
    }
  }

  const moneyTransactions: MoneyTransaction[] = [];
  if (incomeTable) {
    for (let index = 0; index < incomeTable.rows.length; index++) {
      const row = incomeTable.rows[index];
      const amount = Math.abs(number(value(row, aliases.amount)));
      if (amount <= 0) continue;
      const now = new Date().toISOString();
      const incomeMethod = inferPaymentMethod(incomeTable, row, financialAccountNames);
      moneyTransactions.push({
        id: 'yas_income_' + keyPart(sourceKey(row, index), String(index + 1)),
        kind: 'income',
        status: 'final',
        date: safeDate(value(row, aliases.date)),
        amount,
        settlementAccountId: incomeMethod === 'card' ? 'acct_bank' : 'acct_cash',
        categoryAccountId: 'acct_other_income',
        description: text(value(row, aliases.details)) || 'درآمد منتقل‌شده از Yas',
        reference: sourceKey(row, index),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const stockMovements = buildStockMovements(products, invoices, sourceStockKnown);
  const draftData: AccountingData = {
    customers,
    products,
    invoices,
    returns: [],
    payments,
    checks: [],
    adjustments: [],
    stockMovements,
    accounts: JSON.parse(JSON.stringify(SYSTEM_ACCOUNTS)),
    journalEntries: [],
    moneyTransactions,
    settings,
  };

  const data = normalizeAccountingData(draftData);
  const sourceDuplicates = [
    ...findDuplicates(data.customers.map((item) => item.code)).map((item) => 'کد طرف‌حساب تکراری در Yas: ' + item),
    ...findDuplicates(data.products.map((item) => item.code)).map((item) => 'کد کالا/خدمت تکراری در Yas: ' + item),
    ...findDuplicates(sourcePaymentDocumentNumbers).map((item) => 'شماره سند دریافت/پرداخت تکراری در Yas: ' + item),
  ];
  const duplicates = [...sourceDuplicates, ...currentDuplicates(current, data)];
  if (sourceDuplicates.some((item) => item.includes('شماره سند دریافت/پرداخت'))) {
    messages.push({
      severity: 'conflict',
      code: 'duplicate-payment-document',
      message: 'شماره سند تکراری در دریافت/پرداخت Yas وجود دارد و با Unique Constraint مقصد سازگار نیست.',
    });
  }
  if (duplicates.length) {
    messages.push({ severity: 'warning', code: 'duplicates-current-db', message: duplicates.length + ' مورد مشابه در دیتابیس فعلی شناسایی شد. Import به‌صورت Replace انجام می‌شود، نه Merge.' });
  }

  const reconciliation: YasReconciliationRow[] = [];

  const sourceInvoiceKeys = new Set<string>();
  for (const table of invoiceTables) {
    table.rows.forEach((row, index) => {
      const source = sourceKey(row, index);
      const numberValue = text(value(row, aliases.number)) || source;
      sourceInvoiceKeys.add(inferInvoiceKind(table, row) + ':' + numberValue);
    });
  }
  const addCountReconciliation = (kind: YasReconciliationRow['kind'], key: string, label: string, source: number, imported: number) => {
    reconciliation.push({
      kind,
      key,
      label,
      source,
      imported,
      difference: imported - source,
      status: imported === source ? 'ok' : 'mismatch',
    });
  };
  addCountReconciliation('customer-count', 'customers', 'تعداد طرف‌حساب‌ها', customerTable?.rowCount || 0, data.customers.length);
  addCountReconciliation('product-count', 'products', 'تعداد کالا/خدمت', productTable?.rowCount || 0, data.products.length);
  addCountReconciliation('invoice-count', 'invoices', 'تعداد فاکتورها', sourceInvoiceKeys.size, data.invoices.length);
  addCountReconciliation('payment-count', 'payments', 'تعداد دریافت/پرداخت', paymentTables.reduce((sum, table) => sum + table.rowCount, 0), data.payments.length);

  const sourceSaleTotal = invoiceTables.flatMap((table) => table.rows.map((row) => ({ table, row })))
    .filter(({ table, row }) => inferInvoiceKind(table, row) === 'sale')
    .reduce((sum, { row }) => {
      const explicit = value(row, aliases.amount);
      return sum + (explicit == null ? 0 : Math.abs(number(explicit)));
    }, 0);
  const importedSaleTotal = data.invoices.filter((invoice) => invoice.kind === 'sale' && invoice.status !== 'draft' && invoice.status !== 'void').reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  if (sourceSaleTotal > 0) reconciliation.push({
    kind: 'sales-total',
    key: 'sales',
    label: 'جمع فروش',
    source: sourceSaleTotal,
    imported: importedSaleTotal,
    difference: importedSaleTotal - sourceSaleTotal,
    status: Math.abs(importedSaleTotal - sourceSaleTotal) < 1 ? 'ok' : 'mismatch',
  });

  const sourcePaymentTotal = paymentTables.flatMap((table) => table.rows.map((row) => Math.abs(number(value(row, aliases.amount))))).reduce((a, b) => a + b, 0);
  const importedPaymentTotal = data.payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (sourcePaymentTotal > 0) reconciliation.push({
    kind: 'payment-total',
    key: 'payments',
    label: 'جمع دریافت/پرداخت',
    source: sourcePaymentTotal,
    imported: importedPaymentTotal,
    difference: importedPaymentTotal - sourcePaymentTotal,
    status: Math.abs(importedPaymentTotal - sourcePaymentTotal) < 1 ? 'ok' : 'mismatch',
  });

  customerSource.forEach(({ row, source }, index) => {
    const customer = data.customers[index];
    if (!customer) return;
    const sourceBalance = findDerivedBalance(snapshot, 't', [source, customer.code]);
    if (sourceBalance == null) return;
    const importedBalance = customerNetBalance(customer.id, data.invoices, data.payments, data.checks, data.adjustments, customer.openingBalance, data.returns);
    reconciliation.push({
      kind: 'customer-balance',
      key: customer.code,
      label: customer.name,
      source: sourceBalance,
      imported: importedBalance,
      difference: importedBalance - sourceBalance,
      status: Math.abs(importedBalance - sourceBalance) < 1 ? 'ok' : 'mismatch',
    });
  });

  productSource.forEach(({ row, source }, index) => {
    const product = data.products[index];
    if (!product || product.kind !== 'product') return;
    const sourceCardex = findDerivedBalance(snapshot, 'k', [source, product.code]);
    const sourceStock = sourceCardex ?? (sourceStockKnown.has(product.id) ? number(value(row, aliases.stock)) : undefined);
    if (sourceStock == null) return;
    reconciliation.push({
      kind: 'product-stock',
      key: product.code,
      label: product.name,
      source: sourceStock,
      imported: product.stock,
      difference: product.stock - sourceStock,
      status: Math.abs(product.stock - sourceStock) < 0.0001 ? 'ok' : 'mismatch',
    });
  });

  reconciliation.filter((item) => item.status === 'mismatch').forEach((item) => {
    messages.push({ severity: 'warning', code: 'reconciliation-mismatch', entity: item.key, message: 'اختلاف Reconciliation برای ' + item.label + ': ' + item.difference });
  });

  const report: YasMigrationReport = {
    fingerprint: fileFingerprint,
    analyzedAt: new Date().toISOString(),
    source: {
      quickCheck: snapshot.quickCheck,
      walHeader: snapshot.walHeader,
      tables: snapshot.tables.map((table) => ({ name: table.name, rows: table.rowCount, columns: table.columns })),
    },
    mapping: {
      customers: customerTable?.name,
      products: productTable?.name,
      invoiceHeaders: invoiceTables.map((table) => table.name),
      invoiceItems: itemTables.map((table) => table.name),
      payments: paymentTables.map((table) => table.name),
      income: incomeTable?.name,
      financialAccounts: financialAccountTables.map((table) => table.name),
      signature: signatureTable?.name,
    },
    counts: {
      customers: data.customers.length,
      archivedCustomers: data.customers.filter((customer) => customer.status === 'archived').length,
      products: data.products.length,
      saleInvoices: data.invoices.filter((invoice) => invoice.kind === 'sale').length,
      purchaseInvoices: data.invoices.filter((invoice) => invoice.kind === 'purchase').length,
      invoiceItems: data.invoices.reduce((sum, invoice) => sum + invoice.items.length, 0),
      receipts: data.payments.filter((payment) => payment.direction === 'receipt').length,
      payments: data.payments.filter((payment) => payment.direction === 'payment').length,
      moneyTransactions: data.moneyTransactions.length,
    },
    duplicates,
    messages,
    reconciliation,
  };

  return { data, report };
}
