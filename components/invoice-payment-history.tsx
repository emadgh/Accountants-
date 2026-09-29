'use client';

import { DataTable } from '@/components/ui/data-table';

import { useMemo, useState } from 'react';
import { CalendarClock, History } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import { effectivePaymentAmount, invoiceOutstandingAmount, money, resolvedPaymentDirection, settledForInvoice } from '@/lib/utils';
import { formatPersianDate } from '@/lib/standards';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function InvoicePaymentHistoryButton({ invoiceId }: { invoiceId: string }) {
  const { invoices, payments, checks, returns, settings } = useAccountingStore();
  const [open, setOpen] = useState(false);
  const invoice = invoices.find((item) => item.id === invoiceId);
  const linkedPayments = useMemo(() => payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.documentNumber.localeCompare(a.documentNumber)), [payments, invoiceId]);

  if (!invoice) return null;

  const settled = settledForInvoice(invoice, payments, checks);
  const outstanding = invoiceOutstandingAmount(invoice, payments, checks, returns);
  return <>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={`نمایش سوابق پرداخت فاکتور ${invoice.number}`}
      aria-label={`نمایش سوابق پرداخت فاکتور ${invoice.number}`}
      onClick={() => setOpen(true)}
    >
      <History className="h-4 w-4" />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black"><CalendarClock className="h-5 w-5 text-sky-700" /> سوابق پرداخت فاکتور {invoice.number}</DialogTitle>
          <DialogDescription>تاریخ سند هر دریافت یا پرداخت متصل به این فاکتور، همراه با وضعیت اثر آن در مانده.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          <Card className="p-3"><div className="text-xs text-slate-500">پرداخت مؤثر</div><div className="mt-1 font-black text-emerald-700">{money(settled)} {settings.currency}</div></Card>
          <Card className="p-3"><div className="text-xs text-slate-500">مانده فاکتور</div><div className="mt-1 font-black text-rose-700">{money(outstanding)} {settings.currency}</div></Card>
          <Card className="p-3"><div className="text-xs text-slate-500">تراکنش متصل</div><div className="mt-1 font-black">{linkedPayments.length}</div></Card>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <DataTable className="data-table min-w-[680px]">
            <thead><tr><th>تاریخ سند</th><th>شماره سند</th><th>نوع / روش</th><th>مبلغ</th><th>وضعیت اثر</th><th>مرجع / چک</th></tr></thead>
            <tbody>
              {linkedPayments.map((payment) => {
                const check = payment.checkId ? checks.find((item) => item.id === payment.checkId) : undefined;
                const effective = effectivePaymentAmount(payment, checks);
                const direction = resolvedPaymentDirection(payment, invoice);
                const paymentStatus = payment.method !== 'check'
                  ? { label: 'اعمال‌شده در مانده', className: 'bg-emerald-50 text-emerald-700' }
                  : check?.status === 'cleared'
                    ? { label: 'وصول / پاس‌شده', className: 'bg-emerald-50 text-emerald-700' }
                    : check?.status === 'bounced'
                      ? { label: 'برگشتی · بدون اثر', className: 'bg-rose-50 text-rose-700' }
                      : check
                        ? { label: 'در انتظار · بدون اثر', className: 'bg-amber-50 text-amber-700' }
                        : { label: 'چک نامعتبر · بدون اثر', className: 'bg-slate-100 text-slate-600' };
                return <tr key={payment.id}>
                  <td className="whitespace-nowrap">{formatPersianDate(payment.date)}</td>
                  <td className="font-bold">{payment.documentNumber || '—'}</td>
                  <td>{direction === 'receipt' ? 'دریافت' : 'پرداخت'} · {payment.method === 'cash' ? 'نقدی' : payment.method === 'card' ? 'کارت / واریز' : 'چک'}</td>
                  <td className="whitespace-nowrap font-bold">{money(payment.amount)} {settings.currency}</td>
                  <td><Badge className={paymentStatus.className}>{paymentStatus.label}{payment.method === 'check' && effective > 0 ? ` · ${money(effective)} مؤثر` : ''}</Badge></td>
                  <td>{payment.reference || check?.number || '—'}{check?.dueDate ? <div className="text-[10px] text-slate-400">سررسید چک: {formatPersianDate(check.dueDate)}</div> : null}</td>
                </tr>;
              })}
              {!linkedPayments.length && <tr><td colSpan={6} className="py-10 text-center text-slate-400">برای این فاکتور پرداختی ثبت نشده است.</td></tr>}
            </tbody>
          </DataTable>
        </div>
        <p className="text-xs leading-5 text-slate-500">برای پرداخت چکی، تاریخ سند نمایش داده می‌شود؛ تاریخ سررسید جداگانه است و تاریخ وصول واقعی چک در برنامه ثبت نشده است.</p>
      </DialogContent>
    </Dialog>
  </>;
}
