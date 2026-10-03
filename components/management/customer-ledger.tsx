'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { useAsyncSubmission } from '@/hooks/use-persisted-action';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';

import { InvoicePaymentHistoryButton } from '@/components/invoice-payment-history';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { MetricCard } from '@/components/ui/metric-card';
import { confirmDialog, notify } from '@/lib/feedback';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { CustomerLedgerEntry, InvoiceKind } from '@/lib/types';
import { buildCustomerLedger, money, normalizeDateKey, uid } from '@/lib/utils';
import {
  ArrowDownToLine, ArrowUpFromLine,
  CircleDollarSign,
  FileText,
  Plus
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { EmptyRow, LedgerStatus, PageHead } from './shared';
import styles from './customer-ledger.module.css';

function ledgerRowKind(entry: CustomerLedgerEntry): CustomerLedgerEntry['kind'] {
  return (entry.kind === 'receipt' || entry.kind === 'payment') && entry.status && entry.status !== 'effective'
    ? 'check' : entry.kind;
}
export function CustomerLedgerView({
  initialCustomerId,
  onOpenInvoice,
}: {
  initialCustomerId?: string | null;
  onOpenInvoice?: (invoiceId: string, kind: InvoiceKind) => void;
}) {
  const submission = useAsyncSubmission();
  const { customers, invoices, returns, payments, checks, adjustments, addAdjustment, settings } = useAccountingStore(useShallow((state) => ({ customers: state.customers, invoices: state.invoices, returns: state.returns, payments: state.payments, checks: state.checks, adjustments: state.adjustments, addAdjustment: state.addAdjustment, settings: state.settings })));
  const [selectedId, setSelectedId] = useState(initialCustomerId || customers[0]?.id || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filter, setFilter] = useState<'all' | 'invoice' | 'money' | 'check' | 'adjustment'>('all');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDirection, setAdjustDirection] = useState<'debit' | 'credit'>('debit');
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustDate, setAdjustDate] = useState(todayIso());
  const [adjustNote, setAdjustNote] = useState('');

  useEffect(() => {
    if (initialCustomerId) setSelectedId(initialCustomerId);
  }, [initialCustomerId]);

  const customer = customers.find((item) => item.id === selectedId);
  const ledger = useMemo(
    () => customer ? buildCustomerLedger(customer, invoices, payments, checks, adjustments, returns) : [],
    [customer, invoices, returns, payments, checks, adjustments]
  );
  const fromKey = fromDate.trim() ? normalizeDateKey(fromDate) : '';
  const toKey = toDate.trim() ? normalizeDateKey(toDate) : '';
  const visible = ledger.filter((entry) => {
    if (entry.kind === 'opening' && fromKey) return false;
    const dateKey = entry.kind === 'opening' ? '0000-00-00' : normalizeDateKey(entry.date);
    if (fromKey && dateKey < fromKey) return false;
    if (toKey && dateKey > toKey) return false;
    if (filter === 'all') return true;
    if (filter === 'invoice') return entry.kind === 'sale' || entry.kind === 'purchase' || entry.kind === 'void';
    if (filter === 'money') return entry.kind === 'receipt' || entry.kind === 'payment';
    if (filter === 'check') return entry.kind === 'check' || ((entry.kind === 'receipt' || entry.kind === 'payment') && !!entry.status && entry.status !== 'effective');
    return entry.kind === 'adjustment' || entry.kind === 'opening';
  });
  const currentBalance = ledger.length ? ledger[ledger.length - 1].balance : 0;
  const visibleDebit = visible.reduce((sum, entry) => sum + entry.debit, 0);
  const visibleCredit = visible.reduce((sum, entry) => sum + entry.credit, 0);

  const submitAdjustment = () => submission.run(async () => {
    if (!customer) return;
    const amount = Math.abs(Number(adjustAmount || 0));
    if (amount <= 0 || !adjustNote.trim()) return;
    const effect = adjustDirection === 'debit' ? amount : -amount;
    const approved = await confirmDialog(
      `اصلاحیه ${adjustDirection === 'debit' ? 'بدهکار' : 'بستانکار'} به مبلغ ${money(amount)} ${settings.currency} برای «${customer.name}» ثبت می‌شود. مانده از ${money(Math.abs(currentBalance))} ${currentBalance > 0 ? 'بدهکار' : currentBalance < 0 ? 'بستانکار' : 'تسویه'} به ${money(Math.abs(currentBalance + effect))} ${currentBalance + effect > 0 ? 'بدهکار' : currentBalance + effect < 0 ? 'بستانکار' : 'تسویه'} تغییر می‌کند. ادامه می‌دهید؟`,
      { title: 'تأیید اصلاحیه حساب', confirmLabel: 'ثبت اصلاحیه' }
    );
    if (!approved) return;
    const result = addAdjustment({
      id: uid('adj'),
      customerId: customer.id,
      date: adjustDate,
      amount: adjustDirection === 'debit' ? amount : -amount,
      note: adjustNote,
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) {
      notify(result.message || 'ثبت اصلاحیه انجام نشد.', 'error');
      return;
    }
    try { await flushAccountingPersistence(); } catch (error) { notify(error instanceof Error ? error.message : 'ذخیره انجام نشد؛ فرم حفظ شد.', 'error'); return; }
    setAdjustAmount(0);
    setAdjustNote('');
    setAdjustDate(todayIso());
    setAdjustOpen(false);
  });

  return <div className="space-y-5">
    <PageHead title="دفتر حساب طرف حساب" subtitle="گردش بدهکار/بستانکار، مانده جاری، اسناد مبنا و اصلاحیه‌های قابل ردیابی" action={<Button disabled={!customer} onClick={() => setAdjustOpen(true)}><Plus className="h-4 w-4" /> ثبت اصلاحیه</Button>} />

    <Card>
      <CardContent className="grid gap-3 md:grid-cols-[1.3fr_.8fr_.8fr_1fr]">
        <Field label="طرف حساب">
          <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">انتخاب...</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
          </select>
        </Field>
        <Field label="از تاریخ"><Input value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="۱۴۰۵/۰۱/۰۱" /></Field>
        <Field label="تا تاریخ"><Input value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="۱۴۰۵/۱۲/۲۹" /></Field>
        <Field label="نوع گردش"><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">همه</option><option value="invoice">فاکتورها</option><option value="money">دریافت / پرداخت</option><option value="check">چک‌ها</option><option value="adjustment">اول دوره / اصلاحیه</option></select></Field>
      </CardContent>
    </Card>

    {customer ? <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={CircleDollarSign} title="مانده جاری" value={currentBalance === 0 ? '0 ' + settings.currency : money(Math.abs(currentBalance)) + ' ' + settings.currency + ' ' + (currentBalance > 0 ? 'بدهکار' : 'بستانکار')} tone={currentBalance > 0 ? 'danger' : currentBalance < 0 ? 'success' : 'neutral'} />
        <MetricCard icon={ArrowDownToLine} title="جمع بدهکار بازه" value={money(visibleDebit) + ' ' + settings.currency} />
        <MetricCard icon={ArrowUpFromLine} title="جمع بستانکار بازه" value={money(visibleCredit) + ' ' + settings.currency} />
      </div>

      <Card>
        <CardHeader>
          <div><CardTitle>{customer.name}</CardTitle><div className="mt-1 text-xs text-slate-500">کد شخص {customer.code} · {visible.length} گردش در فیلتر فعلی</div></div>
          <Badge className={currentBalance > 0 ? 'bg-rose-50 text-rose-700' : currentBalance < 0 ? 'bg-emerald-50 text-emerald-700' : ''}>{currentBalance > 0 ? 'بدهکار' : currentBalance < 0 ? 'بستانکار' : 'تسویه'}</Badge>
        </CardHeader>
        <div className="table-wrap"><DataTable className="data-table min-w-[980px]">
          <thead><tr><th>تاریخ</th><th>شرح</th><th>مرجع</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th><th>وضعیت / سند</th></tr></thead>
          <tbody>
            {visible.map((entry) => <tr key={entry.id} className={styles.row} data-ledger-kind={ledgerRowKind(entry)}>
              <td>{entry.date === 'ابتدای دوره' ? entry.date : formatPersianDate(entry.date)}</td>
              <td><div className={styles.kindLabel}>{entry.title}</div>{entry.note && <div className="mt-1 max-w-[360px] text-[11px] leading-5 text-slate-500">{entry.note}</div>}{!entry.effective && entry.nominalAmount ? <div className="mt-1 text-[10px] text-amber-600">مبلغ اسمی {money(entry.nominalAmount)}؛ بدون اثر در مانده</div> : null}</td>
              <td>{entry.reference || '—'}</td>
              <td className={entry.debit ? styles.debit : styles.emptyAmount}>{entry.debit ? money(entry.debit) : '—'}</td>
              <td className={entry.credit ? styles.credit : styles.emptyAmount}>{entry.credit ? money(entry.credit) : '—'}</td>
              <td className={styles.balance}>{money(Math.abs(entry.balance))}{entry.balance > 0 ? ' بدهکار' : entry.balance < 0 ? ' بستانکار' : ''}</td>
              <td><div className="flex flex-wrap items-center gap-2"><LedgerStatus status={entry.status} effective={entry.effective} kind={entry.kind} />{entry.invoiceId && entry.invoiceKind && onOpenInvoice && <Button variant="ghost" size="sm" onClick={() => onOpenInvoice(entry.invoiceId!, entry.invoiceKind!)}><FileText className="h-3.5 w-3.5" /> سند مبنا</Button>}{entry.invoiceId && entry.invoiceKind && (entry.kind === 'sale' || entry.kind === 'purchase' || entry.kind === 'void') && <InvoicePaymentHistoryButton invoiceId={entry.invoiceId} />}</div></td>
            </tr>)}
            {!visible.length && <EmptyRow cols={7} text="گردشی مطابق فیلتر فعلی وجود ندارد." />}
          </tbody>
        </DataTable></div>
      </Card>
    </> : <Card><CardContent className="py-16 text-center text-slate-400">برای مشاهده دفتر حساب، یک طرف حساب انتخاب کنید.</CardContent></Card>}

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">ثبت اصلاحیه حساب</DialogTitle><DialogDescription className="text-sm text-slate-500">اصلاحیه به‌عنوان یک گردش مستقل ذخیره می‌شود و مانده اول دوره یا اسناد قبلی را بازنویسی نمی‌کند.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع اصلاحیه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as 'debit' | 'credit')}><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></Field>
          <Field label={'مبلغ (' + settings.currency + ')'}><FormattedInput min={0} value={adjustAmount} onValueChange={setAdjustAmount} /></Field>
          <Field label="تاریخ"><JalaliDatePicker value={adjustDate} onChange={setAdjustDate} /></Field>
          <Field label="طرف حساب"><Input value={customer?.name || ''} readOnly className="bg-slate-100" /></Field>
          <Field label="دلیل اصلاحیه *" className="sm:col-span-2"><Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="مثلاً اصلاح مانده انتقالی طبق سند..." /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button><Button disabled={submission.busy || !customer || adjustAmount <= 0 || !adjustNote.trim()} onClick={submitAdjustment}>ثبت اصلاحیه</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

