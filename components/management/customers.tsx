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
import { RecordDetailsDialog } from '@/components/ui/record-details-dialog';
import { UnsavedChangesBadge, useUnsavedDraft } from '@/components/ui/unsaved-changes';
import { confirmDialog, notify } from '@/lib/feedback';
import { validateOfficialFields } from '@/lib/standards';
import { flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { Customer } from '@/lib/types';
import { customerNetBalance, money, uid } from '@/lib/utils';
import {
  Archive,
  BookOpen, Check,
  Edit3, Eye,
  Plus,
  Trash2
} from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, PageHead, SearchBox } from './shared';
export function CustomersView({ onOpenLedger }: { onOpenLedger?: (customerId: string) => void }) {
  const submission = useAsyncSubmission();
  const { customers, invoices, returns, payments, checks, adjustments, upsertCustomer, deleteCustomer, settings } = useAccountingStore(useShallow((state) => ({ customers: state.customers, invoices: state.invoices, returns: state.returns, payments: state.payments, checks: state.checks, adjustments: state.adjustments, upsertCustomer: state.upsertCustomer, deleteCustomer: state.deleteCustomer, settings: state.settings })));
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const customerDraft = useUnsavedDraft<Customer>('طرف حساب');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const list = customers.filter((customer) =>
    (statusFilter === 'all' || customer.status === statusFilter) &&
    (customer.name + ' ' + customer.phone + ' ' + customer.code).toLowerCase().includes(q.toLowerCase())
  );
  const balance = (customer: Customer) => customerNetBalance(customer.id, invoices, payments, checks, adjustments, customer.openingBalance || 0, returns);
  const startEdit = (customer?: Customer) => {
    const draft: Customer = customer ? { ...customer } : {
      id: uid('cus'),
      code: String(100000 + customers.length + 1),
      name: '',
      kind: 'customer',
      status: 'active',
      phone: '',
      address: '',
      nationalId: '',
      economicCode: '',
      postalCode: '',
      openingBalance: 0,
      priceGroup: '',
    };
    customerDraft.markClean(draft);
    setFormError('');
    setEdit(draft);
    setOpen(true);
  };

  const closeCustomerForm = () => customerDraft.requestClose(edit, () => setOpen(false));

  const saveCustomer = () => submission.run(async () => {
    if (!edit) return;
    setFormError('');
    const errors = validateOfficialFields(edit);
    if (errors.length) {
      setFormError(errors.join(' '));
      return;
    }
    upsertCustomer(edit);
    try { await flushAccountingPersistence(); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'ذخیره مشتری روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; }
    customerDraft.markClean(edit);
    setOpen(false);
  });

  return <div className="space-y-5">
    <PageHead title="مشتریان و تامین‌کنندگان" subtitle="مشخصات رسمی، مانده حساب و دسترسی به دفتر گردش طرف حساب" action={<Button onClick={() => startEdit()}><Plus className="h-4 w-4" /> طرف حساب جدید</Button>} />
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="نام، تلفن یا کد شخص..." />
        <div className="flex gap-2">
          {([['active', 'فعال'], ['archived', 'آرشیو'], ['all', 'همه']] as const).map(([key, label]) => <Button key={key} size="sm" variant={statusFilter === key ? 'default' : 'outline'} onClick={() => setStatusFilter(key)}>{label}</Button>)}
        </div>
      </CardHeader>
      <div className="table-wrap"><DataTable className="data-table">
        <thead><tr><th>کد</th><th>نام</th><th>نوع</th><th>وضعیت</th><th>تلفن</th><th>آدرس</th><th>مانده حساب</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((customer) => {
            const currentBalance = balance(customer);
            return <tr key={customer.id}>
              <td className="font-bold">{customer.code}</td>
              <td className="font-bold">{customer.name}</td>
              <td>{customer.kind === 'customer' ? 'مشتری' : customer.kind === 'supplier' ? 'تامین‌کننده' : 'هر دو'}</td>
              <td><Badge className={customer.status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}>{customer.status === 'archived' ? 'آرشیو' : 'فعال'}</Badge></td>
              <td><span dir="rtl">{customer.phone || '—'}</span></td>
              <td className="max-w-xs truncate">{customer.address || '—'}</td>
              <td className={currentBalance > 0 ? 'font-black text-rose-600' : currentBalance < 0 ? 'font-black text-emerald-600' : 'font-bold'}>
                {money(Math.abs(currentBalance))} {settings.currency}{currentBalance > 0 ? ' بدهکار' : currentBalance < 0 ? ' بستانکار' : ''}
              </td>
              <td><div className="flex gap-1">
                {onOpenLedger && <Button variant="ghost" size="icon" onClick={() => onOpenLedger(customer.id)} title="دفتر حساب"><BookOpen className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(customer)} title="نمایش جزئیات" aria-label={'نمایش جزئیات ' + customer.name}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => startEdit(customer)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className={customer.status === 'archived' ? 'text-emerald-600' : 'text-amber-600'} onClick={() => upsertCustomer({ ...customer, status: customer.status === 'archived' ? 'active' : 'archived' })} title={customer.status === 'archived' ? 'بازگردانی' : 'آرشیو کردن'}>{customer.status === 'archived' ? <Check className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
                <Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('طرف حساب حذف شود؟', { title: 'حذف طرف حساب', confirmLabel: 'حذف', danger: true })) { const result = await persistOperation(() => deleteCustomer(customer.id)); if (!result.ok) notify(result.message || 'حذف طرف حساب انجام نشد.', 'error'); } }} title="حذف"><Trash2 className="h-4 w-4" /></Button>
              </div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={8} text="طرف حسابی پیدا نشد." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else void closeCustomerForm(); }}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader>
          <div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-lg font-black">{edit && customers.some((customer) => customer.id === edit.id) ? 'ویرایش طرف حساب' : 'طرف حساب جدید'}</DialogTitle><UnsavedChangesBadge visible={customerDraft.hasChanges(edit)} /></div>
          <DialogDescription className="text-sm text-slate-500">اطلاعات حقوقی برای فاکتور رسمی قابل استفاده است. مانده اول دوره فقط هنگام ساخت طرف حساب تعیین می‌شود.</DialogDescription>
        </DialogHeader>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{formError}</p>}
          <Field label="نام *"><Input value={edit.name} aria-invalid={!edit.name.trim()} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="کد شخص"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Customer['kind'] })}><option value="customer">مشتری</option><option value="supplier">تامین‌کننده</option><option value="both">هر دو</option></select></Field>
          <Field label="وضعیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Customer['status'] })}><option value="active">فعال</option><option value="archived">آرشیو</option></select></Field>
          <Field label="گروه قیمت (اختیاری)"><Input value={edit.priceGroup || ''} onChange={(e) => setEdit({ ...edit, priceGroup: e.target.value.trimStart() })} placeholder="مثلاً همکار" /></Field>
          <Field label="تلفن"><Input dir="rtl" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="شناسه ملی"><FormattedInput format="nationalId" value={edit.nationalId} onValueChange={(nationalId) => setEdit({ ...edit, nationalId })} /></Field>
          <Field label="کد اقتصادی"><FormattedInput format="economicCode" value={edit.economicCode} onValueChange={(economicCode) => setEdit({ ...edit, economicCode })} /></Field>
          <Field label="کد پستی"><FormattedInput format="postalCode" value={edit.postalCode} onValueChange={(postalCode) => setEdit({ ...edit, postalCode })} /></Field>
          <Field label="مانده اول دوره">
            <FormattedInput allowNegative disabled={customers.some((customer) => customer.id === edit.id)} className={customers.some((customer) => customer.id === edit.id) ? 'bg-slate-100' : ''} value={edit.openingBalance || 0} onValueChange={(openingBalance) => setEdit({ ...edit, openingBalance })} />
            <span className="mt-1 block text-[10px] leading-5 text-slate-400">مثبت = بدهکار، منفی = بستانکار. اصلاحات بعدی از دفتر حساب ثبت می‌شوند.</span>
          </Field>
          <Field label="آدرس" className="sm:col-span-2"><Textarea value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => void closeCustomerForm()}>انصراف</Button>
            <Button disabled={submission.busy || !edit.name.trim()} onClick={saveCustomer}><Check className="h-4 w-4" /> ذخیره</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <RecordDetailsDialog
      open={!!selectedCustomer}
      onOpenChange={(open) => !open && setSelectedCustomer(null)}
      title={selectedCustomer?.name || 'جزئیات طرف حساب'}
      fields={selectedCustomer ? [
        { label: 'کد شخص', value: selectedCustomer.code },
        { label: 'نوع', value: selectedCustomer.kind === 'customer' ? 'مشتری' : selectedCustomer.kind === 'supplier' ? 'تأمین‌کننده' : 'مشتری و تأمین‌کننده' },
        { label: 'وضعیت', value: selectedCustomer.status === 'active' ? 'فعال' : 'آرشیو' },
        { label: 'تلفن', value: selectedCustomer.phone },
        { label: 'شناسه ملی', value: selectedCustomer.nationalId },
        { label: 'کد اقتصادی', value: selectedCustomer.economicCode },
        { label: 'کد پستی', value: selectedCustomer.postalCode },
        { label: 'آدرس', value: selectedCustomer.address, className: 'sm:col-span-2' },
        { label: 'مانده حساب', value: money(Math.abs(balance(selectedCustomer))) + ' ' + settings.currency + (balance(selectedCustomer) > 0 ? ' بدهکار' : balance(selectedCustomer) < 0 ? ' بستانکار' : ' تسویه'), className: 'sm:col-span-2' },
      ] : []}
      onEdit={selectedCustomer ? () => { const customer = selectedCustomer; setSelectedCustomer(null); startEdit(customer); } : undefined}
    />
  </div>;
}

