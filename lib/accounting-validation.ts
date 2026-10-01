import type { AccountingData } from './types';
import { invoiceTotal, paymentIsEffective, settledForInvoice } from './utils';

export interface AccountingValidationResult {
  ok: boolean;
  message?: string;
}

const EPSILON = 0.01;

function uniqueIds(values: Array<{ id: string }>, label: string): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id || seen.has(value.id)) return `شناسه ${label} خالی یا تکراری است.`;
    seen.add(value.id);
  }
  return null;
}

function finiteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateBusinessSettings(settings: AccountingData['settings']): AccountingValidationResult {
  if (!settings || !Array.isArray(settings.businessProfiles) || !settings.businessProfiles.length ||
      settings.businessProfiles.some((profile) => !profile || typeof profile.id !== 'string' || typeof profile.label !== 'string') ||
      !settings.numbering || typeof settings.numbering !== 'object') {
    return { ok: false, message: 'تنظیمات کسب‌وکار معتبر نیست.' };
  }
  if (!settings.businessProfiles.some((profile) => profile.id === settings.defaultBusinessProfileId)) {
    return { ok: false, message: 'پروفایل پیش‌فرض کسب‌وکار معتبر نیست.' };
  }
  const duplicateProfile = uniqueIds(settings.businessProfiles, 'پروفایل کسب‌وکار');
  if (duplicateProfile) return { ok: false, message: duplicateProfile };
  const sequenceKeys = ['sale', 'purchase', 'receipt', 'payment', 'check', 'quote'] as const;
  if (sequenceKeys.some((key) => {
    const item = settings.numbering[key];
    return !item || typeof item.prefix !== 'string' || !item.prefix || !Number.isInteger(item.next) || item.next < 1 ||
      !Number.isInteger(item.padding) || item.padding < 1;
  })) return { ok: false, message: 'تنظیمات شماره‌گذاری سند معتبر نیست.' };
  return { ok: true };
}

/** Settings commands leave historical invoices and inventory untouched. */
export function validateAccountingSettingsUpdate(previous: AccountingData, nextSettings: AccountingData['settings']): AccountingValidationResult {
  const settingsValidation = validateBusinessSettings(nextSettings);
  if (!settingsValidation.ok) return settingsValidation;
  const nextIds = new Set(nextSettings.businessProfiles.map((profile) => profile.id));
  const removedIds = new Set(previous.settings.businessProfiles.map((profile) => profile.id).filter((id) => !nextIds.has(id)));
  const linkedInvoice = previous.invoices.find((invoice) => removedIds.has(invoice.businessProfileId));
  if (linkedInvoice) return { ok: false, message: `پروفایل کسب‌وکار در فاکتور ${linkedInvoice.number} استفاده شده و حذف‌پذیر نیست.` };
  const linkedQuote = (previous.quotes || []).find((quote) => removedIds.has(quote.businessProfileId));
  if (linkedQuote) return { ok: false, message: `پروفایل کسب‌وکار در پیش‌فاکتور ${linkedQuote.number} استفاده شده و حذف‌پذیر نیست.` };
  return { ok: true };
}

