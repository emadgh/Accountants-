import type { AccountingData } from './types';
import { ACCOUNTING_SCHEMA_VERSION } from './storage';
import { strFromU8, unzipSync } from 'fflate';
import { inspectZipArchive } from './zip-limits';
import { buildOpeningJournal, normalizeAccounts } from './accounting';
import { createEmptyAccountingData } from './data';
import { invoiceTotal, settledForInvoice } from './utils';

const MAX_BACKUP_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_BACKUP_EXPANDED_BYTES = 300 * 1024 * 1024;

export const ACCOUNTING_BACKUP_FORMAT = 'accountants-web-backup-v2';

export interface AccountingBackupEnvelope {
  format: typeof ACCOUNTING_BACKUP_FORMAT;
  schemaVersion: number;
  createdAt: string;
  checksum?: string;
  data: AccountingData;
}

export interface AccountingBackupPreview {
  source: 'versioned' | 'legacy';
  schemaVersion: number;
  createdAt?: string;
  checksumVerified: boolean | null;
  customers: number;
  products: number;
  invoices: number;
  returns: number;
  payments: number;
  checks: number;
  journalEntries: number;
  businessProfiles: number;
  quotes: number;
  projects: number;
  attachments: number;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function sha256(value: string) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function validateAccountingShape(raw: unknown): AccountingData {
  if (!isRecord(raw)) throw new Error('ساختار فایل پشتیبان معتبر نیست.');
  if (!Array.isArray(raw.customers) || !Array.isArray(raw.products) || !Array.isArray(raw.invoices)) {
    throw new Error('فایل پشتیبان فاقد داده‌های اصلی مشتری، کالا یا فاکتور است.');
  }
  if (!isRecord(raw.settings)) throw new Error('تنظیمات فایل پشتیبان معتبر نیست.');

  const defaults = createEmptyAccountingData();
  const rawSettings = raw.settings as Partial<AccountingData['settings']>;
  const inputProfiles = Array.isArray(rawSettings.businessProfiles) ? rawSettings.businessProfiles : [];
  const profiles = inputProfiles.map((profile, index) => ({
    ...defaults.settings.businessProfiles[0],
    ...(isRecord(profile) ? profile : {}),
    id: isRecord(profile) && typeof profile.id === 'string' && profile.id ? profile.id : `legacy-business-${index + 1}`,
  })) as AccountingData['settings']['businessProfiles'];
  if (!profiles.length) profiles.push({ ...defaults.settings.businessProfiles[0],
    businessName: String(rawSettings.businessName || ''), ownerName: String(rawSettings.ownerName || ''),
    phone: String(rawSettings.phone || ''), address: String(rawSettings.address || ''), nationalId: String(rawSettings.nationalId || ''),
    economicCode: String(rawSettings.economicCode || ''), postalCode: String(rawSettings.postalCode || ''),
    cardNumber: String(rawSettings.cardNumber || ''), iban: String(rawSettings.iban || ''), bankName: String(rawSettings.bankName || ''),
    invoiceTitle: String(rawSettings.invoiceTitle || 'فاکتور فروش'), footer: String(rawSettings.footer || ''),
  });
  const settings: AccountingData['settings'] = {
    ...defaults.settings,
    ...rawSettings,
    numbering: { ...defaults.settings.numbering, ...(isRecord(rawSettings.numbering) ? rawSettings.numbering : {}) },
    businessProfiles: profiles,
    defaultBusinessProfileId: profiles.some((profile) => profile.id === rawSettings.defaultBusinessProfileId)
      ? String(rawSettings.defaultBusinessProfileId) : profiles[0].id,
    defaultInvoiceTemplateId: rawSettings.defaultInvoiceTemplateId || defaults.settings.defaultInvoiceTemplateId,
    defaultInvoicePaperSize: rawSettings.defaultInvoicePaperSize === 'A5' ? 'A5' : 'A4',
  };

  const customers = (raw.customers as AccountingData['customers']).map((customer, index) => ({
    ...customer,
    id: customer.id || `legacy-customer-${index + 1}`, code: customer.code || `LEGACY-${index + 1}`,
    name: customer.name || 'طرف حساب قدیمی', kind: customer.kind || 'customer', status: customer.status === 'archived' ? 'archived' as const : 'active' as const,
    phone: customer.phone || '', address: customer.address || '', nationalId: customer.nationalId || '', economicCode: customer.economicCode || '',
    postalCode: customer.postalCode || '', openingBalance: Number(customer.openingBalance || 0),
  }));
  const ensureLegacyCustomer = (id: string | undefined, name: string, kind: 'customer' | 'supplier') => {
    const existing = customers.find((customer) => customer.id === id);
    if (existing) return existing.id;
    const customerId = id || `legacy-customer-${customers.length + 1}`;
    customers.push({ id: customerId, code: `LEGACY-${customers.length + 1}`, name: name.trim() || 'طرف حساب قدیمی', kind, status: 'active',
      phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0, notes: 'رکورد خودکار برای نگه‌داشتن ارتباط سند قدیمی' });
    return customerId;
  };
  const products = (arrayOrEmpty(raw.products) as AccountingData['products']).map((product, index) => ({
    ...product, id: product.id || `legacy-product-${index + 1}`, code: product.code || `LEGACY-P-${index + 1}`,
    name: product.name || 'کالای قدیمی', kind: product.kind === 'service' ? 'service' as const : 'product' as const,
    unit: product.unit || 'عدد', salePrice: Number(product.salePrice || 0), buyPrice: Number(product.buyPrice || 0),
    averageCost: Number(product.averageCost ?? product.buyPrice ?? 0), stock: Number(product.stock || 0), minStock: Number(product.minStock || 0),
  }));
  const invoices = (raw.invoices as AccountingData['invoices']).map((invoice, index) => ({
    ...invoice,
    id: invoice.id || `legacy-invoice-${index + 1}`,
    customerId: ensureLegacyCustomer(invoice.customerId, invoice.customerName || '', invoice.kind === 'purchase' ? 'supplier' : 'customer'),
    businessProfileId: profiles.some((profile) => profile.id === invoice.businessProfileId) ? invoice.businessProfileId : profiles[0].id,
    templateId: invoice.templateId || 'classic', items: arrayOrEmpty(invoice.items) as AccountingData['invoices'][number]['items'],
    discount: Number(invoice.discount || 0), tax: Number(invoice.tax || 0), shipping: Number(invoice.shipping || 0),
  }));
  const projects = (arrayOrEmpty(raw.projects) as AccountingData['projects']).map((project, index) => ({
    ...project, id: project.id || `legacy-project-${index + 1}`,
    customerId: ensureLegacyCustomer(project.customerId, '', 'customer'),
    title: project.title || 'پروژه قدیمی', agreedAmount: Number(project.agreedAmount || 0), notes: project.notes || '',
  }));
  const quotes = (arrayOrEmpty(raw.quotes) as AccountingData['quotes']).map((quote, index) => ({
    ...quote, id: quote.id || `legacy-quote-${index + 1}`,
    customerId: ensureLegacyCustomer(quote.customerId, quote.customerName || '', 'customer'),
    businessProfileId: profiles.some((profile) => profile.id === quote.businessProfileId) ? quote.businessProfileId : profiles[0].id,
    items: arrayOrEmpty(quote.items) as AccountingData['quotes'][number]['items'],
  }));
  const accounts = normalizeAccounts(arrayOrEmpty(raw.accounts) as AccountingData['accounts']);
  const data: AccountingData = {
    customers, products, invoices,
    returns: (arrayOrEmpty(raw.returns) as AccountingData['returns']).map((document, index) => ({
      ...document, id: document.id || `legacy-return-${index + 1}`,
      customerId: ensureLegacyCustomer(document.customerId, document.customerName || '', 'customer'),
    })),
    payments: arrayOrEmpty(raw.payments) as AccountingData['payments'],
    checks: arrayOrEmpty(raw.checks) as AccountingData['checks'],
    adjustments: arrayOrEmpty(raw.adjustments) as AccountingData['adjustments'],
    stockMovements: arrayOrEmpty(raw.stockMovements) as AccountingData['stockMovements'],
    accounts,
    journalEntries: arrayOrEmpty(raw.journalEntries) as AccountingData['journalEntries'],
    moneyTransactions: arrayOrEmpty(raw.moneyTransactions) as AccountingData['moneyTransactions'],
    quotes, projects, attachments: arrayOrEmpty(raw.attachments) as AccountingData['attachments'], settings,
  };
  data.payments = data.payments.map((payment, index) => ({
    ...payment,
    customerId: ensureLegacyCustomer(payment.customerId, '', payment.direction === 'payment' ? 'supplier' : 'customer'),
    documentNumber: payment.documentNumber || `${payment.direction === 'payment' ? 'PY-' : 'R-'}${String(index + 1).padStart(6, '0')}`,
    direction: payment.invoiceId
      ? (data.invoices.find((invoice) => invoice.id === payment.invoiceId)?.kind === 'purchase' ? 'payment' : 'receipt')
      : payment.direction || 'receipt',
  }));
  data.checks = data.checks.map((check, index) => ({
    ...check, customerId: ensureLegacyCustomer(check.customerId, '', 'customer'),
    documentNumber: check.documentNumber || `C-${String(index + 1).padStart(6, '0')}`,
  }));
  if (!data.stockMovements.length) {
    data.stockMovements = products.filter((product) => product.kind === 'product' && product.stock > 0).map((product) => ({
      id: `legacy-opening-${product.id}`, productId: product.id, warehouseId: 'main', date: 'ابتدای دوره', createdAt: new Date(0).toISOString(),
      quantity: product.stock, balanceAfter: product.stock, averageCostAfter: product.averageCost, unitCost: product.averageCost,
      type: 'opening' as const, action: 'migration-opening' as const, sourceType: 'system' as const, sourceId: `legacy-opening:${product.id}`,
    }));
  }
  const addMissingSourceMovement = (input: {
    sourceType: 'invoice' | 'return'; sourceId: string; productId: string; expectedQuantity: number; date: string;
    type: AccountingData['stockMovements'][number]['type']; action: AccountingData['stockMovements'][number]['action']; sourceKind: AccountingData['stockMovements'][number]['sourceKind'];
  }) => {
    const existingQuantity = data.stockMovements.filter((movement) => movement.sourceType === input.sourceType && movement.sourceId === input.sourceId && movement.productId === input.productId)
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    const missing = input.expectedQuantity - existingQuantity;
    if (Math.abs(missing) < 0.01) return;
    const product = products.find((item) => item.id === input.productId);
    if (!product) return;
    data.stockMovements.push({
      id: `legacy-${input.sourceType}-${input.sourceId}-${input.productId}`, productId: product.id, warehouseId: 'main',
      date: input.date || 'ابتدای دوره', createdAt: new Date(0).toISOString(), quantity: missing,
      balanceAfter: product.stock, averageCostAfter: product.averageCost, unitCost: product.averageCost,
      type: input.type, action: input.action, sourceType: input.sourceType, sourceId: input.sourceId, sourceKind: input.sourceKind,
      sourceReference: input.sourceId, note: 'گردش بازسازی‌شده هنگام بازیابی پشتیبان قدیمی',
    });
  };
  for (const invoice of invoices.filter((item) => item.status !== 'draft' && item.status !== 'void')) {
    for (const productId of new Set(invoice.items.map((item) => item.productId).filter((id): id is string => !!id && products.some((product) => product.id === id && product.kind === 'product')))) {
      const qty = invoice.items.filter((item) => item.productId === productId).reduce((sum, item) => sum + Number(item.qty || 0), 0);
      addMissingSourceMovement({ sourceType: 'invoice', sourceId: invoice.id, productId, expectedQuantity: invoice.kind === 'sale' ? -qty : qty, date: invoice.date,
        type: invoice.kind, action: 'finalize', sourceKind: invoice.kind });
    }
  }
  for (const document of data.returns.filter((item) => item.status === 'final')) {
    for (const productId of new Set(document.items.map((item) => item.productId).filter((id): id is string => !!id && products.some((product) => product.id === id && product.kind === 'product')))) {
      const qty = document.items.filter((item) => item.productId === productId).reduce((sum, item) => sum + Number(item.qty || 0), 0);
      addMissingSourceMovement({ sourceType: 'return', sourceId: document.id, productId, expectedQuantity: document.kind === 'sale-return' ? qty : -qty, date: document.date,
        type: document.kind, action: 'return-finalize', sourceKind: document.kind });
    }
  }
  if (!data.journalEntries.length) data.journalEntries = buildOpeningJournal(data, accounts);
  else {
    const existingSources = new Set(data.journalEntries.map((entry) => `${entry.sourceType}:${entry.sourceId}`));
    data.journalEntries.push(...buildOpeningJournal(data, accounts).filter((entry) => !existingSources.has(`${entry.sourceType}:${entry.sourceId}`)));
  }
  // Older exports sometimes carried payment state separately from invoice state.
  data.invoices = data.invoices.map((invoice) => {
    if (invoice.status === 'draft' || invoice.status === 'void') return invoice;
    const returned = data.returns.filter((document) => document.originalInvoiceId === invoice.id && document.status === 'final')
      .reduce((sum, document) => sum + Number(document.totalAmount || 0), 0);
    const settled = settledForInvoice(invoice, data.payments, data.checks);
    const remaining = Math.max(0, invoiceTotal(invoice) - returned);
    return { ...invoice, status: remaining <= 0.01 || settled >= remaining - 0.01 ? 'settled' as const : settled > 0.01 ? 'partial' as const : 'final' as const };
  });
  return data;
}

export async function createAccountingBackup(data: AccountingData) {
  const serializedData = JSON.stringify(data);
  const checksum = await sha256(serializedData);
  const envelope: AccountingBackupEnvelope = {
    format: ACCOUNTING_BACKUP_FORMAT,
    schemaVersion: ACCOUNTING_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ...(checksum ? { checksum } : {}),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

export async function parseAccountingBackup(text: string): Promise<{ data: AccountingData; preview: AccountingBackupPreview }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('فایل JSON قابل خواندن نیست.');
  }

  let source: AccountingBackupPreview['source'] = 'legacy';
  let schemaVersion = 0;
  let createdAt: string | undefined;
  let checksumVerified: boolean | null = null;
  let rawData: unknown = parsed;
  const warnings: string[] = [];

  if (isRecord(parsed) && parsed.format === ACCOUNTING_BACKUP_FORMAT && 'data' in parsed) {
    source = 'versioned';
    schemaVersion = Number(parsed.schemaVersion || 0);
    createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined;
    rawData = parsed.data;

    if (schemaVersion > ACCOUNTING_SCHEMA_VERSION) {
      warnings.push('نسخه این پشتیبان از نسخه فعلی برنامه جدیدتر است؛ بعضی فیلدها ممکن است شناخته نشوند.');
    }

    if (typeof parsed.checksum === 'string') {
      const actual = await sha256(JSON.stringify(rawData));
      if (actual) {
        checksumVerified = actual === parsed.checksum;
        if (!checksumVerified) throw new Error('Checksum فایل پشتیبان معتبر نیست؛ فایل ممکن است ناقص یا خراب شده باشد.');
      }
    } else {
      warnings.push('این پشتیبان Checksum ندارد.');
    }
  } else {
    warnings.push('پشتیبان قدیمی بدون schemaVersion شناسایی شد و هنگام بازیابی Migration می‌شود.');
  }

  const data = validateAccountingShape(rawData);
  const profiles = Array.isArray(data.settings?.businessProfiles) ? data.settings.businessProfiles.length : 0;

  if (!data.accounts.length || !data.journalEntries.length) {
    warnings.push('برخی داده‌های حسابداری نسخه‌های قدیمی هنگام Restore بازسازی خواهند شد.');
  }

  return {
    data,
    preview: {
      source,
      schemaVersion,
      createdAt,
      checksumVerified,
      customers: data.customers.length,
      products: data.products.length,
      invoices: data.invoices.length,
      returns: data.returns.length,
      payments: data.payments.length,
      checks: data.checks.length,
      journalEntries: data.journalEntries.length,
      businessProfiles: profiles,
      quotes: data.quotes.length,
      projects: data.projects.length,
      attachments: data.attachments.length,
      warnings,
    },
  };
}

export async function parseAccountingBackupFile(file: File): Promise<{ data: AccountingData; preview: AccountingBackupPreview; packaged: boolean }> {
  if (file.size > MAX_BACKUP_ARCHIVE_BYTES) throw new Error('حجم بسته پشتیبان از ۲۰۰ مگابایت بیشتر است.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const inspection = inspectZipArchive(bytes, MAX_BACKUP_EXPANDED_BYTES);
    if (!inspection.ok) throw new Error(inspection.reason === 'too-large' || inspection.reason === 'too-many-entries'
      ? 'حجم یا تعداد فایل‌های بازشده بسته بیش از حد مجاز است.'
      : 'ساختار فایل ZIP معتبر نیست.');
    let archive: Record<string, Uint8Array>;
    try { archive = unzipSync(bytes); }
    catch { throw new Error('بسته پشتیبان ZIP خراب است.'); }
    const manifest = archive['backup.json'];
    if (!manifest) throw new Error('فایل backup.json در بسته پیدا نشد.');
    const parsed = await parseAccountingBackup(strFromU8(manifest));
    const missingFiles = parsed.data.attachments.flatMap((item) => [item.storageKey, item.thumbnailKey].filter((key): key is string => !!key)).filter((key) => !archive[`attachments/${key}`]);
    if (missingFiles.length) throw new Error(`فایل پیوست در بسته موجود نیست: ${missingFiles[0]}`);
    return { ...parsed, packaged: true };
  }
  const parsed = await parseAccountingBackup(new TextDecoder().decode(bytes));
  if (parsed.data.attachments.length) {
    throw new Error('این فایل JSON فقط داده حسابداری را دارد و فایل‌های پیوست را شامل نمی‌شود؛ برای بازیابی پیوست‌ها از بسته ZIP کامل استفاده کنید.');
  }
  return { ...parsed, packaged: false };
}
