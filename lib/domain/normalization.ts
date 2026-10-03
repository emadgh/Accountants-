import {
  buildOpeningJournal,
  normalizeAccounts
} from '../accounting';
import { createEmptyAccountingData } from '../data';
import { isInvoicePaperSize, isInvoiceTemplateId } from '../invoice-templates';
import { normalizeStoredDate } from '../standards';
import type {
  AccountingData,
  BusinessProfile,
  BusinessSettings,
  Customer
} from '../types';
import {
  expectedPaymentDirection,
  resolvedPaymentDirection
} from '../utils';

import { buildOpeningMovements, normalizeProducts } from './inventory-engine';
import { withInvoiceStatuses } from './invoice-engine';
export function legacyBusinessProfile(settings: BusinessSettings): BusinessProfile {
  return {
    id: 'business_default',
    label: 'پروفایل اصلی',
    businessName: settings.businessName || '',
    ownerName: settings.ownerName || '',
    phone: settings.phone || '',
    address: settings.address || '',
    nationalId: settings.nationalId || '',
    economicCode: settings.economicCode || '',
    postalCode: settings.postalCode || '',
    cardNumber: settings.cardNumber || '',
    iban: settings.iban || '',
    bankName: settings.bankName || '',
    invoiceTitle: settings.invoiceTitle || 'فاکتور فروش',
    footer: settings.footer || '',
  };
}

export function mirrorDefaultProfile(settings: BusinessSettings, profile: BusinessProfile): BusinessSettings {
  return {
    ...settings,
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    phone: profile.phone,
    address: profile.address,
    nationalId: profile.nationalId,
    economicCode: profile.economicCode,
    postalCode: profile.postalCode,
    cardNumber: profile.cardNumber,
    iban: profile.iban,
    bankName: profile.bankName,
    invoiceTitle: profile.invoiceTitle,
    footer: profile.footer,
  };
}

export function normalizeBusinessSettings(input?: Partial<BusinessSettings>): BusinessSettings {
  const defaults = createEmptyAccountingData().settings;
  const base: BusinessSettings = {
    ...defaults,
    ...(input || {}),
    numbering: {
      ...defaults.numbering,
      ...(input?.numbering || {}),
    },
    businessProfiles: [],
    defaultBusinessProfileId: '',
  };

  const sourceProfiles = input?.businessProfiles?.length
    ? input.businessProfiles
    : [legacyBusinessProfile(base)];
  const profiles = sourceProfiles.map((profile, index) => ({
    ...legacyBusinessProfile(base),
    ...profile,
    id: profile.id || 'business_' + (index + 1),
    label: profile.label?.trim() || profile.businessName?.trim() || 'پروفایل ' + (index + 1),
  }));
  const requestedDefault = input?.defaultBusinessProfileId;
  const defaultBusinessProfileId = profiles.some((profile) => profile.id === requestedDefault)
    ? requestedDefault!
    : profiles[0].id;
  const normalized: BusinessSettings = {
    ...base,
    businessProfiles: profiles,
    defaultBusinessProfileId,
    defaultInvoiceTemplateId: isInvoiceTemplateId(input?.defaultInvoiceTemplateId)
      ? input.defaultInvoiceTemplateId
      : defaults.defaultInvoiceTemplateId,
    defaultInvoicePaperSize: isInvoicePaperSize(input?.defaultInvoicePaperSize)
      ? input.defaultInvoicePaperSize
      : defaults.defaultInvoicePaperSize,
  };
  return mirrorDefaultProfile(
    normalized,
    profiles.find((profile) => profile.id === defaultBusinessProfileId) || profiles[0]
  );
}

export function normalizeImportedPayments(data: Pick<AccountingData, 'payments' | 'invoices'>) {
  return data.payments.map((payment) => {
    const invoice = payment.invoiceId ? data.invoices.find((item) => item.id === payment.invoiceId) : undefined;
    return {
      ...payment,
      direction: invoice ? expectedPaymentDirection(invoice) : resolvedPaymentDirection(payment),
    };
  });
}