function hasActiveJournal(data: AccountingData, sourceType: string, sourceId: string) {
  const reversed = new Set(data.journalEntries.map((entry) => entry.reversalOf).filter((id): id is string => Boolean(id)));
  return data.journalEntries.some((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId
    && ['post', 'revision-post', 'status-post'].includes(entry.action) && !reversed.has(entry.id));
}

export function validateAccountingData(data: AccountingData, previousData?: AccountingData): AccountingValidationResult {
  const groups: Array<[Array<{ id: string }>, string]> = [
    [data.customers, 'مشتری'], [data.products, 'کالا'], [data.invoices, 'فاکتور'], [data.returns, 'مرجوعی'],
    [data.payments, 'دریافت'], [data.checks, 'چک'], [data.adjustments, 'تعدیل'], [data.stockMovements, 'گردش انبار'],
    [data.accounts, 'حساب'], [data.journalEntries, 'سند حسابداری'], [data.moneyTransactions, 'تراکنش مالی'],
    [data.quotes || [], 'پیش‌فاکتور'], [data.projects || [], 'پروژه'], [data.attachments || [], 'پیوست'],
  ];
  for (const [rows, label] of groups) {
    const issue = uniqueIds(rows, label);
    if (issue) return { ok: false, message: issue };
  }

  const customerIds = new Set(data.customers.map((item) => item.id));
  const productIds = new Set(data.products.map((item) => item.id));
  const accountIds = new Set(data.accounts.map((item) => item.id));
  const invoiceById = new Map(data.invoices.map((item) => [item.id, item]));
  const checkById = new Map(data.checks.map((item) => [item.id, item]));
  const projectIds = new Set((data.projects || []).map((item) => item.id));
  const attachmentKeys = new Set<string>();

  const duplicateValue = <T>(values: T[], keyFor: (value: T) => string) => {
    const seen = new Set<string>();
    for (const value of values) {
      const key = keyFor(value).trim().toLocaleLowerCase();
      if (key && seen.has(key)) return true;
      if (key) seen.add(key);
    }
    return false;
  };
  if (duplicateValue(data.customers, (item) => item.code)) return { ok: false, message: 'کد طرف حساب تکراری است.' };
  if (duplicateValue(data.products.filter((item) => item.sku), (item) => item.sku || '')) return { ok: false, message: 'SKU تکراری است.' };
  if (duplicateValue(data.products.filter((item) => item.barcode), (item) => item.barcode || '')) return { ok: false, message: 'بارکد تکراری است.' };
  if (duplicateValue(data.invoices, (item) => `${item.kind}:${item.number}`)) return { ok: false, message: 'شماره فاکتور تکراری است.' };
  if (duplicateValue(data.returns, (item) => `${item.kind}:${item.number}`)) return { ok: false, message: 'شماره مرجوعی تکراری است.' };
  if (duplicateValue(data.payments, (item) => item.documentNumber)) return { ok: false, message: 'شماره سند دریافت/پرداخت تکراری است.' };
  if (duplicateValue(data.checks, (item) => item.documentNumber)) return { ok: false, message: 'شماره سند چک تکراری است.' };

  const settingsValidation = validateBusinessSettings(data.settings);
  if (!settingsValidation.ok) return settingsValidation;

  const previousProducts = new Map((previousData?.products || []).map((product) => [product.id, product]));
  for (const product of data.products) {
    const previous = previousProducts.get(product.id);
    const validOrUnchangedLegacyValue = (key: 'salePrice' | 'buyPrice' | 'averageCost' | 'stock' | 'minStock') =>
      finiteNonNegative(product[key]) || (previous !== undefined && product[key] === previous[key]);
    if (!(['salePrice', 'buyPrice', 'averageCost', 'stock', 'minStock'] as const).every(validOrUnchangedLegacyValue)) {
      return { ok: false, message: `قیمت یا موجودی کالای ${product.name} معتبر نیست.` };
    }
    if (Object.values(product.customerPrices || {}).some((value) => !finiteNonNegative(value)) || Object.values(product.customerGroupPrices || {}).some((value) => !finiteNonNegative(value))) {
      return { ok: false, message: `قیمت ویژه کالای ${product.name} معتبر نیست.` };
    }
  }

  for (const invoice of data.invoices) {
    if (!customerIds.has(invoice.customerId) || !data.settings.businessProfiles.some((item) => item.id === invoice.businessProfileId)) {
      return { ok: false, message: `مشتری یا مشخصات کسب‌وکار فاکتور ${invoice.number} معتبر نیست.` };
    }
    if (invoice.projectId && !projectIds.has(invoice.projectId)) return { ok: false, message: `پروژه فاکتور ${invoice.number} پیدا نشد.` };
    if (![invoice.discount, invoice.tax, invoice.shipping].every((value) => finiteNonNegative(value))) return { ok: false, message: `تخفیف، مالیات یا هزینه حمل فاکتور ${invoice.number} معتبر نیست.` };
    for (const item of invoice.items || []) {
      // Imported zero-quantity rows may be retained for audit after their invoice is voided.
      if (!finiteNonNegative(item.qty) || (invoice.status !== 'void' && item.qty <= 0) || !finiteNonNegative(item.unitPrice) || !finiteNonNegative(item.discount || 0)) {
        return { ok: false, message: `تعداد، قیمت یا تخفیف یکی از ردیف‌های فاکتور ${invoice.number} معتبر نیست.` };
      }
      if (item.productId && !productIds.has(item.productId)) return { ok: false, message: `کالای فاکتور ${invoice.number} پیدا نشد.` };
    }
    if (invoice.status !== 'draft' && invoice.status !== 'void' && invoice.items.length === 0) {
      return { ok: false, message: `فاکتور قطعی ${invoice.number} ردیف ندارد.` };
    }
    if (invoice.installments?.length) {
      if (invoice.installments.some((item) => !finiteNonNegative(item.amount) || item.amount <= 0 || !item.dueDate)) {
        return { ok: false, message: `برنامه اقساط فاکتور ${invoice.number} معتبر نیست.` };
      }
      const scheduleTotal = invoice.installments.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(scheduleTotal - invoiceTotal(invoice)) > EPSILON) return { ok: false, message: `جمع اقساط فاکتور ${invoice.number} با مبلغ فاکتور برابر نیست.` };
    }
  }

  const linkedQuoteInvoiceIds = new Set<string>();
  for (const quote of data.quotes || []) {
    if (!customerIds.has(quote.customerId) || (quote.projectId && !projectIds.has(quote.projectId))) return { ok: false, message: `مشتری یا پروژه پیش‌فاکتور ${quote.number} پیدا نشد.` };
    if (quote.linkedInvoiceId) {
      const linked = invoiceById.get(quote.linkedInvoiceId);
      if (!linked || linked.quoteId !== quote.id || linkedQuoteInvoiceIds.has(linked.id)) return { ok: false, message: `ارتباط پیش‌فاکتور ${quote.number} با فاکتور معتبر نیست.` };
      linkedQuoteInvoiceIds.add(linked.id);
    }
    if (quote.status === 'converted' && !quote.linkedInvoiceId) return { ok: false, message: `پیش‌فاکتور تبدیل‌شده ${quote.number} فاکتور مرتبط ندارد.` };
    for (const item of quote.items) {
      if (!finiteNonNegative(item.qty) || item.qty <= 0 || !finiteNonNegative(item.unitPrice) || (item.productId && !productIds.has(item.productId))) return { ok: false, message: `ردیف پیش‌فاکتور ${quote.number} معتبر نیست.` };
    }
  }
  for (const invoice of data.invoices.filter((item) => item.quoteId)) {
    if (!data.quotes.some((quote) => quote.id === invoice.quoteId && quote.linkedInvoiceId === invoice.id)) return { ok: false, message: `ارتباط فاکتور ${invoice.number} با پیش‌فاکتور معتبر نیست.` };
  }

  for (const check of data.checks) {
    if (!customerIds.has(check.customerId) || !finiteNonNegative(check.amount) || check.amount <= 0) {
      return { ok: false, message: `مبلغ یا طرف حساب چک ${check.documentNumber} معتبر نیست.` };
    }
  }

  const linkedChecks = new Set<string>();
  for (const payment of data.payments) {
    if (!customerIds.has(payment.customerId) || !finiteNonNegative(payment.amount) || payment.amount <= 0) {
      return { ok: false, message: `مبلغ یا طرف حساب دریافت ${payment.documentNumber} معتبر نیست.` };
    }
    const invoice = payment.invoiceId ? invoiceById.get(payment.invoiceId) : undefined;
    if (payment.invoiceId && !invoice) return { ok: false, message: `فاکتور دریافت ${payment.documentNumber} پیدا نشد.` };
    if (invoice && invoice.customerId !== payment.customerId) return { ok: false, message: `طرف حساب دریافت ${payment.documentNumber} با فاکتور همخوانی ندارد.` };
    if (payment.method === 'check') {
      const check = payment.checkId ? checkById.get(payment.checkId) : undefined;
      if (!check || linkedChecks.has(check.id) || Math.abs(check.amount - payment.amount) > EPSILON) {
        return { ok: false, message: `چک متصل به دریافت ${payment.documentNumber} نامعتبر یا تکراری است.` };
      }
      if (check.customerId !== payment.customerId || check.direction !== (payment.direction === 'receipt' ? 'received' : 'issued')) {
        return { ok: false, message: `چک دریافت ${payment.documentNumber} با طرف حساب یا جهت تراکنش سازگار نیست.` };
      }
      linkedChecks.add(check.id);
    } else if (payment.checkId) {
      return { ok: false, message: `دریافت غیرچکی ${payment.documentNumber} نباید به چک متصل باشد.` };
    }
  }

  for (const invoice of data.invoices.filter((item) => item.kind === 'sale' && item.status !== 'draft' && item.status !== 'void')) {
    const returned = data.returns.filter((item) => item.originalInvoiceId === invoice.id && item.status === 'final')
      .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const invoicePayments = data.payments.filter((payment) => payment.invoiceId === invoice.id && payment.direction === 'receipt');
    const effective = invoicePayments.filter((payment) => paymentIsEffective(payment, data.checks))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const reserved = invoicePayments.filter((payment) => payment.method === 'check' && !paymentIsEffective(payment, data.checks))
      .filter((payment) => checkById.get(payment.checkId || '')?.status === 'pending')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const available = Math.max(0, invoiceTotal(invoice) - returned);
    if (effective + reserved > available + EPSILON) {
      return { ok: false, message: `دریافت مؤثر و چک‌های در انتظار فاکتور ${invoice.number} از مانده قابل دریافت بیشتر است.` };
    }
  }

  for (const invoice of data.invoices.filter((item) => item.status !== 'draft' && item.status !== 'void')) {
    if (!hasActiveJournal(data, 'invoice', invoice.id)) return { ok: false, message: `سند حسابداری فاکتور قطعی ${invoice.number} ثبت نشده است.` };
    const expectedStatus = (() => {
      const returned = data.returns.filter((item) => item.originalInvoiceId === invoice.id && item.status === 'final')
        .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const settled = settledForInvoice(invoice, data.payments, data.checks);
      const remaining = Math.max(0, invoiceTotal(invoice) - returned);
      return remaining <= EPSILON || settled >= remaining - EPSILON ? 'settled' : settled > EPSILON ? 'partial' : 'final';
    })();
    if (invoice.status !== expectedStatus) return { ok: false, message: `وضعیت پرداخت فاکتور ${invoice.number} با دریافت‌ها و مرجوعی‌ها سازگار نیست.` };
    const invoiceProductIds = new Set(invoice.items.filter((item) => item.productId && data.products.find((product) => product.id === item.productId)?.kind === 'product').map((item) => item.productId!));
    for (const productId of invoiceProductIds) {
      const itemQuantity = invoice.items.filter((item) => item.productId === productId).reduce((sum, item) => sum + item.qty, 0);
      const expectedQuantity = invoice.kind === 'sale' ? -itemQuantity : itemQuantity;
      const movedQuantity = data.stockMovements.filter((movement) => movement.sourceType === 'invoice' && movement.sourceId === invoice.id && movement.productId === productId)
        .reduce((sum, movement) => sum + movement.quantity, 0);
      if (Math.abs(movedQuantity - expectedQuantity) > EPSILON) return { ok: false, message: `گردش انبار فاکتور ${invoice.number} با کالای «${data.products.find((item) => item.id === productId)?.name}» سازگار نیست.` };
    }
  }

  for (const document of data.returns.filter((item) => item.status === 'final')) {
    const original = invoiceById.get(document.originalInvoiceId);
    if (!original || original.status === 'draft' || original.status === 'void' || document.customerId !== original.customerId) {
      return { ok: false, message: `فاکتور اصلی مرجوعی ${document.number} معتبر نیست.` };
    }
    if (!hasActiveJournal(data, 'return', document.id)) return { ok: false, message: `سند حسابداری مرجوعی ${document.number} ثبت نشده است.` };
    for (const item of document.items) {
      const sourceItem = original.items.find((candidate) => candidate.id === item.originalItemId);
      if (!sourceItem || !finiteNonNegative(item.qty) || item.qty <= 0) return { ok: false, message: `ردیف مرجوعی ${document.number} معتبر نیست.` };
      const quantityReturned = data.returns.filter((candidate) => candidate.status === 'final' && candidate.originalInvoiceId === original.id)
        .flatMap((candidate) => candidate.items).filter((candidate) => candidate.originalItemId === item.originalItemId)
        .reduce((sum, candidate) => sum + candidate.qty, 0);
      if (quantityReturned > sourceItem.qty + EPSILON) return { ok: false, message: `تعداد مرجوعی فاکتور ${original.number} از تعداد فروش بیشتر است.` };
    }
    const returnProductIds = new Set(document.items.filter((item) => item.productId && data.products.find((product) => product.id === item.productId)?.kind === 'product').map((item) => item.productId!));
    for (const productId of returnProductIds) {
      const itemQuantity = document.items.filter((item) => item.productId === productId).reduce((sum, item) => sum + item.qty, 0);
      const expectedQuantity = document.kind === 'sale-return' ? itemQuantity : -itemQuantity;
      const movedQuantity = data.stockMovements.filter((movement) => movement.sourceType === 'return' && movement.sourceId === document.id && movement.productId === productId)
        .reduce((sum, movement) => sum + movement.quantity, 0);
      if (Math.abs(movedQuantity - expectedQuantity) > EPSILON) return { ok: false, message: `گردش انبار مرجوعی ${document.number} با کالا «${data.products.find((item) => item.id === productId)?.name}» سازگار نیست.` };
    }
  }

  for (const payment of data.payments) {
    const effective = paymentIsEffective(payment, data.checks);
    const shouldHaveJournal = payment.method !== 'check' || effective;
    if (shouldHaveJournal !== hasActiveJournal(data, 'payment', payment.id)) {
      return { ok: false, message: `اثر حسابداری دریافت/پرداخت ${payment.documentNumber} با وضعیت وصول آن سازگار نیست.` };
    }
  }

  for (const movement of data.stockMovements) {
    if (!productIds.has(movement.productId) || !Number.isFinite(movement.quantity) || !Number.isFinite(movement.balanceAfter)) {
      return { ok: false, message: 'گردش انبار به کالا نامعتبر متصل است یا مقدار عددی آن نادرست است.' };
    }
  }

  for (const entry of data.journalEntries) {
    if (!entry.lines?.length) return { ok: false, message: `سند حسابداری ${entry.description || entry.id} ردیف ندارد.` };
    let debits = 0;
    let credits = 0;
    for (const line of entry.lines) {
      if (!accountIds.has(line.accountId) || !finiteNonNegative(line.debit) || !finiteNonNegative(line.credit) || (line.debit > EPSILON && line.credit > EPSILON)) {
        return { ok: false, message: `ردیف سند حسابداری ${entry.description || entry.id} معتبر نیست.` };
      }
      debits += line.debit;
      credits += line.credit;
    }
    if (Math.abs(debits - credits) > EPSILON) return { ok: false, message: `سند حسابداری ${entry.description || entry.id} تراز نیست.` };
  }

  for (const transaction of data.moneyTransactions) {
    if (!finiteNonNegative(transaction.amount) || transaction.amount <= 0 || !accountIds.has(transaction.settlementAccountId) || !accountIds.has(transaction.categoryAccountId)) {
      return { ok: false, message: `تراکنش مالی ${transaction.description} معتبر نیست.` };
    }
    if (transaction.projectId && !projectIds.has(transaction.projectId)) return { ok: false, message: `پروژه تراکنش مالی ${transaction.description} پیدا نشد.` };
    if (transaction.status === 'final' && !hasActiveJournal(data, 'money-transaction', transaction.id)) return { ok: false, message: `سند حسابداری تراکنش «${transaction.description}» ثبت نشده است.` };
  }
  for (const project of data.projects || []) {
    if (!customerIds.has(project.customerId)) return { ok: false, message: `مشتری پروژه ${project.title} پیدا نشد.` };
  }
  for (const attachment of data.attachments || []) {
    const isPdf = attachment.mimeType === 'application/pdf';
    const storageKeyValid = /^[0-9a-f-]{36}\.(?:webp|pdf)$/.test(attachment.storageKey) && (isPdf ? attachment.storageKey.endsWith('.pdf') : attachment.storageKey.endsWith('.webp'));
    const thumbnailValid = isPdf ? !attachment.thumbnailKey : (!attachment.thumbnailKey || /^[0-9a-f-]{36}-thumb\.webp$/.test(attachment.thumbnailKey));
    const keys = [attachment.storageKey, attachment.thumbnailKey].filter((key): key is string => !!key);
    if (!projectIds.has(attachment.projectId) || !['application/pdf', 'image/webp'].includes(attachment.mimeType) || !storageKeyValid || !thumbnailValid || !finiteNonNegative(attachment.size) || keys.some((key) => attachmentKeys.has(key))) {
      return { ok: false, message: `مشخصات فایل یا پروژه پیوست ${attachment.filename} معتبر نیست.` };
    }
    for (const key of keys) attachmentKeys.add(key);
  }

  return { ok: true };
}

