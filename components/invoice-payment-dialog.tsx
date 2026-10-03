'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { usePersistedAction } from '@/hooks/use-persisted-action';

import { PaymentFields } from '@/components/forms/payment-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eligiblePaymentChecks, paymentCapacity } from '@/lib/domain/payment-capacity';
import { notify } from '@/lib/feedback';
import { todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { Invoice, Payment } from '@/lib/types';
import { invoiceOutstandingAmount, invoiceReservedByPendingChecks, money, uid } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';

function emptyPayment(invoice: Invoice, documentNumber: string): Payment {
  return {
    id: uid('pay'),
    documentNumber,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    direction: invoice.kind === 'sale' ? 'receipt' : 'payment',
    method: 'cash',
    amount: 0,
    date: todayIso(),
    reference: '',
    notes: '',
  };
}

export function InvoicePaymentDialog({
  invoiceId,
  documentNumber,
  open,
  onOpenChange,
}: {
  invoiceId?: string | null;
  documentNumber?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invoice = useAccountingStore((state) => state.invoices.find((item) => item.id === invoiceId));
  const payments = useAccountingStore((state) => state.payments);
  const checks = useAccountingStore((state) => state.checks);
  const returns = useAccountingStore((state) => state.returns);
  const customers = useAccountingStore((state) => state.customers);
  const settings = useAccountingStore((state) => state.settings);
  const addPayment = useAccountingStore((state) => state.addPayment);
  const remaining = useMemo(
    () => invoice ? invoiceOutstandingAmount(invoice, payments, checks, returns) : 0,
    [invoice, payments, checks, returns]
  );
  const [form, setForm] = useState<Payment | null>(null);
  const submission = usePersistedAction();
  const { busy, error: submitError, setError: setSubmitError } = submission;
  const capacity = invoice ? paymentCapacity(invoice, { payments, checks, returns }) : { outstanding: 0, reserved: 0, available: 0 };
  const { available } = capacity;

  useEffect(() => {
    if (!open || !invoice) return;
    setForm({
      ...emptyPayment(invoice, documentNumber || ''),
      amount: Math.max(0, remaining - invoiceReservedByPendingChecks(invoice, payments, checks)),
    });
    setSubmitError('');
  }, [open, invoice?.id, documentNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const direction = invoice?.kind === 'sale' ? 'receipt' : 'payment';
  const linkedCustomer = invoice ? customers.find((item) => item.id === invoice.customerId) : undefined;
  const paymentCustomer = form ? customers.find((item) => item.id === form.customerId) : undefined;
  const availableChecks = eligiblePaymentChecks({ direction, customerId: form?.customerId || '' }, { payments, checks }, available);
  const invalid = !invoice || !form || !form.customerId || invoice.status === 'draft' || invoice.status === 'void' || available <= 0 ||
    !Number.isFinite(form.amount) || form.amount <= 0 || form.amount > available + 0.0001 ||
    (form.method === 'check' && (!form.checkId || !availableChecks.some((check) => check.id === form.checkId)));

  const submit = async () => {
    if (!invoice || !form || invalid) return;
    const result = await submission.run(() => addPayment({ ...form, invoiceId: invoice.id, customerId: invoice.customerId || form.customerId, direction }), () => onOpenChange(false));
    if (!result.ok && result.message) notify(result.message, 'error');
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent>
      <AccountingRecoveryNotice /><DialogHeader>
        <DialogTitle className="text-lg font-black">{direction === 'receipt' ? 'دریافت وجه فاکتور' : 'پرداخت فاکتور'}</DialogTitle>
        <DialogDescription className="text-sm leading-6 text-slate-500">
          {invoice ? `${invoice.kind === 'sale' ? 'فاکتور فروش' : 'فاکتور خرید'} ${invoice.number} · ${paymentCustomer?.name || linkedCustomer?.name || invoice.customerName} · مانده ${money(remaining)} ${settings.currency}` : 'فاکتور پیدا نشد.'}
          {' مبلغ مانده به‌صورت پیش‌فرض وارد شده است؛ برای ثبت بخشی از آن، مبلغ را کمتر کنید.'}
        </DialogDescription>
      </DialogHeader>
      {form && <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
          <span className="font-bold">شماره سند:</span> {form.documentNumber || 'هنگام ثبت تعیین می‌شود'}
          <span className="mr-4 font-bold">طرف حساب:</span> {paymentCustomer?.name || linkedCustomer?.name || invoice?.customerName || '—'}
          <span className="mr-4 font-bold">نوع:</span> {direction === 'receipt' ? 'دریافت' : 'پرداخت'}
        </div>
        {invoice && !invoice.customerId && <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">اتصال به طرف حساب *
          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal" value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value, checkId: undefined })}>
            <option value="">انتخاب طرف حساب...</option>
            {customers.filter((customer) => customer.status !== 'archived').map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
          </select>
        </label>}
        <PaymentFields value={form} onChange={setForm} data={{ invoices: invoice ? [invoice] : [], payments, checks, returns }} currency={settings.currency} disabled={busy} />
        {submitError && <div className="text-xs text-rose-600 sm:col-span-2" role="alert">{submitError}</div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button disabled={invalid || busy} onClick={submit}>{busy ? 'در حال ذخیره…' : direction === 'receipt' ? 'ثبت دریافت' : 'ثبت پرداخت'}</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
