'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccountingStore } from '@/lib/store';
import type { Invoice, Payment } from '@/lib/types';
import { invoiceOutstandingAmount, invoiceReservedByPendingChecks, money, uid } from '@/lib/utils';
import { todayIso } from '@/lib/standards';
import { notify } from '@/lib/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { flushAccountingPersistence } from '@/lib/storage';

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
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const pendingReserved = invoice ? invoiceReservedByPendingChecks(invoice, payments, checks) : 0;
  const available = Math.max(0, remaining - pendingReserved);

  useEffect(() => {
    if (!open || !invoice) return;
    const direction: Payment['direction'] = invoice.kind === 'sale' ? 'receipt' : 'payment';
    setForm({
      ...emptyPayment(invoice, documentNumber || ''),
      amount: Math.max(0, remaining - invoiceReservedByPendingChecks(invoice, payments, checks)),
    });
    setSubmitError('');
  }, [open, invoice?.id, documentNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const direction = invoice?.kind === 'sale' ? 'receipt' : 'payment';
  const linkedCustomer = invoice ? customers.find((item) => item.id === invoice.customerId) : undefined;
  const paymentCustomer = form ? customers.find((item) => item.id === form.customerId) : undefined;
  const availableChecks = checks.filter((check) =>
    check.status !== 'bounced' &&
    check.direction === (direction === 'receipt' ? 'received' : 'issued') &&
    check.customerId === form?.customerId &&
    !payments.some((payment) => payment.checkId === check.id) &&
    check.amount <= available + 0.0001
  );
  const invalid = !invoice || !form || !form.customerId || invoice.status === 'draft' || invoice.status === 'void' || available <= 0 ||
    !Number.isFinite(form.amount) || form.amount <= 0 || form.amount > available + 0.0001 ||
    (form.method === 'check' && (!form.checkId || !availableChecks.some((check) => check.id === form.checkId)));

  const selectCheck = (checkId: string) => {
    if (!form || !checkId) {
      if (form) setForm({ ...form, checkId: undefined, reference: '' });
      return;
    }
    const check = availableChecks.find((item) => item.id === checkId);
    if (!check) return;
    setForm({ ...form, checkId, amount: check.amount, reference: check.number });
  };

  const submit = async () => {
    if (!invoice || !form || invalid) return;
    setSubmitError('');
    const result = addPayment({ ...form, invoiceId: invoice.id, customerId: invoice.customerId || form.customerId, direction });
    if (!result.ok) {
      const message = result.message || 'ثبت تراکنش انجام نشد.';
      setSubmitError(message);
      notify(message, 'error');
      return;
    }
    setBusy(true);
    try {
      await flushAccountingPersistence();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ذخیره دریافت روی سرور انجام نشد؛ اطلاعات فرم حفظ شده است.';
      setSubmitError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
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
        <label className="grid gap-1 text-xs font-bold text-slate-600">روش
          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as Payment['method'], checkId: undefined, reference: '' })}>
            <option value="cash">نقدی</option><option value="card">کارت / واریز</option><option value="check">چک</option>
          </select>
        </label>
        {form.method === 'check' && <label className="grid gap-1 text-xs font-bold text-slate-600 sm:col-span-2">چک ثبت‌شده *
          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal" value={form.checkId || ''} onChange={(event) => selectCheck(event.target.value)}>
            <option value="">انتخاب چک...</option>
            {availableChecks.map((check) => <option key={check.id} value={check.id}>{check.number} · {check.bank || 'بدون بانک'} · {money(check.amount)} · {check.status === 'cleared' ? 'وصول/پاس شده' : 'در انتظار'}</option>)}
          </select>
        </label>}
        <label className="grid gap-1 text-xs font-bold text-slate-600">مبلغ ({settings.currency}) *
          <FormattedInput min={0} max={remaining} value={form.amount} readOnly={form.method === 'check' && !!form.checkId} onValueChange={(amount) => setForm({ ...form, amount })} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">تاریخ
          <JalaliDatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">شماره پیگیری / مرجع
          <Input value={form.reference || ''} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">توضیحات
          <Input value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        {pendingReserved > 0 && <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800 sm:col-span-2">{money(pendingReserved)} از مانده با چک در انتظار رزرو شده؛ دریافت تازه حداکثر {money(available)} است. چک تا وصول‌شدن، دریافت مؤثر حساب نمی‌شود.</div>}
        {form.method === 'check' && <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800 sm:col-span-2">چک تا زمان وصول/پاس شدن در مانده فاکتور اثر ندارد.</div>}
        {form.method === 'check' && !form.checkId && <span className="text-xs text-rose-600 sm:col-span-2" role="alert">چک ثبت‌شده را انتخاب کنید.</span>}
        {form.amount > available + 0.0001 && <span className="text-xs text-rose-600 sm:col-span-2" role="alert">مبلغ از مانده آزاد فاکتور بیشتر است.</span>}
        {submitError && <div className="text-xs text-rose-600 sm:col-span-2" role="alert">{submitError}</div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button disabled={invalid || busy} onClick={submit}>{busy ? 'در حال ذخیره…' : direction === 'receipt' ? 'ثبت دریافت' : 'ثبت پرداخت'}</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