export function normalizeAccountingData(data: AccountingData): AccountingData {
  const settings = normalizeBusinessSettings(data.settings);
  const customers: Customer[] = (data.customers || []).map((customer) => ({
    ...customer,
    status: customer.status === 'archived' ? 'archived' : 'active',
    openingBalance: Number(customer.openingBalance || 0),
  }));
  const products = normalizeProducts(data.products || []);
  const invoices = (data.invoices || []).map((invoice) => {
    let customerId = invoice.customerId;
    if (!customerId || !customers.some((customer) => customer.id === customerId)) {
      customerId ||= `legacy_customer_${invoice.id}`;
      if (!customers.some((customer) => customer.id === customerId)) {
        customers.push({
          id: customerId,
          code: `LEGACY-${customers.length + 1}`,
          name: invoice.customerName?.trim() || 'طرف حساب قدیمی',
          kind: invoice.kind === 'sale' ? 'customer' : 'supplier',
          status: 'active', phone: invoice.customerPhone || '', address: invoice.customerAddress || '',
          nationalId: invoice.customerNationalId || '', economicCode: invoice.customerEconomicCode || '',
          postalCode: invoice.customerPostalCode || '', openingBalance: 0,
          notes: 'رکورد خودکار برای حفظ ارتباط فاکتور قدیمی',
        });
      }
    }
    return {
      ...invoice,
      customerId,
      businessProfileId: invoice.businessProfileId || settings.defaultBusinessProfileId,
      templateId: isInvoiceTemplateId(invoice.templateId) ? invoice.templateId : 'classic',
      date: normalizeStoredDate(invoice.date),
      ...(invoice.dueDate ? { dueDate: normalizeStoredDate(invoice.dueDate) } : {}),
      installments: (invoice.installments || []).map((installment) => ({ ...installment, amount: Number(installment.amount || 0), dueDate: normalizeStoredDate(installment.dueDate) })),
      items: (invoice.items || []).map((item) => ({
        ...item,
        discount: Math.max(0, Number(item.discount || 0)),
        ...(item.discountPercent == null ? {} : { discountPercent: Math.max(0, Number(item.discountPercent || 0)) }),
      })),
    };
  });
  const returns = (data.returns || []).map((document) => ({ ...document, date: normalizeStoredDate(document.date) }));
  const checks = (data.checks || []).map((check, index) => ({
    ...check,
    documentNumber: check.documentNumber || 'C-' + String(index + 1).padStart(6, '0'),
    dueDate: normalizeStoredDate(check.dueDate),
  }));
  const rawPayments = (data.payments || []).map((payment, index) => ({
    ...payment,
    documentNumber: payment.documentNumber || (payment.direction === 'payment' ? 'PY-' : 'R-') + String(index + 1).padStart(6, '0'),
    date: normalizeStoredDate(payment.date),
  }));
  const payments = normalizeImportedPayments({ invoices, payments: rawPayments });
  const adjustments = (data.adjustments || []).map((item) => ({ ...item, date: normalizeStoredDate(item.date) }));
  const stockMovements = (data.stockMovements?.length ? data.stockMovements : buildOpeningMovements(products)).map((movement) => ({
    ...movement,
    date: movement.date === 'ابتدای دوره' ? movement.date : normalizeStoredDate(movement.date),
  }));
  const accounts = normalizeAccounts(data.accounts || []);
  const journalEntries = (data.journalEntries || []).map((entry) => ({
    ...entry,
    date: entry.date === 'ابتدای دوره' ? entry.date : normalizeStoredDate(entry.date),
  }));
  const moneyTransactions = (data.moneyTransactions || []).map((transaction) => ({
    ...transaction,
    date: normalizeStoredDate(transaction.date),
  }));
  const quotes = (data.quotes || []).map((quote) => ({
    ...quote,
    date: normalizeStoredDate(quote.date),
    ...(quote.validUntil ? { validUntil: normalizeStoredDate(quote.validUntil) } : {}),
    items: quote.items || [],
  }));
  const projects = (data.projects || []).map((project) => ({
    ...project,
    dueDate: project.dueDate ? normalizeStoredDate(project.dueDate) : undefined,
    agreedAmount: Number(project.agreedAmount || 0),
  }));
  const attachments = data.attachments || [];

  const base: AccountingData = {
    customers,
    products,
    invoices: withInvoiceStatuses(invoices, payments, checks, returns),
    returns,
    payments,
    checks,
    adjustments,
    stockMovements,
    accounts,
    journalEntries,
    moneyTransactions,
    quotes,
    projects,
    attachments,
    settings,
  };

  return {
    ...base,
    journalEntries: base.journalEntries.length ? base.journalEntries : buildOpeningJournal(base, accounts),
  };
}

