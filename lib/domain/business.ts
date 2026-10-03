import {
  journalForCustomerAdjustment
} from '../accounting';
import { createEmptyAccountingData } from '../data';
import type {
  AccountAdjustment,
  BusinessSettings,
  Invoice
} from '../types';
import {
  uid as randomUid
} from '../utils';

import type { DomainContext } from './engine';
import { mirrorDefaultProfile, normalizeAccountingData, normalizeBusinessSettings } from './shared';

export function businessActions({ set, get, uid = randomUid }: DomainContext): Pick<import('./shared').AccountingState, 'upsertQuote' | 'setQuoteStatus' | 'convertQuoteToInvoice' | 'upsertProject' | 'addAttachment' | 'removeAttachment' | 'createBusinessProfile' | 'upsertBusinessProfile' | 'deleteBusinessProfile' | 'setDefaultBusinessProfile' | 'upsertCustomer' | 'deleteCustomer' | 'setSettings' | 'replaceAll' | 'resetAll'> {
  return {
    upsertQuote: (quote) => {
      const state = get();
      if (!state.customers.some((customer) => customer.id === quote.customerId)) return { ok: false, message: 'برای پیش‌فاکتور مشتری معتبر انتخاب کنید.' };
      if (!quote.number.trim() || !quote.items.length) return { ok: false, message: 'شماره و دست‌کم یک ردیف پیش‌فاکتور لازم است.' };
      if (state.quotes.some((item) => item.number === quote.number && item.id !== quote.id)) return { ok: false, message: 'شماره پیش‌فاکتور تکراری است.' };
      const existing = state.quotes.find((item) => item.id === quote.id);
      if (existing?.status === 'converted') return { ok: false, message: 'پیش‌فاکتور تبدیل‌شده قابل ویرایش نیست.' };
      const next = { ...quote, updatedAt: new Date().toISOString() };
      set({ quotes: existing ? state.quotes.map((item) => item.id === quote.id ? next : item) : [next, ...state.quotes] });
      return { ok: true };
    },

    setQuoteStatus: (id, status) => {
      const state = get();
      const quote = state.quotes.find((item) => item.id === id);
      if (!quote) return { ok: false, message: 'پیش‌فاکتور پیدا نشد.' };
      if (quote.status === 'converted') return { ok: false, message: 'وضعیت پیش‌فاکتور تبدیل‌شده تغییر نمی‌کند.' };
      set({ quotes: state.quotes.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item) });
      return { ok: true };
    },

    convertQuoteToInvoice: (id) => {
      const state = get();
      const quote = state.quotes.find((item) => item.id === id);
      if (!quote) return { ok: false, message: 'پیش‌فاکتور پیدا نشد.' };
      const linked = state.invoices.find((item) => item.id === quote.linkedInvoiceId || item.quoteId === id);
      if (linked) return { ok: true, invoice: linked };
      if (quote.status !== 'accepted') return { ok: false, message: 'فقط پیش‌فاکتور پذیرفته‌شده به فاکتور تبدیل می‌شود.' };
      if (!state.customers.some((customer) => customer.id === quote.customerId)) return { ok: false, message: 'مشتری پیش‌فاکتور دیگر معتبر نیست.' };
      const now = new Date().toISOString();
      const invoice: Invoice = {
        id: uid('invoice'), number: get().reserveDocumentNumber('sale'),
        businessProfileId: quote.businessProfileId || state.settings.defaultBusinessProfileId,
        templateId: state.settings.defaultInvoiceTemplateId, paperSize: state.settings.defaultInvoicePaperSize,
        kind: 'sale', status: 'draft', date: quote.date,
        customerId: quote.customerId, customerName: quote.customerName,
        customerPhone: quote.customerPhone, customerAddress: quote.customerAddress,
        items: quote.items.map((item) => ({ ...item, id: uid('item') })),
        discount: quote.discount, tax: quote.tax, shipping: quote.shipping, notes: quote.notes,
        createdAt: now, updatedAt: now, quoteId: quote.id, projectId: quote.projectId,
      };
      set({ invoices: [invoice, ...get().invoices], quotes: get().quotes.map((item) => item.id === id ? { ...item, status: 'converted', linkedInvoiceId: invoice.id, updatedAt: now } : item) });
      return { ok: true, invoice };
    },

    upsertProject: (project) => {
      const state = get();
      if (!state.customers.some((customer) => customer.id === project.customerId)) return { ok: false, message: 'برای پروژه مشتری معتبر انتخاب کنید.' };
      if (!project.title.trim()) return { ok: false, message: 'عنوان پروژه الزامی است.' };
      const exists = state.projects.some((item) => item.id === project.id);
      set({ projects: exists ? state.projects.map((item) => item.id === project.id ? { ...project, updatedAt: new Date().toISOString() } : item) : [{ ...project, updatedAt: new Date().toISOString() }, ...state.projects] });
      return { ok: true };
    },

    addAttachment: (attachment) => {
      const state = get();
      if (!state.projects.some((project) => project.id === attachment.projectId)) return { ok: false, message: 'پروژه پیوست پیدا نشد.' };
      set({ attachments: [attachment, ...state.attachments.filter((item) => item.id !== attachment.id)] });
      return { ok: true };
    },

    removeAttachment: (id) => set({ attachments: get().attachments.filter((item) => item.id !== id) }),

    createBusinessProfile: (profile) => {
      const state = get();
      if (!profile.label.trim() || !profile.businessName.trim()) {
        return { ok: false, message: 'عنوان پروفایل و نام کسب‌وکار الزامی است.' };
      }
      const profiles = state.settings.businessProfiles;
      const existingIds = new Set(profiles.map((item) => item.id));
      const baseId = profile.id.trim() || uid('business');
      let id = baseId;
      let suffix = 2;
      while (existingIds.has(id)) id = `${baseId}_${suffix++}`;
      const createdProfile = { ...profile, id };
      set({ settings: { ...state.settings, businessProfiles: [...profiles, createdProfile] } });
      return { ok: true, profile: createdProfile };
    },

    upsertBusinessProfile: (profile) => {
      const state = get();
      if (!profile.id.trim() || !profile.label.trim() || !profile.businessName.trim()) {
        return { ok: false, message: 'عنوان پروفایل و نام کسب‌وکار الزامی است.' };
      }
      const exists = state.settings.businessProfiles.some((item) => item.id === profile.id);
      const businessProfiles = exists
        ? state.settings.businessProfiles.map((item) => item.id === profile.id ? profile : item)
        : [...state.settings.businessProfiles, profile];
      let settings: BusinessSettings = { ...state.settings, businessProfiles };
      if (state.settings.defaultBusinessProfileId === profile.id) {
        settings = mirrorDefaultProfile(settings, profile);
      }
      set({ settings });
      return { ok: true };
    },

    deleteBusinessProfile: (id) => {
      const state = get();
      if (state.settings.businessProfiles.length <= 1) {
        return { ok: false, message: 'حداقل یک پروفایل کسب‌وکار باید باقی بماند.' };
      }
      if (state.settings.defaultBusinessProfileId === id) {
        return { ok: false, message: 'ابتدا یک پروفایل دیگر را پیش‌فرض کنید.' };
      }
      if (state.invoices.some((invoice) => invoice.businessProfileId === id)) {
        return { ok: false, message: 'این پروفایل در فاکتورهای موجود استفاده شده و برای حفظ تاریخچه چاپ قابل حذف نیست.' };
      }
      set({
        settings: {
          ...state.settings,
          businessProfiles: state.settings.businessProfiles.filter((profile) => profile.id !== id),
        },
      });
      return { ok: true };
    },

    setDefaultBusinessProfile: (id) => {
      const state = get();
      const profile = state.settings.businessProfiles.find((item) => item.id === id);
      if (!profile) return { ok: false, message: 'پروفایل پیدا نشد.' };
      set({
        settings: mirrorDefaultProfile({
          ...state.settings,
          defaultBusinessProfileId: id,
        }, profile),
      });
      return { ok: true };
    },

    upsertCustomer: (customer) =>
      set((state) => {
        const exists = state.customers.some((item) => item.id === customer.id);
        const customers = exists
          ? state.customers.map((item) => (item.id === customer.id ? customer : item))
          : [customer, ...state.customers];
        if (exists || Math.abs(Number(customer.openingBalance || 0)) <= 0.0001) return { customers };

        const opening: AccountAdjustment = {
          id: 'opening-customer-' + customer.id,
          customerId: customer.id,
          date: 'ابتدای دوره',
          amount: Number(customer.openingBalance || 0),
          note: 'مانده افتتاحیه ' + customer.name,
          createdAt: new Date().toISOString(),
        };
        return {
          customers,
          journalEntries: [...state.journalEntries, ...journalForCustomerAdjustment(opening, state.accounts)],
        };
      }),

    deleteCustomer: (id) => {
      const state = get();
      const used =
        state.invoices.some((invoice) => invoice.customerId === id) ||
        state.returns.some((document) => document.customerId === id) ||
        state.payments.some((payment) => payment.customerId === id) ||
        state.checks.some((check) => check.customerId === id) ||
        state.adjustments.some((adjustment) => adjustment.customerId === id);
      const relatedToQuotesOrProjects = state.quotes.some((quote) => quote.customerId === id) || state.projects.some((project) => project.customerId === id);
      if (used || relatedToQuotesOrProjects) {
        return { ok: false, message: 'این طرف حساب دارای سند یا گردش است و برای حفظ یکپارچگی سوابق قابل حذف نیست.' };
      }
      set({ customers: state.customers.filter((customer) => customer.id !== id) });
      return { ok: true };
    },

    setSettings: (settings) => set({ settings: normalizeBusinessSettings(settings) }),

    replaceAll: (data) => {
      set(normalizeAccountingData(data));
    },

    resetAll: () => {
      set(normalizeAccountingData(createEmptyAccountingData()));
    },
  };
}
