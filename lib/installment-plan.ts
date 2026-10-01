import type { Invoice } from './types';
import { jalaliDateParts, jalaliMonthStartIso, normalizeStoredDate, todayIso } from './standards';
import { invoiceTotal } from './utils';

export type AutomaticInstallmentOptions = {
  downPayment: number;
  count: number;
  profitPercent: number;
  firstDueDate: string;
};

const feeId = (invoiceId: string) => `installment-financing-${invoiceId}`;
const downId = (invoiceId: string) => `installment-down-${invoiceId}`;
const paymentId = (invoiceId: string, index: number) => `installment-auto-${invoiceId}-${index}`;

function addJalaliMonths(firstDueDate: string, offset: number) {
  const parts = jalaliDateParts(firstDueDate);
  if (!parts) throw new Error('تاریخ اولین قسط معتبر نیست.');
  const monthIndex = parts.jy * 12 + parts.jm - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = new Date(`${jalaliMonthStartIso(year, month)}T00:00:00Z`);
  const nextStart = new Date(`${jalaliMonthStartIso(nextYear, nextMonth)}T00:00:00Z`);
  const days = Math.round((nextStart.getTime() - start.getTime()) / 86_400_000);
  start.setUTCDate(start.getUTCDate() + Math.min(parts.jd, days) - 1);
  return start.toISOString().slice(0, 10);
}

export function existingAutomaticInstallmentOptions(invoice: Invoice): AutomaticInstallmentOptions {
  const downPayment = Number(invoice.installments?.find((item) => item.id === downId(invoice.id))?.amount || 0);
  const base = invoiceTotal({ ...invoice, items: invoice.items.filter((item) => item.id !== feeId(invoice.id)) });
  const fee = Number(invoice.items.find((item) => item.id === feeId(invoice.id))?.unitPrice || 0);
  const first = invoice.installments?.find((item) => item.id.startsWith(`installment-auto-${invoice.id}-`));
  return {
    downPayment,
    count: Math.max(1, invoice.installments?.filter((item) => item.id.startsWith(`installment-auto-${invoice.id}-`)).length || 3),
    profitPercent: base > downPayment ? Math.round(fee / (base - downPayment) * 10_000) / 100 : 0,
    firstDueDate: first?.dueDate || invoice.dueDate || todayIso(),
  };
}

export function calculateAutomaticInstallments(invoice: Invoice, options: AutomaticInstallmentOptions, downDueDate = todayIso()) {
  const { downPayment, count, profitPercent } = options;
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('تعداد اقساط باید بین ۱ تا ۶۰ باشد.');
  if (!Number.isFinite(profitPercent) || profitPercent < 0 || profitPercent > 100) throw new Error('درصد سود باید بین ۰ تا ۱۰۰ باشد.');
  if (!Number.isFinite(downPayment) || downPayment < 0 || !Number.isInteger(downPayment)) throw new Error('پیش‌پرداخت باید مبلغ صحیح و نامنفی باشد.');

  const firstDueDate = normalizeStoredDate(options.firstDueDate);
  const parsed = new Date(`${firstDueDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== firstDueDate) {
    throw new Error('تاریخ اولین قسط معتبر نیست.');
  }
  const baseInvoice = { ...invoice, items: invoice.items.filter((item) => item.id !== feeId(invoice.id)) };
  const baseAmount = invoiceTotal(baseInvoice);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error('مبلغ فاکتور باید بیشتر از صفر باشد.');
  if (downPayment >= baseAmount) throw new Error('پیش‌پرداخت باید کمتر از مبلغ فاکتور باشد.');

  const financed = baseAmount - downPayment;
  const financeCharge = Math.round(financed * profitPercent / 100);
  const items = profitPercent > 0 && financeCharge > 0
    ? [...baseInvoice.items, {
      id: feeId(invoice.id),
      description: `سود فروش اقساطی (${profitPercent}٪ ثابت)`,
      details: 'سود ثابت بر مانده پس از پیش‌پرداخت',
      unit: 'مورد',
      qty: 1,
      unitPrice: financeCharge,
      discount: 0,
    }]
    : baseInvoice.items;
  const withCharge: Invoice = { ...baseInvoice, items };
  const grandTotal = invoiceTotal(withCharge);
  const remainder = grandTotal - downPayment;
  const regularAmount = Math.floor(remainder / count);
  if (regularAmount <= 0) throw new Error('مبلغ هر قسط باید بیشتر از صفر باشد؛ تعداد اقساط را کاهش دهید.');
  const installments: NonNullable<Invoice['installments']> = [
    ...(downPayment > 0 ? [{ id: downId(invoice.id), dueDate: downDueDate, amount: downPayment }] : []),
    ...Array.from({ length: count }, (_, index) => ({
      id: paymentId(invoice.id, index),
      dueDate: addJalaliMonths(firstDueDate, index),
      amount: index === count - 1 ? remainder - regularAmount * (count - 1) : regularAmount,
    })),
  ];
  return {
    invoice: { ...withCharge, installments, dueDate: installments.at(-1)?.dueDate },
    baseAmount,
    financed,
    financeCharge,
    grandTotal,
    installments,
  };
}
