'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { useShallow } from 'zustand/react/shallow';

import { PaymentFields } from '@/components/forms/payment-fields';
import { DataTable } from '@/components/ui/data-table';
import { usePersistedAction } from '@/hooks/use-persisted-action';
import { paymentCapacity } from '@/lib/domain/payment-capacity';
import { persistOperation } from '@/lib/operation-result';

import { InvoicePaymentHistoryButton } from '@/components/invoice-payment-history';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RecordDetailsDialog } from '@/components/ui/record-details-dialog';
import { notify, promptDialog } from '@/lib/feedback';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { Payment } from '@/lib/types';
import { effectivePaymentAmount, invoiceOutstandingAmount, money, resolvedPaymentDirection, uid } from '@/lib/utils';
import {
  ArrowDownToLine, ArrowUpFromLine,
  Eye,
  Trash2
} from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, PageHead, SearchBox } from './shared';
export function PaymentsView() {
  const submission = usePersistedAction();
  const { payments, customers, invoices, checks, returns, reserveDocumentNumber, addPayment, deletePayment, settings } = useAccountingStore(useShallow((state) => ({ payments: state.payments, customers: state.customers, invoices: state.invoices, checks: state.checks, returns: state.returns, reserveDocumentNumber: state.reserveDocumentNumber, addPayment: state.addPayment, deletePayment: state.deletePayment, settings: state.settings })));
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [q, setQ] = useState('');
  const emptyPayment = (direction: Payment['direction'] = 'receipt', documentNumber = ''): Payment => ({
    id: uid('pay'),
    documentNumber,
    customerId: '',
    invoiceId: '',
    direction,
    method: 'cash',
    checkId: undefined,
    amount: 0,
    date: todayIso(),
    reference: '',
    notes: '',
  });
  const [form, setForm] = useState<Payment>(() => emptyPayment());

  const start = (direction: Payment['direction'] = 'receipt') => {
    setForm(emptyPayment(direction, reserveDocumentNumber(direction)));
    setFormError('');
    setOpen(true);
  };

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name || '—';
  const invoiceFor = (payment: Payment) => payment.invoiceId ? invoices.find((invoice) => invoice.id === payment.invoiceId) : undefined;
  const directionOf = (payment: Payment) => resolvedPaymentDirection(payment, invoiceFor(payment));

  const list = payments.filter((payment) =>
    (customerName(payment.customerId) + ' ' + payment.documentNumber + ' ' + (payment.reference || '') + ' ' + (directionOf(payment) === 'receipt' ? 'دریافت' : 'پرداخت'))
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  const invoiceOptions = invoices.filter((invoice) =>
    invoice.status !== 'draft' &&
    invoice.status !== 'void' &&
    invoiceOutstandingAmount(invoice, payments, checks, returns) > 0 &&
    invoice.kind === (form.direction === 'receipt' ? 'sale' : 'purchase') &&
    (!form.customerId || invoice.customerId === form.customerId)
  );

  const selectedInvoice = invoices.find((item) => item.id === form.invoiceId);
  const capacity = selectedInvoice ? paymentCapacity(selectedInvoice, { payments, checks, returns }) : undefined;

  const selectInvoice = (invoiceId: string) => {
    if (!invoiceId) {
      setForm({ ...form, invoiceId: '' });
      return;
    }
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const direction: Payment['direction'] = invoice.kind === 'sale' ? 'receipt' : 'payment';
    const remaining = paymentCapacity(invoice, { payments, checks, returns }).available;
    setForm({
      ...form,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      direction,
      documentNumber: direction === form.direction ? form.documentNumber : reserveDocumentNumber(direction),
      checkId: undefined,
      amount: remaining,
    });
  };



  const submit = async () => {
    const result = await submission.run(() => addPayment(form), () => setOpen(false));
    setFormError(result.message || '');
  };

  return <div className="space-y-5">
    <PageHead
      title="دریافت و پرداخت"
      subtitle="دریافت از مشتری و پرداخت به تامین‌کننده با تسویه صحیح نقدی، کارت و چک"
      action={<div className="flex gap-2"><Button variant="outline" onClick={() => start('payment')}><ArrowUpFromLine className="h-4 w-4" /> پرداخت جدید</Button><Button onClick={() => start('receipt')}><ArrowDownToLine className="h-4 w-4" /> دریافت جدید</Button></div>}
    />
    <Card>
      <CardHeader><SearchBox value={q} onChange={setQ} /></CardHeader>
      <div className="table-wrap"><DataTable className="data-table">
        <thead><tr><th>شماره سند</th><th>تاریخ</th><th>نوع</th><th>طرف حساب</th><th>روش</th><th>فاکتور</th><th>مبلغ</th><th>وضعیت اثر</th><th>مرجع</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((payment) => {
            const invoice = invoiceFor(payment);
            const direction = directionOf(payment);
            const check = payment.checkId ? checks.find((item) => item.id === payment.checkId) : undefined;
            const effective = effectivePaymentAmount(payment, checks) > 0;
            return <tr key={payment.id}>
              <td className="font-black">{payment.documentNumber}</td>
              <td>{formatPersianDate(payment.date)}</td>
              <td><Badge className={direction === 'receipt' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{direction === 'receipt' ? 'دریافت' : 'پرداخت'}</Badge></td>
              <td className="font-bold">{customerName(payment.customerId)}</td>
              <td>{payment.method === 'cash' ? 'نقدی' : payment.method === 'card' ? 'کارت / واریز' : 'چک'}</td>
              <td>{invoice ? <div className="flex flex-wrap items-center gap-1.5"><span>{invoice.number}</span><InvoicePaymentHistoryButton invoiceId={invoice.id} /></div> : '—'}</td>
              <td className={direction === 'receipt' ? 'font-black text-emerald-700' : 'font-black text-rose-700'}>{money(payment.amount)} {settings.currency}</td>
              <td>{payment.method !== 'check' ? <Badge className="bg-emerald-50 text-emerald-700">اعمال‌شده</Badge> : effective ? <Badge className="bg-emerald-50 text-emerald-700">وصول / پاس شده</Badge> : <Badge className={check?.status === 'bounced' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>{check?.status === 'bounced' ? 'برگشتی؛ بدون اثر' : check ? 'در انتظار؛ بدون اثر' : 'چک نامعتبر'}</Badge>}</td>
              <td>{payment.reference || check?.number || '—'}</td>
              <td><div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setSelectedPayment(payment)} title="نمایش جزئیات" aria-label={'نمایش جزئیات سند ' + payment.documentNumber}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-rose-600" title="حذف تراکنش" onClick={async () => {
                  const linkedInvoice = invoiceFor(payment);
                  const currentBalance = linkedInvoice ? invoiceOutstandingAmount(linkedInvoice, payments, checks, returns) : null;
                  const balanceAfterRemoval = linkedInvoice
                    ? invoiceOutstandingAmount(linkedInvoice, payments.filter((item) => item.id !== payment.id), checks, returns)
                    : null;
                  const impact = linkedInvoice
                    ? `مانده فاکتور ${linkedInvoice.number}: اکنون ${money(currentBalance!)} و پس از حذف ${money(balanceAfterRemoval!)} ${settings.currency}.`
                    : 'این سند به فاکتوری متصل نیست و حذف آن مانده فاکتور را تغییر نمی‌دهد.';
                  const reason = await promptDialog(
                    `حذف سند ${payment.documentNumber}. ${impact} در صورت ثبت حسابداری، سند معکوس ایجاد می‌شود. دلیل حذف را وارد کنید:`,
                    { title: 'حذف تراکنش', confirmLabel: 'حذف و ثبت دلیل', danger: true, placeholder: 'دلیل حذف...' }
                  );
                  if (!reason?.trim()) return;
                  const result = await persistOperation(() => deletePayment(payment.id, reason));
                  if (!result.ok) notify(result.message || 'حذف تراکنش انجام نشد.', 'error');
                }}><Trash2 className="h-4 w-4" /></Button>
              </div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={10} text="تراکنشی ثبت نشده است." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader>
          <DialogTitle className="text-lg font-black">{form.direction === 'receipt' ? 'ثبت دریافت' : 'ثبت پرداخت'}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">فاکتور فروش فقط با دریافت و فاکتور خرید فقط با پرداخت تسویه می‌شود. چک تا زمان وصول/پاس شدن روی تسویه اثر ندارد.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{formError}</p>}
          <Field label="نوع تراکنش">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.direction} onChange={(e) => { const direction = e.target.value as Payment['direction']; setForm({ ...form, direction, documentNumber: reserveDocumentNumber(direction), invoiceId: '', checkId: undefined }); }}>
              <option value="receipt">دریافت</option><option value="payment">پرداخت</option>
            </select>
          </Field>
          <Field label="شماره سند"><Input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></Field>
          <Field label="طرف حساب *">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, invoiceId: '', checkId: undefined })}>
              <option value="">انتخاب...</option>{customers.filter((customer) => customer.status !== 'archived').map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </Field>
          <Field label="فاکتور مرتبط">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.invoiceId || ''} onChange={(e) => selectInvoice(e.target.value)}>
              <option value="">بدون اتصال</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.kind === 'sale' ? 'فروش' : 'خرید'} {invoice.number} — مانده {money(invoiceOutstandingAmount(invoice, payments, checks, returns))}</option>)}
            </select>
          </Field>
          <PaymentFields value={form} onChange={setForm} data={{ invoices, payments, checks, returns }} currency={settings.currency} disabled={submission.busy} />
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={submission.busy || !form.customerId || form.amount <= 0 || (capacity !== undefined && form.amount > capacity.available + 0.0001) || (form.method === 'check' && !form.checkId)} onClick={() => void submit()}>ثبت {form.direction === 'receipt' ? 'دریافت' : 'پرداخت'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    <RecordDetailsDialog
      open={!!selectedPayment}
      onOpenChange={(open) => !open && setSelectedPayment(null)}
      title={'سند ' + (selectedPayment?.documentNumber || '')}
      description={selectedPayment?.notes || undefined}
      fields={selectedPayment ? [
        { label: 'نوع', value: directionOf(selectedPayment) === 'receipt' ? 'دریافت' : 'پرداخت' },
        { label: 'تاریخ', value: formatPersianDate(selectedPayment.date) },
        { label: 'طرف حساب', value: customerName(selectedPayment.customerId) },
        { label: 'فاکتور', value: invoiceFor(selectedPayment)?.number || 'بدون اتصال' },
        { label: 'روش', value: selectedPayment.method === 'cash' ? 'نقدی' : selectedPayment.method === 'card' ? 'کارت / واریز' : 'چک' },
        { label: 'مبلغ', value: money(selectedPayment.amount) + ' ' + settings.currency },
        { label: 'شماره پیگیری / مرجع', value: selectedPayment.reference },
        { label: 'شماره چک', value: selectedPayment.checkId ? checks.find((item) => item.id === selectedPayment.checkId)?.number : '—' },
      ] : []}
    />
  </div>;
}

