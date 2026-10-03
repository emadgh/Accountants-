import {
  journalForPayment,
  reverseActiveSourceEntries
} from '../accounting';
import type {
  Payment
} from '../types';
import {
  expectedPaymentDirection,
  invoiceOutstandingAmount,
  invoiceReservedByPendingChecks,
  uid as randomUid,
  todayFa
} from '../utils';

import type { DomainContext } from './engine';
import { withInvoiceStatuses } from './shared';

export function paymentsActions({ set, get, uid = randomUid }: DomainContext): Pick<import('./shared').AccountingState, 'addPayment' | 'deletePayment' | 'upsertCheck' | 'deleteCheck' | 'repairPaymentInvoiceLinks'> {
  return {
    addPayment: (payment) => {
      const state = get();
      if (!payment.customerId) return { ok: false, message: 'طرف حساب را انتخاب کنید.' };
      if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
        return { ok: false, message: 'مبلغ تراکنش باید بزرگ‌تر از صفر باشد.' };
      }
      if (!payment.documentNumber?.trim()) return { ok: false, message: 'شماره سند دریافت/پرداخت الزامی است.' };
      if (state.payments.some((item) => item.id !== payment.id && item.documentNumber?.trim() === payment.documentNumber.trim())) {
        return { ok: false, message: 'شماره سند دریافت/پرداخت تکراری است.' };
      }

      const linkedInvoice = payment.invoiceId
        ? state.invoices.find((invoice) => invoice.id === payment.invoiceId)
        : undefined;
      if (payment.invoiceId && !linkedInvoice) return { ok: false, message: 'فاکتور مرتبط پیدا نشد.' };
      if (linkedInvoice && (linkedInvoice.status === 'draft' || linkedInvoice.status === 'void')) {
        return { ok: false, message: 'به پیش‌نویس یا فاکتور باطل نمی‌توان تراکنش متصل کرد.' };
      }
      if (linkedInvoice) {
        const outstanding = invoiceOutstandingAmount(
          linkedInvoice,
          state.payments.filter((item) => item.id !== payment.id),
          state.checks,
          state.returns
        );
        const reservedByOtherPendingChecks = invoiceReservedByPendingChecks(
          linkedInvoice,
          state.payments.filter((item) => item.id !== payment.id),
          state.checks
        );
        if (Number(payment.amount) > outstanding - reservedByOtherPendingChecks + 0.0001) {
          return { ok: false, message: 'مبلغ تراکنش از مانده فاکتور بیشتر است.' };
        }
      }

      let normalized: Payment = {
        ...payment,
        direction: linkedInvoice ? expectedPaymentDirection(linkedInvoice) : payment.direction,
        customerId: linkedInvoice ? (linkedInvoice.customerId || payment.customerId) : payment.customerId,
      };

      if (normalized.method === 'check') {
        if (!normalized.checkId) return { ok: false, message: 'برای روش چک، یک چک ثبت‌شده را انتخاب کنید.' };
        const check = state.checks.find((item) => item.id === normalized.checkId);
        if (!check) return { ok: false, message: 'چک انتخاب‌شده پیدا نشد.' };
        const expectedCheckDirection = normalized.direction === 'receipt' ? 'received' : 'issued';
        if (check.direction !== expectedCheckDirection) {
          return { ok: false, message: 'نوع چک با جهت دریافت/پرداخت سازگار نیست.' };
        }
        if (check.customerId !== normalized.customerId) {
          return { ok: false, message: 'طرف حساب چک با طرف حساب تراکنش یکسان نیست.' };
        }
        if (Math.abs(Number(check.amount) - Number(normalized.amount)) > 0.0001) {
          return { ok: false, message: 'مبلغ تراکنش چکی باید با مبلغ چک برابر باشد.' };
        }
        if (state.payments.some((item) => item.checkId === normalized.checkId)) {
          return { ok: false, message: 'این چک قبلاً به یک تراکنش متصل شده است.' };
        }
      } else {
        normalized = { ...normalized, checkId: undefined };
      }

      const payments = [normalized, ...state.payments];
      const invoices = withInvoiceStatuses(state.invoices, payments, state.checks, state.returns);
      const linkedCheck = normalized.checkId ? state.checks.find((item) => item.id === normalized.checkId) : undefined;
      const shouldPost = normalized.method !== 'check' || linkedCheck?.status === 'cleared';
      const journalEntries = shouldPost
        ? [...state.journalEntries, ...journalForPayment(normalized, state.accounts)]
        : state.journalEntries;
      set({ payments, invoices, journalEntries });
      return { ok: true };
    },

    deletePayment: (id, reason) => {
      const state = get();
      const payment = state.payments.find((item) => item.id === id);
      if (!payment) return { ok: false, message: 'تراکنش پیدا نشد.' };
      if (!reason.trim()) return { ok: false, message: 'دلیل حذف تراکنش الزامی است.' };
      const payments = state.payments.filter((item) => item.id !== id);
      const reversals = reverseActiveSourceEntries(
        state.journalEntries,
        'payment',
        id,
        todayFa(),
        'حذف تراکنش ' + payment.documentNumber + ' — ' + reason.trim(),
        'status-reversal'
      );
      const checks = payment.checkId
        ? state.checks.map((check) => check.id === payment.checkId
          ? { ...check, notes: [check.notes?.trim(), 'تراکنش ' + payment.documentNumber + ' حذف شد: ' + reason.trim()].filter(Boolean).join('\n') }
          : check)
        : state.checks;
      set({
        payments,
        checks,
        invoices: withInvoiceStatuses(state.invoices, payments, checks, state.returns),
        journalEntries: [...state.journalEntries, ...reversals],
      });
      return { ok: true };
    },

    upsertCheck: (check) => {
      const state = get();
      if (!check.documentNumber?.trim()) return { ok: false, message: 'شماره سند چک الزامی است.' };
      if (state.checks.some((item) => item.id !== check.id && item.documentNumber?.trim() === check.documentNumber.trim())) {
        return { ok: false, message: 'شماره سند چک تکراری است.' };
      }
      const previous = state.checks.find((item) => item.id === check.id);
      const linkedPayment = state.payments.find((payment) => payment.checkId === check.id);

      if (linkedPayment && previous) {
        const structuralChange =
          previous.customerId !== check.customerId ||
          previous.direction !== check.direction ||
          Math.abs(Number(previous.amount) - Number(check.amount)) > 0.0001;
        if (structuralChange) {
          return {
            ok: false,
            message: 'چک به یک تراکنش متصل است؛ طرف حساب، نوع و مبلغ آن قابل تغییر نیست. وضعیت، سررسید و اطلاعات بانکی قابل ویرایش‌اند.',
          };
        }
      }

      const checks = previous
        ? state.checks.map((item) => (item.id === check.id ? check : item))
        : [check, ...state.checks];
      const invoices = withInvoiceStatuses(state.invoices, state.payments, checks, state.returns);
      let journalEntries = state.journalEntries;
      if (linkedPayment) {
        const wasEffective = previous?.status === 'cleared';
        const isEffective = check.status === 'cleared';
        if (!wasEffective && isEffective) {
          journalEntries = [...journalEntries, ...journalForPayment(linkedPayment, state.accounts)];
        } else if (wasEffective && !isEffective) {
          journalEntries = [
            ...journalEntries,
            ...reverseActiveSourceEntries(
              journalEntries,
              'payment',
              linkedPayment.id,
              todayFa(),
              'برگشت اثر چک ' + check.number + ' پس از تغییر وضعیت',
              'status-reversal'
            ),
          ];
        }
      }
      set({ checks, invoices, journalEntries });
      return { ok: true };
    },

    deleteCheck: (id) => {
      const state = get();
      if (state.payments.some((payment) => payment.checkId === id)) {
        return { ok: false, message: 'این چک به تراکنش متصل است و قابل حذف نیست. ابتدا تراکنش مرتبط را حذف کنید.' };
      }
      const checks = state.checks.filter((check) => check.id !== id);
      set({ checks, invoices: withInvoiceStatuses(state.invoices, state.payments, checks, state.returns) });
      return { ok: true };
    },

    repairPaymentInvoiceLinks: (links) => {
      const state = get();
      const invoiceById = new Map(state.invoices.map((invoice) => [invoice.id, invoice]));
      const requested = new Map<string, string>();
      for (const link of links) {
        if (requested.has(link.paymentId) && requested.get(link.paymentId) !== link.invoiceId) {
          return { ok: false, message: 'برای یک دریافت، چند فاکتور متفاوت پیشنهاد شده است.' };
        }
        requested.set(link.paymentId, link.invoiceId);
      }
      let updated = 0;
      const payments = state.payments.map((payment) => {
        const invoiceId = requested.get(payment.id);
        if (!invoiceId || payment.invoiceId) return payment;
        const invoice = invoiceById.get(invoiceId);
        if (!invoice || invoice.customerId !== payment.customerId || invoice.status === 'draft' || invoice.status === 'void' || expectedPaymentDirection(invoice) !== payment.direction) return payment;
        updated++;
        return { ...payment, invoiceId };
      });
      if (updated) set({ payments, invoices: withInvoiceStatuses(state.invoices, payments, state.checks, state.returns) });
      return { ok: true, updated };
    },

  };
}
