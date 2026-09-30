import type { AccountingData } from './types';
import { ACCOUNTING_SCHEMA_VERSION } from './storage';
import { strFromU8, unzipSync } from 'fflate';
import { inspectZipArchive } from './zip-limits';

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

  return {
    customers: raw.customers as AccountingData['customers'],
    products: raw.products as AccountingData['products'],
    invoices: raw.invoices as AccountingData['invoices'],
    returns: arrayOrEmpty(raw.returns) as AccountingData['returns'],
    payments: arrayOrEmpty(raw.payments) as AccountingData['payments'],
    checks: arrayOrEmpty(raw.checks) as AccountingData['checks'],
    adjustments: arrayOrEmpty(raw.adjustments) as AccountingData['adjustments'],
    stockMovements: arrayOrEmpty(raw.stockMovements) as AccountingData['stockMovements'],
    accounts: arrayOrEmpty(raw.accounts) as AccountingData['accounts'],
    journalEntries: arrayOrEmpty(raw.journalEntries) as AccountingData['journalEntries'],
    moneyTransactions: arrayOrEmpty(raw.moneyTransactions) as AccountingData['moneyTransactions'],
    quotes: arrayOrEmpty(raw.quotes) as AccountingData['quotes'],
    projects: arrayOrEmpty(raw.projects) as AccountingData['projects'],
    attachments: arrayOrEmpty(raw.attachments) as AccountingData['attachments'],
    settings: raw.settings as unknown as AccountingData['settings'],
  };
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
  return { ...(await parseAccountingBackup(new TextDecoder().decode(bytes))), packaged: false };
}
