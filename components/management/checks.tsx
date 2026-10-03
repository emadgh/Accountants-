'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { useAsyncSubmission } from '@/hooks/use-persisted-action';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';
import { persistOperation } from '@/lib/operation-result';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { RecordDetailsDialog } from '@/components/ui/record-details-dialog';
import { confirmDialog, notify } from '@/lib/feedback';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { CheckRecord } from '@/lib/types';
import { money, uid } from '@/lib/utils';
import {
  Edit3, Eye,
  Plus,
  Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { CheckStatus, EmptyRow, PageHead } from './shared';
export function ChecksView({ initialCheckId }: { initialCheckId?: string | null } = {}) {
  const submission = useAsyncSubmission();
  const { checks, payments, customers, reserveDocumentNumber, upsertCheck, deleteCheck, settings } = useAccountingStore(useShallow((state) => ({ checks: state.checks, payments: state.payments, customers: state.customers, reserveDocumentNumber: state.reserveDocumentNumber, upsertCheck: state.upsertCheck, deleteCheck: state.deleteCheck, settings: state.settings })));
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedCheck, setSelectedCheck] = useState<CheckRecord | null>(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState<CheckRecord>({ id: '', documentNumber: '', direction: 'received', customerId: '', amount: 0, dueDate: todayIso(), number: '', bank: '', owner: '', status: 'pending', notes: '' });

  useEffect(() => {
    if (!initialCheckId) return;
    const check = checks.find((item) => item.id === initialCheckId);
    if (check) {
      setSelectedCheck(check);
      setFilter(check.status);
    }
    // Apply this only when a report deep-link is selected, not after local check updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCheckId]);

  const start = (check?: CheckRecord) => {
    setForm(check ? { ...check } : { id: uid('chk'), documentNumber: reserveDocumentNumber('check'), direction: 'received', customerId: '', amount: 0, dueDate: todayIso(), number: '', bank: '', owner: '', status: 'pending', notes: '' });
    setOpen(true);
    setFormError('');
  };
  const list = checks.filter((check) => filter === 'all' || check.status === filter);
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name || '—';
  const linkedPayment = payments.find((payment) => payment.checkId === form.id);

  const save = () => submission.run(async () => {
    const previous = checks.find((item) => item.id === form.id);
    const linked = payments.find((payment) => payment.checkId === form.id);
    if (previous && linked && previous.status !== form.status) {
      const wasEffective = previous.status === 'cleared';
      const becomingEffective = form.status === 'cleared';
      const changesFinancialEffect = wasEffective !== becomingEffective;
      const statusLabel = (status: CheckRecord['status']) => status === 'cleared' ? 'وصول / پاس‌شده' : status === 'bounced' ? 'برگشتی' : 'در انتظار';
      const approved = await confirmDialog(
        changesFinancialEffect
          ? `${becomingEffective ? 'وصول / پاس شدن' : 'خارج شدن از وضعیت وصول‌شده'} این چک، مبلغ ${money(linked.amount)} ${settings.currency} را ${becomingEffective ? 'در مانده فاکتور اعمال و سند روزنامه ثبت' : 'از مانده فاکتور خارج و اثر سند روزنامه را معکوس'} می‌کند. ادامه می‌دهید؟`
          : `وضعیت این چک از «${statusLabel(previous.status)}» به «${statusLabel(form.status)}» تغییر می‌کند. این تراکنش در مانده فاکتور اثری نداشته و نخواهد داشت. ادامه می‌دهید؟`,
        { title: 'تأیید تغییر وضعیت چک', confirmLabel: 'تأیید و ذخیره' }
      );
      if (!approved) return;
    }
    const result = upsertCheck(form);
    if (!result.ok) {
      setFormError(result.message || 'ذخیره چک انجام نشد.');
      return;
    }
    try { await flushAccountingPersistence(); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'ذخیره چک روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; }
    setOpen(false);
  });

  const remove = async (id: string) => {
    if (!(await confirmDialog('چک حذف شود؟', { title: 'حذف چک', confirmLabel: 'حذف', danger: true }))) return;
    const result = await persistOperation(() => deleteCheck(id));
    if (!result.ok) notify(result.message || 'حذف چک انجام نشد.', 'error');
  };

  return <div className="space-y-5">
    <PageHead title="چک‌ها و سررسید" subtitle="چک‌های دریافتی و پرداختی؛ اثر مالی چک فقط پس از وصول/پاس شدن اعمال می‌شود" action={<Button onClick={() => start()}><Plus className="h-4 w-4" /> چک جدید</Button>} />
    <Card>
      <CardHeader><div className="flex flex-wrap gap-2">{[['all','همه'],['pending','در انتظار'],['cleared','وصول / پاس شده'],['bounced','برگشتی']].map(([key,label]) => <Button key={key} variant={filter === key ? 'default' : 'outline'} size="sm" onClick={() => setFilter(key)}>{label}</Button>)}</div></CardHeader>
      <div className="table-wrap"><DataTable className="data-table">
        <thead><tr><th>شماره سند</th><th>نوع</th><th>طرف حساب</th><th>شماره چک</th><th>بانک</th><th>مبلغ</th><th>سررسید</th><th>وضعیت</th><th>اتصال</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((check) => {
            const linked = payments.find((payment) => payment.checkId === check.id);
            return <tr key={check.id}>
              <td className="font-black">{check.documentNumber}</td>
              <td>{check.direction === 'received' ? <span className="font-bold text-emerald-700">دریافتی</span> : <span className="font-bold text-rose-700">پرداختی</span>}</td>
              <td className="font-bold">{customerName(check.customerId)}</td><td>{check.number}</td><td>{check.bank}</td>
              <td className="font-black">{money(check.amount)} {settings.currency}</td><td>{check.dueDate ? formatPersianDate(check.dueDate) : '—'}</td><td><CheckStatus status={check.status} /></td>
              <td>{linked ? <Badge className="bg-sky-50 text-sky-700">متصل به تراکنش</Badge> : <span className="text-slate-400">آزاد</span>}</td>
              <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setSelectedCheck(check)} title="نمایش جزئیات" aria-label={'نمایش جزئیات چک ' + check.number}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => start(check)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => remove(check.id)} title="حذف"><Trash2 className="h-4 w-4" /></Button></div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={10} text="چکی در این وضعیت وجود ندارد." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">ثبت / ویرایش چک</DialogTitle><DialogDescription className="text-sm text-slate-500">{linkedPayment ? 'این چک به تراکنش متصل است؛ نوع، طرف حساب و مبلغ قفل هستند. تغییر وضعیت چک، تسویه فاکتور را خودکار باز محاسبه می‌کند.' : 'چک می‌تواند بعداً از بخش دریافت و پرداخت به یک تراکنش متصل شود.'}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{formError}</p>}
          <Field label="نوع"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CheckRecord['direction'] })}><option value="received">دریافتی</option><option value="issued">پرداختی</option></select></Field>
          <Field label="طرف حساب"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">انتخاب...</option>{customers.filter((customer) => customer.status !== 'archived' || customer.id === form.customerId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
          <Field label="شماره چک"><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
          <Field label="بانک"><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
          <Field label="صاحب چک"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label={`مبلغ (${settings.currency})`}><FormattedInput readOnly={!!linkedPayment} className={linkedPayment ? 'bg-slate-100' : ''} min={0} value={form.amount} onValueChange={(amount) => setForm({ ...form, amount })} /></Field>
          <Field label="سررسید"><JalaliDatePicker value={form.dueDate || todayIso()} onChange={(dueDate) => setForm({ ...form, dueDate })} /></Field>
          <Field label="وضعیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CheckRecord['status'] })}><option value="pending">در انتظار</option><option value="cleared">وصول / پاس شده</option><option value="bounced">برگشتی</option></select></Field>
          <Field label="توضیحات" className="sm:col-span-2"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={submission.busy || !form.customerId || form.amount <= 0} onClick={save}>ذخیره</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    <RecordDetailsDialog
      open={!!selectedCheck}
      onOpenChange={(open) => !open && setSelectedCheck(null)}
      title={'چک ' + (selectedCheck?.number || '')}
      description={selectedCheck?.notes || undefined}
      fields={selectedCheck ? [
        { label: 'شماره سند', value: selectedCheck.documentNumber },
        { label: 'نوع', value: selectedCheck.direction === 'received' ? 'دریافتی' : 'پرداختی' },
        { label: 'طرف حساب', value: customerName(selectedCheck.customerId) },
        { label: 'بانک', value: selectedCheck.bank },
        { label: 'صاحب چک', value: selectedCheck.owner },
        { label: 'مبلغ', value: money(selectedCheck.amount) + ' ' + settings.currency },
        { label: 'سررسید', value: selectedCheck.dueDate ? formatPersianDate(selectedCheck.dueDate) : '—' },
        { label: 'وضعیت', value: selectedCheck.status === 'cleared' ? 'وصول / پاس‌شده' : selectedCheck.status === 'bounced' ? 'برگشتی' : 'در انتظار' },
        { label: 'اتصال', value: payments.some((payment) => payment.checkId === selectedCheck.id) ? 'متصل به تراکنش' : 'آزاد' },
      ] : []}
      onEdit={selectedCheck ? () => { const check = selectedCheck; setSelectedCheck(null); start(check); } : undefined}
    />
  </div>;
}

