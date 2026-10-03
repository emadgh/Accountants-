import {
  journalForInvoice,
  journalForPayment,
  journalForReturn,
  reverseActiveSourceEntries
} from '../accounting';
import { seedData } from '../data';
import { INVOICE_TEMPLATES, isInvoicePaperSize, isInvoiceTemplateId } from '../invoice-templates';
import { formatDocumentNumber } from '../standards';
import type {
  BusinessSettings,
  Invoice,
  ReturnDocument
} from '../types';
import {
  invoiceOutstandingAmount,
  invoiceReservedByPendingChecks,
  invoiceTotal,
  uid as randomUid,
  returnDocumentAmount
} from '../utils';

import type { DomainContext } from './engine';
import { appendAudit, appendReturnAudit, applyInvoiceInventory, applyReturnInventory, isPosted, normalizeForDraft, normalizeReturnItems, partialInvoiceContentSignature, validateInstallments, validatePosting, validateReturn, withInvoiceStatuses } from './shared';

export function documentsActions({ set, get, uid = randomUid }: DomainContext): Pick<import('./shared').AccountingState, 'reserveDocumentNumber' | 'saveInvoiceDraft' | 'setInvoiceTemplate' | 'setInvoicePaperSize' | 'finalizeInvoice' | 'finalizeInvoiceWithPayment' | 'reviseInvoice' | 'voidInvoice' | 'deleteInvoice' | 'saveReturnDraft' | 'finalizeReturn' | 'voidReturn' | 'deleteReturn'> {
  return {
    reserveDocumentNumber: (key) => {
      const state = get();
      const current = state.settings.numbering[key] || seedData.settings.numbering[key];
      const used = new Set<string>();
      if (key === 'sale' || key === 'purchase') {
        state.invoices.filter((invoice) => invoice.kind === key).forEach((invoice) => used.add(invoice.number.trim()));
      } else if (key === 'quote') {
        state.quotes.forEach((quote) => used.add(quote.number.trim()));
      } else if (key === 'receipt' || key === 'payment') {
        state.payments
          .filter((payment) => payment.direction === key)
          .forEach((payment) => used.add(payment.documentNumber.trim()));
      } else {
        state.checks.forEach((check) => used.add(check.documentNumber.trim()));
      }

      let next = Math.max(1, Number(current.next || 1));
      let candidate = formatDocumentNumber({ ...current, next });
      while (used.has(candidate)) {
        next++;
        candidate = formatDocumentNumber({ ...current, next });
      }

      set({
        settings: {
          ...state.settings,
          numbering: {
            ...state.settings.numbering,
            [key]: { ...current, next: next + 1 },
          },
        },
      });
      return candidate;
    },

    saveInvoiceDraft: (invoice) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === invoice.id);
      if (previous && previous.status !== 'draft') {
        return { ok: false, message: 'سند قطعی را نمی‌توان به پیش‌نویس برگرداند. برای تغییر از ثبت Revision استفاده کنید.' };
      }
      if (!invoice.customerId || !state.customers.some((customer) => customer.id === invoice.customerId)) {
        return { ok: false, message: 'طرف حساب معتبر را انتخاب یا در همین فاکتور ایجاد کنید.' };
      }
      const schedule = validateInstallments(invoice);
      if (!schedule.ok) return schedule;

      const next = normalizeForDraft(invoice, previous);
      const invoices = previous
        ? state.invoices.map((item) => (item.id === next.id ? next : item))
        : [next, ...state.invoices];
      set({ invoices });
      return { ok: true, invoice: next };
    },

    setInvoiceTemplate: (id, templateId) => {
      if (!isInvoiceTemplateId(templateId)) return { ok: false, message: 'قالب فاکتور معتبر نیست.' };
      const state = get();
      const previous = state.invoices.find((invoice) => invoice.id === id);
      if (!previous) return { ok: false, message: 'فاکتور برای تغییر قالب پیدا نشد.' };
      if (previous.templateId === templateId) return { ok: true, invoice: previous };

      const previousLabel = INVOICE_TEMPLATES.find((template) => template.id === previous.templateId)?.label || 'کلاسیک';
      const nextLabel = INVOICE_TEMPLATES.find((template) => template.id === templateId)?.label || 'کلاسیک';
      const next: Invoice = {
        ...previous,
        templateId,
        updatedAt: new Date().toISOString(),
        auditTrail: appendAudit(previous, 'template_changed', previous.revision || 0, `قالب چاپ: ${previousLabel} ← ${nextLabel}`),
      };
      set({ invoices: state.invoices.map((invoice) => invoice.id === id ? next : invoice) });
      return { ok: true, invoice: next };
    },

    setInvoicePaperSize: (id, paperSize) => {
      if (!isInvoicePaperSize(paperSize)) return { ok: false, message: 'اندازه کاغذ فاکتور معتبر نیست.' };
      const state = get();
      const previous = state.invoices.find((invoice) => invoice.id === id);
      if (!previous) return { ok: false, message: 'فاکتور برای تغییر اندازه کاغذ پیدا نشد.' };
      const previousPaperSize = previous.paperSize || 'A4';
      if (previousPaperSize === paperSize) return { ok: true, invoice: previous };

      const next: Invoice = {
        ...previous,
        paperSize,
        updatedAt: new Date().toISOString(),
        auditTrail: appendAudit(previous, 'paper_size_changed', previous.revision || 0, `اندازه کاغذ: ${previousPaperSize} ← ${paperSize}`),
      };
      set({ invoices: state.invoices.map((invoice) => invoice.id === id ? next : invoice) });
      return { ok: true, invoice: next };
    },

    finalizeInvoice: (invoice) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === invoice.id);
      if (previous && previous.status !== 'draft') {
        return { ok: false, message: 'این فاکتور قبلاً قطعی شده است.' };
      }
      const schedule = validateInstallments(invoice);
      if (!schedule.ok) return schedule;

      const now = new Date().toISOString();
      const revision = Math.max(1, previous?.revision || invoice.revision || 0);
      const base: Invoice = {
        ...invoice,
        status: 'final',
        revision,
        finalizedAt: previous?.finalizedAt || now,
        voidedAt: undefined,
        voidReason: undefined,
        createdAt: previous?.createdAt || invoice.createdAt || now,
        updatedAt: now,
        auditTrail: previous?.auditTrail || invoice.auditTrail || [],
      };
      const next: Invoice = { ...base, auditTrail: appendAudit(base, 'finalized', revision) };
      const valid = validatePosting(state.customers, state.products, next, state.invoices);
      if (!valid.ok) return valid;

      const inventory = applyInvoiceInventory(state.products, state.stockMovements, next, 1, 'finalize');
      if (!inventory.ok) return { ok: false, message: inventory.message };
      const merged = previous
        ? state.invoices.map((item) => (item.id === next.id ? next : item))
        : [next, ...state.invoices];
      const invoices = withInvoiceStatuses(merged, state.payments, state.checks, state.returns);
      const saved = invoices.find((item) => item.id === next.id) || next;
      const newMovements = inventory.stockMovements.slice(state.stockMovements.length);
      const journalEntries = [
        ...state.journalEntries,
        ...journalForInvoice(next, state.products, newMovements, state.accounts, 'post'),
      ];
      set({ products: inventory.products, stockMovements: inventory.stockMovements, invoices, journalEntries });
      return { ok: true, invoice: saved };
    },

    finalizeInvoiceWithPayment: (invoice, payment) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === invoice.id);
      if (previous && previous.status !== 'draft') return { ok: false, message: 'این فاکتور قبلاً قطعی شده است.' };
      const schedule = validateInstallments(invoice);
      if (!schedule.ok) return schedule;
      const now = new Date().toISOString();
      const revision = Math.max(1, previous?.revision || invoice.revision || 0);
      const base: Invoice = {
        ...invoice, status: 'final', revision, finalizedAt: previous?.finalizedAt || now,
        voidedAt: undefined, voidReason: undefined, createdAt: previous?.createdAt || invoice.createdAt || now,
        updatedAt: now, auditTrail: previous?.auditTrail || invoice.auditTrail || [],
      };
      const next: Invoice = { ...base, auditTrail: appendAudit(base, 'finalized', revision) };
      const valid = validatePosting(state.customers, state.products, next, state.invoices);
      if (!valid.ok) return valid;
      const saleSequence = state.settings.numbering.sale;
      const receiptSequence = state.settings.numbering.receipt;
      if (invoice.number !== formatDocumentNumber(saleSequence) || (payment && payment.documentNumber !== formatDocumentNumber(receiptSequence))) {
        return { ok: false, message: 'شماره اسناد تغییر کرده است؛ فروش را دوباره ثبت کنید.' };
      }
      if (payment) {
        if (!['cash', 'card'].includes(payment.method)) return { ok: false, message: 'فروش سریع فقط دریافت نقد یا کارت را می‌پذیرد.' };
        if (payment.invoiceId !== next.id || payment.customerId !== next.customerId || payment.direction !== 'receipt') {
          return { ok: false, message: 'مشخصات دریافت با فاکتور فروش همخوانی ندارد.' };
        }
        if (!Number.isFinite(payment.amount) || payment.amount <= 0 || payment.amount > invoiceTotal(next)) {
          return { ok: false, message: 'مبلغ دریافت معتبر نیست.' };
        }
        if (state.payments.some((item) => item.id === payment.id || item.documentNumber === payment.documentNumber)) {
          return { ok: false, message: 'شناسه یا شماره سند دریافت تکراری است.' };
        }
        const outstanding = invoiceOutstandingAmount(next, state.payments, state.checks, state.returns);
        const reserved = invoiceReservedByPendingChecks(next, state.payments, state.checks);
        if (payment.amount > outstanding - reserved + 0.0001) return { ok: false, message: 'مبلغ دریافت از مانده آزاد فاکتور بیشتر است.' };
      }
      const inventory = applyInvoiceInventory(state.products, state.stockMovements, next, 1, 'finalize');
      if (!inventory.ok) return { ok: false, message: inventory.message };
      const merged = previous
        ? state.invoices.map((item) => item.id === next.id ? next : item)
        : [next, ...state.invoices];
      const payments = payment ? [payment, ...state.payments] : state.payments;
      const invoices = withInvoiceStatuses(merged, payments, state.checks, state.returns);
      const saved = invoices.find((item) => item.id === next.id) || next;
      const newMovements = inventory.stockMovements.slice(state.stockMovements.length);
      const journalEntries = [
        ...state.journalEntries,
        ...journalForInvoice(next, state.products, newMovements, state.accounts, 'post'),
        ...(payment ? journalForPayment(payment, state.accounts) : []),
      ];
      const settings: BusinessSettings = {
        ...state.settings,
        numbering: {
          ...state.settings.numbering,
          sale: { ...saleSequence, next: saleSequence.next + 1 },
          ...(payment ? { receipt: { ...receiptSequence, next: receiptSequence.next + 1 } } : {}),
        },
      };
      set({ settings, products: inventory.products, stockMovements: inventory.stockMovements, invoices, payments, journalEntries });
      return { ok: true, invoice: saved };
    },

    reviseInvoice: (invoice, reason) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === invoice.id);
      if (!previous || !isPosted(previous.status)) {
        return { ok: false, message: 'فقط فاکتور قطعی قابل Revision است.' };
      }
      if (previous.status === 'settled') {
        return { ok: false, message: 'فاکتور تسویه‌شده قابل ویرایش نیست.' };
      }
      if (!reason.trim()) return { ok: false, message: 'دلیل ویرایش سند قطعی را وارد کنید.' };
      if (previous.status === 'partial') {
        if (partialInvoiceContentSignature(previous) !== partialInvoiceContentSignature(invoice)) {
          return { ok: false, message: 'فاکتور بخشی‌تسویه فقط از نظر توضیحات قابل ویرایش است.' };
        }
        const revision = Math.max(1, previous.revision || 1) + 1;
        const next: Invoice = {
          ...previous,
          notes: invoice.notes,
          revision,
          updatedAt: new Date().toISOString(),
          auditTrail: appendAudit(previous, 'revised', revision, reason),
        };
        const invoices = withInvoiceStatuses(
          state.invoices.map((item) => item.id === next.id ? next : item),
          state.payments,
          state.checks,
          state.returns
        );
        const saved = invoices.find((item) => item.id === next.id) || next;
        set({ invoices });
        return { ok: true, invoice: saved };
      }
      if (state.returns.some((document) => document.originalInvoiceId === invoice.id && document.status === 'final')) {
        return { ok: false, message: 'این فاکتور مرجوعی قطعی دارد. ابتدا اسناد مرجوعی مرتبط را ابطال کنید.' };
      }
      if (invoice.number.trim() !== previous.number.trim()) {
        return { ok: false, message: 'شماره فاکتور قطعی قابل تغییر نیست.' };
      }

      const reversedInventory = applyInvoiceInventory(state.products, state.stockMovements, previous, -1, 'revision-reversal');
      if (!reversedInventory.ok) return { ok: false, message: reversedInventory.message };
      const baseProducts = reversedInventory.products;
      const now = new Date().toISOString();
      const revision = Math.max(1, previous.revision || 1) + 1;
      const base: Invoice = {
        ...invoice,
        number: previous.number,
        status: previous.status,
        revision,
        finalizedAt: previous.finalizedAt || previous.updatedAt || now,
        voidedAt: undefined,
        voidReason: undefined,
        createdAt: previous.createdAt,
        updatedAt: now,
        auditTrail: previous.auditTrail || [],
      };
      const next: Invoice = { ...base, auditTrail: appendAudit(base, 'revised', revision, reason) };
      const valid = validatePosting(state.customers, baseProducts, next, state.invoices);
      if (!valid.ok) return valid;

      const appliedInventory = applyInvoiceInventory(baseProducts, reversedInventory.stockMovements, next, 1, 'revision');
      if (!appliedInventory.ok) return { ok: false, message: appliedInventory.message };
      const merged = state.invoices.map((item) => (item.id === next.id ? next : item));
      const invoices = withInvoiceStatuses(merged, state.payments, state.checks, state.returns);
      const saved = invoices.find((item) => item.id === next.id) || next;
      const reversals = reverseActiveSourceEntries(
        state.journalEntries,
        'invoice',
        previous.id,
        next.date,
        'برگشت ثبت قبلی فاکتور ' + previous.number,
        'revision-reversal'
      );
      const newMovements = appliedInventory.stockMovements.slice(reversedInventory.stockMovements.length);
      const posts = journalForInvoice(next, baseProducts, newMovements, state.accounts, 'revision-post');
      set({
        products: appliedInventory.products,
        stockMovements: appliedInventory.stockMovements,
        invoices,
        journalEntries: [...state.journalEntries, ...reversals, ...posts],
      });
      return { ok: true, invoice: saved };
    },

    voidInvoice: (id, reason) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === id);
      if (!previous || !isPosted(previous.status)) {
        return { ok: false, message: 'فقط فاکتور قطعی قابل ابطال است.' };
      }
      if (!reason.trim()) return { ok: false, message: 'دلیل ابطال را وارد کنید.' };
      if (state.payments.some((payment) => payment.invoiceId === id)) {
        return { ok: false, message: 'این فاکتور دریافت/پرداخت متصل دارد. ابتدا تراکنش‌های مرتبط را اصلاح یا حذف کنید.' };
      }
      if (state.returns.some((document) => document.originalInvoiceId === id && document.status === 'final')) {
        return { ok: false, message: 'این فاکتور مرجوعی قطعی دارد. ابتدا اسناد مرجوعی مرتبط را ابطال کنید.' };
      }

      const now = new Date().toISOString();
      const revision = Math.max(1, previous.revision || 1);
      const base: Invoice = {
        ...previous,
        status: 'void',
        voidedAt: now,
        voidReason: reason.trim(),
        updatedAt: now,
      };
      const next: Invoice = { ...base, auditTrail: appendAudit(base, 'voided', revision, reason) };
      const inventory = applyInvoiceInventory(state.products, state.stockMovements, previous, -1, 'void-reversal');
      if (!inventory.ok) return { ok: false, message: inventory.message };
      const invoices = state.invoices.map((item) => (item.id === id ? next : item));
      const reversals = reverseActiveSourceEntries(
        state.journalEntries,
        'invoice',
        previous.id,
        next.date,
        'ابطال فاکتور ' + previous.number + ' — ' + reason.trim(),
        'void-reversal'
      );
      set({
        products: inventory.products,
        stockMovements: inventory.stockMovements,
        invoices,
        journalEntries: [...state.journalEntries, ...reversals],
      });
      return { ok: true, invoice: next };
    },

    deleteInvoice: (id) => {
      const state = get();
      const previous = state.invoices.find((item) => item.id === id);
      if (!previous) return { ok: false, message: 'فاکتور پیدا نشد.' };
      if (previous.status !== 'draft') {
        return { ok: false, message: 'فاکتور قطعی یا ابطال‌شده حذف نمی‌شود. برای اسناد قطعی از ابطال استفاده کنید.' };
      }
      set({ invoices: state.invoices.filter((item) => item.id !== id) });
      return { ok: true };
    },

    saveReturnDraft: (document) => {
      const state = get();
      const previous = state.returns.find((item) => item.id === document.id);
      if (previous && previous.status !== 'draft') {
        return { ok: false, message: 'سند مرجوعی قطعی قابل بازگشت به پیش‌نویس نیست.' };
      }
      const originalInvoice = state.invoices.find((invoice) => invoice.id === document.originalInvoiceId);
      if (!originalInvoice || !isPosted(originalInvoice.status)) {
        return { ok: false, message: 'فاکتور اصلی معتبر و قطعی پیدا نشد.' };
      }
      const now = new Date().toISOString();
      const base: ReturnDocument = {
        ...document,
        kind: originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return',
        status: 'draft',
        originalInvoiceNumber: originalInvoice.number,
        customerId: originalInvoice.customerId,
        customerName: originalInvoice.customerName,
        items: normalizeReturnItems(document, originalInvoice),
        totalAmount: 0,
        createdAt: previous?.createdAt || document.createdAt || now,
        updatedAt: now,
        finalizedAt: undefined,
        voidedAt: undefined,
        voidReason: undefined,
        auditTrail: previous?.auditTrail || document.auditTrail || [],
      };
      const next = { ...base, auditTrail: appendReturnAudit(base, previous ? 'draft_saved' : 'created') };
      const returns = previous
        ? state.returns.map((item) => item.id === next.id ? next : item)
        : [next, ...state.returns];
      set({ returns });
      return { ok: true, returnDocument: next };
    },

    finalizeReturn: (document) => {
      const state = get();
      const previous = state.returns.find((item) => item.id === document.id);
      if (previous && previous.status !== 'draft') {
        return { ok: false, message: 'این سند مرجوعی قبلاً قطعی شده است.' };
      }
      const originalInvoice = state.invoices.find((invoice) => invoice.id === document.originalInvoiceId);
      const valid = validateReturn(document, originalInvoice, state.returns);
      if (!valid.ok || !originalInvoice) return valid;

      const now = new Date().toISOString();
      const items = normalizeReturnItems(document, originalInvoice);
      const base: ReturnDocument = {
        ...document,
        kind: originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return',
        status: 'final',
        originalInvoiceNumber: originalInvoice.number,
        customerId: originalInvoice.customerId,
        customerName: originalInvoice.customerName,
        items,
        totalAmount: returnDocumentAmount(originalInvoice, items),
        createdAt: previous?.createdAt || document.createdAt || now,
        updatedAt: now,
        finalizedAt: now,
        voidedAt: undefined,
        voidReason: undefined,
        auditTrail: previous?.auditTrail || document.auditTrail || [],
      };
      const next: ReturnDocument = { ...base, auditTrail: appendReturnAudit(base, 'finalized') };
      const inventory = applyReturnInventory(state.products, state.stockMovements, next, originalInvoice, 1, 'return-finalize');
      if (!inventory.ok) return { ok: false, message: inventory.message };

      const returns = previous
        ? state.returns.map((item) => item.id === next.id ? next : item)
        : [next, ...state.returns];
      const invoices = withInvoiceStatuses(state.invoices, state.payments, state.checks, returns);
      const newMovements = inventory.stockMovements.slice(state.stockMovements.length);
      const journalEntries = [
        ...state.journalEntries,
        ...journalForReturn(next, originalInvoice, state.products, newMovements, state.accounts),
      ];
      set({ returns, invoices, products: inventory.products, stockMovements: inventory.stockMovements, journalEntries });
      return { ok: true, returnDocument: next };
    },

    voidReturn: (id, reason) => {
      const state = get();
      const previous = state.returns.find((item) => item.id === id);
      if (!previous || previous.status !== 'final') {
        return { ok: false, message: 'فقط سند مرجوعی قطعی قابل ابطال است.' };
      }
      if (!reason.trim()) return { ok: false, message: 'دلیل ابطال مرجوعی الزامی است.' };
      const originalInvoice = state.invoices.find((invoice) => invoice.id === previous.originalInvoiceId);
      if (!originalInvoice) return { ok: false, message: 'فاکتور اصلی پیدا نشد.' };

      const now = new Date().toISOString();
      const base: ReturnDocument = {
        ...previous,
        status: 'void',
        voidedAt: now,
        voidReason: reason.trim(),
        updatedAt: now,
      };
      const next: ReturnDocument = { ...base, auditTrail: appendReturnAudit(base, 'voided', reason) };
      const inventory = applyReturnInventory(state.products, state.stockMovements, previous, originalInvoice, -1, 'return-void-reversal');
      if (!inventory.ok) return { ok: false, message: inventory.message };
      const returns = state.returns.map((item) => item.id === id ? next : item);
      const invoices = withInvoiceStatuses(state.invoices, state.payments, state.checks, returns);
      const reversals = reverseActiveSourceEntries(
        state.journalEntries,
        'return',
        previous.id,
        next.date,
        'ابطال سند مرجوعی ' + previous.number + ' — ' + reason.trim(),
        'void-reversal'
      );
      set({
        returns,
        invoices,
        products: inventory.products,
        stockMovements: inventory.stockMovements,
        journalEntries: [...state.journalEntries, ...reversals],
      });
      return { ok: true, returnDocument: next };
    },

    deleteReturn: (id) => {
      const state = get();
      const previous = state.returns.find((item) => item.id === id);
      if (!previous) return { ok: false, message: 'سند مرجوعی پیدا نشد.' };
      if (previous.status !== 'draft') return { ok: false, message: 'فقط پیش‌نویس مرجوعی قابل حذف است.' };
      set({ returns: state.returns.filter((item) => item.id !== id) });
      return { ok: true };
    },

  };
}