export function validateAccountingTransition(previous: AccountingData, next: AccountingData): AccountingValidationResult {
  const previousInvoices = new Map(previous.invoices.map((item) => [item.id, item]));
  const nextInvoices = new Map(next.invoices.map((item) => [item.id, item]));
  const changedInvoiceIds = new Set<string>();
  const invoiceFinancialSignature = (invoice: AccountingData['invoices'][number]) => JSON.stringify({
    kind: invoice.kind, number: invoice.number, businessProfileId: invoice.businessProfileId, date: invoice.date,
    customerId: invoice.customerId, items: invoice.items, discount: invoice.discount, tax: invoice.tax, shipping: invoice.shipping,
    projectId: invoice.projectId, quoteId: invoice.quoteId, dueDate: invoice.dueDate, installments: invoice.installments,
  });
  for (const before of previous.invoices) {
    const after = nextInvoices.get(before.id);
    if (!after) {
      if (before.status !== 'draft') return { ok: false, message: `فاکتور قطعی ${before.number} حذف‌پذیر نیست.` };
      continue;
    }
    if (before.status === 'void' && after.status !== 'void') return { ok: false, message: `فاکتور باطل‌شده ${before.number} قابل فعال‌سازی مجدد نیست.` };
    if (before.status !== 'draft' && invoiceFinancialSignature(before) !== invoiceFinancialSignature(after)) {
      const recordedRevision = after.auditTrail?.some((entry) => entry.action === 'revised' && entry.revision === after.revision);
      if (!recordedRevision || Number(after.revision || 0) <= Number(before.revision || 0)) return { ok: false, message: `تغییر فاکتور قطعی ${before.number} باید با Revision ثبت شود.` };
      changedInvoiceIds.add(before.id);
    }
    if (before.status === 'draft' && after.status !== 'draft' && after.status !== 'void') {
      if (!after.auditTrail?.some((entry) => entry.action === 'finalized')) return { ok: false, message: `قطعی‌کردن فاکتور ${after.number} در تاریخچه سند ثبت نشده است.` };
      changedInvoiceIds.add(before.id);
    }
    if (before.status !== 'void' && after.status === 'void' && !after.voidReason?.trim()) return { ok: false, message: `دلیل ابطال فاکتور ${before.number} الزامی است.` };
    if (before.status !== 'void' && after.status === 'void') changedInvoiceIds.add(before.id);
  }
  for (const invoice of next.invoices) {
    if (!previousInvoices.has(invoice.id) && invoice.status !== 'draft' && invoice.status !== 'void') {
      if (!invoice.auditTrail?.some((entry) => entry.action === 'finalized')) return { ok: false, message: `قطعی‌کردن فاکتور ${invoice.number} در تاریخچه سند ثبت نشده است.` };
      changedInvoiceIds.add(invoice.id);
    }
  }

  const previousReturns = new Map(previous.returns.map((item) => [item.id, item]));
  const nextReturns = new Map(next.returns.map((item) => [item.id, item]));
  const changedReturnIds = new Set<string>();
  for (const before of previous.returns) {
    const after = nextReturns.get(before.id);
    if (!after) {
      if (before.status !== 'draft') return { ok: false, message: `مرجوعی قطعی ${before.number} حذف‌پذیر نیست.` };
      continue;
    }
    if (before.status === 'final' && JSON.stringify({ number: before.number, kind: before.kind, originalInvoiceId: before.originalInvoiceId, customerId: before.customerId, date: before.date, items: before.items, totalAmount: before.totalAmount }) !== JSON.stringify({ number: after.number, kind: after.kind, originalInvoiceId: after.originalInvoiceId, customerId: after.customerId, date: after.date, items: after.items, totalAmount: after.totalAmount })) {
      return { ok: false, message: `تغییر مرجوعی قطعی ${before.number} مجاز نیست؛ آن را ابطال و سند تازه بسازید.` };
    }
    if (before.status === 'draft' && after.status === 'final') {
      if (!after.auditTrail?.some((entry) => entry.action === 'finalized')) return { ok: false, message: `قطعی‌کردن مرجوعی ${after.number} در تاریخچه سند ثبت نشده است.` };
      changedReturnIds.add(before.id);
    }
    if (before.status === 'final' && after.status === 'void') {
      if (!after.voidReason?.trim() || !after.auditTrail?.some((entry) => entry.action === 'voided')) return { ok: false, message: `ابطال مرجوعی ${before.number} باید با دلیل ثبت شود.` };
      changedReturnIds.add(before.id);
    }
  }
  for (const document of next.returns) {
    if (!previousReturns.has(document.id) && document.status === 'final') {
      if (!document.auditTrail?.some((entry) => entry.action === 'finalized')) return { ok: false, message: `قطعی‌کردن مرجوعی ${document.number} در تاریخچه سند ثبت نشده است.` };
      changedReturnIds.add(document.id);
    }
  }

  const changedPaymentIds = new Set<string>();
  const nextPayments = new Map(next.payments.map((item) => [item.id, item]));
  for (const before of previous.payments) {
    const after = nextPayments.get(before.id);
    if (!after) { changedPaymentIds.add(before.id); continue; }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return { ok: false, message: `مشخصات دریافت/پرداخت ${before.documentNumber} تغییرناپذیر است؛ سند قبلی را ابطال کنید.` };
    }
  }
  for (const payment of next.payments) if (!previous.payments.some((item) => item.id === payment.id)) changedPaymentIds.add(payment.id);
  const changedCheckIds = new Set<string>();
  const nextChecks = new Map(next.checks.map((item) => [item.id, item]));
  for (const before of previous.checks) {
    const after = nextChecks.get(before.id);
    if (!after || JSON.stringify(before) !== JSON.stringify(after)) changedCheckIds.add(before.id);
  }
  for (const check of next.checks) if (!previous.checks.some((item) => item.id === check.id)) changedCheckIds.add(check.id);
  for (const checkId of changedCheckIds) {
    const linkedPayment = next.payments.find((payment) => payment.checkId === checkId);
    if (linkedPayment) changedPaymentIds.add(linkedPayment.id);
  }

  const changedMoneyIds = new Set<string>();
  const nextMoney = new Map(next.moneyTransactions.map((item) => [item.id, item]));
  for (const before of previous.moneyTransactions) {
    const after = nextMoney.get(before.id);
    if (!after || JSON.stringify(before) !== JSON.stringify(after)) changedMoneyIds.add(before.id);
    if (after && before.status === 'final' && after.status !== 'void' && JSON.stringify({ kind: before.kind, date: before.date, amount: before.amount, settlementAccountId: before.settlementAccountId, categoryAccountId: before.categoryAccountId, projectId: before.projectId }) !== JSON.stringify({ kind: after.kind, date: after.date, amount: after.amount, settlementAccountId: after.settlementAccountId, categoryAccountId: after.categoryAccountId, projectId: after.projectId })) {
      return { ok: false, message: `تغییر تراکنش قطعی ${before.description} مجاز نیست؛ آن را ابطال و سند تازه بسازید.` };
    }
    if (after && before.status === 'final' && after.status === 'void' && !after.voidReason?.trim()) return { ok: false, message: `دلیل ابطال تراکنش ${before.description} الزامی است.` };
  }
  for (const transaction of next.moneyTransactions) if (!previous.moneyTransactions.some((item) => item.id === transaction.id)) changedMoneyIds.add(transaction.id);
  const changedAdjustmentIds = new Set<string>();
  for (const item of next.adjustments) if (!previous.adjustments.some((before) => before.id === item.id && JSON.stringify(before) === JSON.stringify(item))) changedAdjustmentIds.add(item.id);
  for (const item of previous.adjustments) if (!next.adjustments.some((after) => after.id === item.id)) changedAdjustmentIds.add(item.id);
  const changedMovementSourceIds = new Set<string>();
  for (const item of [...next.stockMovements.filter((after) => !previous.stockMovements.some((before) => before.id === after.id && JSON.stringify(before) === JSON.stringify(after))), ...previous.stockMovements.filter((before) => !next.stockMovements.some((after) => after.id === before.id))]) changedMovementSourceIds.add(item.sourceId);

  const previousJournals = new Map(previous.journalEntries.map((item) => [item.id, item]));
  const changedJournals = next.journalEntries.filter((item) => !previousJournals.has(item.id) || JSON.stringify(previousJournals.get(item.id)) !== JSON.stringify(item));
  if (previous.journalEntries.some((before) => !next.journalEntries.some((after) => after.id === before.id))) return { ok: false, message: 'حذف مستقیم سند حسابداری مجاز نیست.' };
  for (const entry of changedJournals) {
    const allowed = entry.sourceType === 'invoice' ? changedInvoiceIds.has(entry.sourceId)
      : entry.sourceType === 'return' ? changedReturnIds.has(entry.sourceId)
        : entry.sourceType === 'payment' ? changedPaymentIds.has(entry.sourceId)
          : entry.sourceType === 'money-transaction' ? changedMoneyIds.has(entry.sourceId)
            : changedAdjustmentIds.has(entry.sourceId) || changedMovementSourceIds.has(entry.sourceId) || entry.sourceId === 'opening-inventory';
    if (!allowed) return { ok: false, message: `ثبت یا تغییر سند حسابداری «${entry.description}» از یک عملیات مالی معتبر نیامده است.` };
  }
  return { ok: true };
}
