'use client';

import { DataTable } from '@/components/ui/data-table';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock,
  BookOpen, Check, CircleDollarSign, Edit3, Eye, FileText, Package, Plus, Search,
  Trash2, UserRound, WalletCards
} from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import { INVOICE_TEMPLATES } from '@/lib/invoice-templates';
import { clearApplicationDatabase, flushAccountingPersistence } from '@/lib/storage';
import type { BusinessSettings, CheckRecord, Customer, InvoiceKind, Payment, Product, StockMovement } from '@/lib/types';
import { buildCustomerLedger, customerNetBalance, effectivePaymentAmount, invoiceOutstandingAmount, invoiceTotal, money, normalizeDateKey, resolvedPaymentDirection, settledForInvoice, uid } from '@/lib/utils';
import { formatPersianDate, todayIso, validateOfficialFields } from '@/lib/standards';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StorageBackupPanel } from '@/components/storage-backup-panel';
import { YasImporterPanel } from '@/components/yas-importer-panel';
import { InvoicePaymentDialog } from '@/components/invoice-payment-dialog';
import { InvoicePaymentHistoryButton } from '@/components/invoice-payment-history';
import { confirmDialog, notify, promptDialog } from '@/lib/feedback';
import { AppNavbarContent } from '@/components/app-navbar';
import { Field } from '@/components/ui/field';
import { RecordDetailsDialog } from '@/components/ui/record-details-dialog';
import { UnsavedChangesBadge, useUnsavedDraft } from '@/components/ui/unsaved-changes';

function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <AppNavbarContent title={title} subtitle={subtitle} actions={action} />;
}

function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative w-full max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pr-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function InvoiceListView({ kind, onView, onEdit, onNew }: { kind: InvoiceKind; onView: (id: string) => void; onEdit: (id: string) => void; onNew: () => void }) {
  const { invoices, returns, payments, checks, deleteInvoice, reserveDocumentNumber, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [paymentAction, setPaymentAction] = useState<{ invoiceId: string; documentNumber: string } | null>(null);
  const todayKey = normalizeDateKey(todayIso());
  const list = invoices.filter((i) => i.kind === kind)
    .filter((i) => (i.number + ' ' + i.customerName).toLowerCase().includes(q.toLowerCase()))
    .filter((i) => status === 'all' || i.status === status)
    .filter((i) => !dateFrom || normalizeDateKey(i.date) >= normalizeDateKey(dateFrom))
    .filter((i) => !dateTo || normalizeDateKey(i.date) <= normalizeDateKey(dateTo))
    .filter((i) => {
      const remaining = invoiceOutstandingAmount(i, payments, checks, returns);
      if (balanceFilter === 'open') return remaining > 0 && i.status !== 'draft' && i.status !== 'void';
      if (balanceFilter === 'settled') return remaining <= 0 && i.status !== 'draft' && i.status !== 'void';
      if (balanceFilter === 'overdue') return remaining > 0 && !!i.dueDate && normalizeDateKey(i.dueDate) < todayKey && i.status !== 'draft' && i.status !== 'void';
      return true;
    });
  const label = kind === 'sale' ? 'فاکتورهای فروش' : 'فاکتورهای خرید';
  const startPayment = (invoiceId: string) => {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const direction = invoice.kind === 'sale' ? 'receipt' : 'payment';
    setPaymentAction({ invoiceId, documentNumber: reserveDocumentNumber(direction) });
  };
  return <div className="space-y-5">
    <PageHead title={label} subtitle="ثبت، جستجو، ویرایش و کنترل وضعیت فاکتورها" action={<Button onClick={onNew}><Plus className="h-4 w-4" /> {kind === 'sale' ? 'فاکتور فروش جدید' : 'فاکتور خرید جدید'}</Button>} />
    <Card><CardHeader className="flex-wrap"><SearchBox value={q} onChange={setQ} /><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">همه وضعیت‌ها</option><option value="draft">پیش‌نویس</option><option value="final">قطعی</option><option value="partial">بخشی تسویه</option><option value="settled">تسویه‌شده</option><option value="void">باطل</option></select><JalaliDatePicker value={dateFrom} onChange={setDateFrom} placeholder="از تاریخ" className="max-w-40" /><JalaliDatePicker value={dateTo} onChange={setDateTo} placeholder="تا تاریخ" className="max-w-40" /><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}><option value="all">همه مانده‌ها</option><option value="open">مانده‌دار</option><option value="settled">تسویه‌شده</option><option value="overdue">سررسیدگذشته</option></select></CardHeader>
      <div className="table-wrap"><DataTable className="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>سررسید</th><th>طرف حساب</th><th>وضعیت</th><th>مبلغ کل</th><th>پرداخت</th><th>مانده</th><th>عملیات</th></tr></thead><tbody>
        {list.map((i) => {
          const total = invoiceTotal(i);
          const returned = returns.filter((document) => document.originalInvoiceId === i.id && document.status === 'final').reduce((sum, document) => sum + document.totalAmount, 0);
          const netTotal = Math.max(0, total - returned);
          const paid = settledForInvoice(i, payments, checks);
          const remaining = invoiceOutstandingAmount(i, payments, checks, returns);
          const canReceive = i.status !== 'draft' && i.status !== 'void' && remaining > 0;
          const canEdit = i.status !== 'settled' && i.status !== 'void';
          return <tr key={i.id}>
            <td className="font-black">{i.number}</td><td>{formatPersianDate(i.date)}</td><td>{i.dueDate ? <span className={remaining > 0 && normalizeDateKey(i.dueDate) < todayKey ? 'font-bold text-rose-600' : ''}>{formatPersianDate(i.dueDate)}</span> : '—'}</td><td>{i.customerName || '—'}</td>
            <td><div className="flex flex-wrap gap-1"><InvoiceStatus status={i.status} /><ReturnProgressBadge returned={returned} total={total} /></div></td>
            <td className="font-bold">{money(total)} <span className="text-[10px] text-slate-400">{settings.currency}</span>{returned > 0 && <div className="mt-1 text-[10px] font-normal text-rose-500">مرجوعی: {money(returned)} · خالص: {money(netTotal)}</div>}</td>
            <td><div dir="rtl" className="flex items-center gap-1.5">{i.status !== 'draft' && <InvoicePaymentHistoryButton invoiceId={i.id} />}{money(paid)}</div></td>
            <td className={netTotal - paid > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{money(Math.max(0, netTotal - paid))}</td>
            <td><div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onView(i.id)} title="نمایش فاکتور"><Eye className="h-4 w-4" /></Button>
              {canEdit && <Button variant="ghost" size="icon" onClick={() => onEdit(i.id)} title={i.status === 'partial' ? 'ویرایش محدود' : 'ویرایش'}><Edit3 className="h-4 w-4" /></Button>}
              {canReceive && <Button variant="outline" size="sm" onClick={() => startPayment(i.id)}><CircleDollarSign className="h-3.5 w-3.5" />{kind === 'sale' ? 'دریافت / تسویه' : 'پرداخت / تسویه'}</Button>}
              {i.status === 'draft' && <Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('پیش‌نویس حذف شود؟', { title: 'حذف پیش‌نویس', confirmLabel: 'حذف', danger: true })) deleteInvoice(i.id); }} title="حذف پیش‌نویس"><Trash2 className="h-4 w-4" /></Button>}
            </div></td>
          </tr>;
        })}
        {!list.length && <EmptyRow cols={9} text="فاکتوری مطابق فیلتر پیدا نشد." />}
      </tbody></DataTable></div>
    </Card>
    <InvoicePaymentDialog invoiceId={paymentAction?.invoiceId} documentNumber={paymentAction?.documentNumber} open={!!paymentAction} onOpenChange={(open) => { if (!open) setPaymentAction(null); }} />
  </div>;
}

function InvoiceStatus({ status }: { status: string }) {
  const x: Record<string, [string, string]> = { draft: ['پیش‌نویس', 'bg-slate-100 text-slate-600'], final: ['قطعی', 'bg-sky-50 text-sky-700'], partial: ['بخشی تسویه', 'bg-amber-50 text-amber-700'], settled: ['تسویه‌شده', 'bg-emerald-50 text-emerald-700'], void: ['باطل', 'bg-rose-50 text-rose-700'] };
  const [label, cls] = x[status] || [status, '']; return <Badge className={cls}>{label}</Badge>;
}

function ReturnProgressBadge({ returned, total }: { returned: number; total: number }) {
  if (returned <= 0) return null;
  if (returned >= total - 0.0001) return <Badge className="bg-violet-50 text-violet-700">مرجوع کامل</Badge>;
  return <Badge className="bg-orange-50 text-orange-700">مرجوع جزئی</Badge>;
}


export function CustomersView({ onOpenLedger }: { onOpenLedger?: (customerId: string) => void }) {
  const { customers, invoices, returns, payments, checks, adjustments, upsertCustomer, deleteCustomer, settings } = useAccountingStore();
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

  const saveCustomer = async () => {
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
  };

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
                <Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('طرف حساب حذف شود؟', { title: 'حذف طرف حساب', confirmLabel: 'حذف', danger: true })) { const result = deleteCustomer(customer.id); if (!result.ok) notify(result.message || 'حذف طرف حساب انجام نشد.', 'error'); } }} title="حذف"><Trash2 className="h-4 w-4" /></Button>
              </div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={8} text="طرف حسابی پیدا نشد." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else void closeCustomerForm(); }}>
      <DialogContent>
        <DialogHeader>
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
            <Button disabled={!edit.name.trim()} onClick={saveCustomer}><Check className="h-4 w-4" /> ذخیره</Button>
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

export function CustomerLedgerView({
  initialCustomerId,
  onOpenInvoice,
}: {
  initialCustomerId?: string | null;
  onOpenInvoice?: (invoiceId: string, kind: InvoiceKind) => void;
}) {
  const { customers, invoices, returns, payments, checks, adjustments, addAdjustment, settings } = useAccountingStore();
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

  const submitAdjustment = async () => {
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
    setAdjustAmount(0);
    setAdjustNote('');
    setAdjustDate(todayIso());
    setAdjustOpen(false);
  };

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
            {visible.map((entry) => <tr key={entry.id}>
              <td>{entry.date === 'ابتدای دوره' ? entry.date : formatPersianDate(entry.date)}</td>
              <td><div className="font-bold">{entry.title}</div>{entry.note && <div className="mt-1 max-w-[360px] text-[11px] leading-5 text-slate-500">{entry.note}</div>}{!entry.effective && entry.nominalAmount ? <div className="mt-1 text-[10px] text-amber-600">مبلغ اسمی {money(entry.nominalAmount)}؛ بدون اثر در مانده</div> : null}</td>
              <td>{entry.reference || '—'}</td>
              <td className="font-bold text-rose-700">{entry.debit ? money(entry.debit) : '—'}</td>
              <td className="font-bold text-emerald-700">{entry.credit ? money(entry.credit) : '—'}</td>
              <td className={entry.balance > 0 ? 'font-black text-rose-700' : entry.balance < 0 ? 'font-black text-emerald-700' : 'font-black'}>{money(Math.abs(entry.balance))}{entry.balance > 0 ? ' بدهکار' : entry.balance < 0 ? ' بستانکار' : ''}</td>
              <td><div className="flex flex-wrap items-center gap-2"><LedgerStatus status={entry.status} effective={entry.effective} kind={entry.kind} />{entry.invoiceId && entry.invoiceKind && onOpenInvoice && <Button variant="ghost" size="sm" onClick={() => onOpenInvoice(entry.invoiceId!, entry.invoiceKind!)}><FileText className="h-3.5 w-3.5" /> سند مبنا</Button>}{entry.invoiceId && entry.invoiceKind && (entry.kind === 'sale' || entry.kind === 'purchase' || entry.kind === 'void') && <InvoicePaymentHistoryButton invoiceId={entry.invoiceId} />}</div></td>
            </tr>)}
            {!visible.length && <EmptyRow cols={7} text="گردشی مطابق فیلتر فعلی وجود ندارد." />}
          </tbody>
        </DataTable></div>
      </Card>
    </> : <Card><CardContent className="py-16 text-center text-slate-400">برای مشاهده دفتر حساب، یک طرف حساب انتخاب کنید.</CardContent></Card>}

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">ثبت اصلاحیه حساب</DialogTitle><DialogDescription className="text-sm text-slate-500">اصلاحیه به‌عنوان یک گردش مستقل ذخیره می‌شود و مانده اول دوره یا اسناد قبلی را بازنویسی نمی‌کند.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع اصلاحیه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as 'debit' | 'credit')}><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></Field>
          <Field label={'مبلغ (' + settings.currency + ')'}><FormattedInput min={0} value={adjustAmount} onValueChange={setAdjustAmount} /></Field>
          <Field label="تاریخ"><JalaliDatePicker value={adjustDate} onChange={setAdjustDate} /></Field>
          <Field label="طرف حساب"><Input value={customer?.name || ''} readOnly className="bg-slate-100" /></Field>
          <Field label="دلیل اصلاحیه *" className="sm:col-span-2"><Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="مثلاً اصلاح مانده انتقالی طبق سند..." /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button><Button disabled={!customer || adjustAmount <= 0 || !adjustNote.trim()} onClick={submitAdjustment}>ثبت اصلاحیه</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function LedgerStatus({ status, effective, kind }: { status?: string; effective: boolean; kind: string }) {
  if (kind === 'opening') return <Badge>اول دوره</Badge>;
  if (kind === 'adjustment') return <Badge className="bg-violet-50 text-violet-700">اصلاحیه</Badge>;
  if (kind === 'void') return <Badge className="bg-rose-50 text-rose-700">باطل</Badge>;
  if (status === 'pending') return <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>;
  if (status === 'bounced') return <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge>;
  if (status === 'cleared') return <Badge className="bg-emerald-50 text-emerald-700">وصول / پاس</Badge>;
  return effective ? <Badge className="bg-emerald-50 text-emerald-700">موثر</Badge> : <Badge>اطلاعاتی</Badge>;
}

export function ProductsView() {
  const { products, customers, upsertProduct, deleteProduct, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [priceCustomerId, setPriceCustomerId] = useState('');
  const [priceCustomerAmount, setPriceCustomerAmount] = useState('');
  const [priceGroupName, setPriceGroupName] = useState('');
  const [priceGroupAmount, setPriceGroupAmount] = useState('');
  const productDraft = useUnsavedDraft<Product>('کالا / خدمت');
  const list = products.filter((product) => archiveFilter === 'all' || Boolean(product.archived) === (archiveFilter === 'archived')).filter((product) => (product.name + ' ' + product.code + ' ' + product.sku + ' ' + product.barcode + ' ' + product.category).toLowerCase().includes(q.toLowerCase()));
  const startEdit = (product?: Product) => {
    const draft = product ? { ...product } : { id: uid('prd'), code: String(1000 + products.length + 1), name: '', kind: 'product' as const, unit: 'عدد', salePrice: 0, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, sku: '', barcode: '', category: '', archived: false, customerPrices: {}, customerGroupPrices: {} };
    setPriceCustomerId(''); setPriceCustomerAmount(''); setPriceGroupName(''); setPriceGroupAmount('');
    productDraft.markClean(draft);
    setFormError('');
    setEdit(draft);
    setOpen(true);
  };
  const closeProductForm = () => productDraft.requestClose(edit, () => setOpen(false));
  const existing = edit ? products.some((product) => product.id === edit.id) : false;

  return <div className="space-y-5">
    <PageHead title="کالا و خدمات" subtitle="تعریف کالا، خدمت و قیمت‌ها؛ تغییر موجودی کالای موجود فقط از بخش انبار انجام می‌شود" action={<Button onClick={() => startEdit()}><Plus className="h-4 w-4" /> کالا / خدمت جدید</Button>} />
    <Card>
      <CardHeader className="flex-wrap"><SearchBox value={q} onChange={setQ} /><div className="flex gap-2">{([['active', 'فعال'], ['archived', 'آرشیو'], ['all', 'همه']] as const).map(([key, label]) => <Button key={key} size="sm" variant={archiveFilter === key ? 'default' : 'outline'} onClick={() => setArchiveFilter(key)}>{label}</Button>)}</div></CardHeader>
      <div className="table-wrap"><DataTable className="data-table">
        <thead><tr><th>کد / SKU</th><th>بارکد</th><th>نام</th><th>دسته</th><th>نوع</th><th>قیمت فروش</th><th>موجودی</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((product) => <tr key={product.id}>
            <td className="font-bold">{product.code}{product.sku && <div className="text-[10px] text-slate-400">SKU: {product.sku}</div>}</td><td dir="ltr">{product.barcode || '—'}</td><td className="font-bold">{product.name}</td><td>{product.category || '—'}</td>
            <td><Badge className={product.kind === 'service' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}>{product.kind === 'service' ? 'خدمت' : 'کالا'}</Badge></td>
            <td className="font-bold">{money(product.salePrice)} <span className="text-[10px] text-slate-400">{settings.currency}</span></td>
            <td className={product.kind === 'product' && product.stock <= product.minStock ? 'font-black text-rose-600' : ''}>{product.kind === 'product' ? money(product.stock) + ' ' + product.unit : '—'}</td>
            <td><Badge className={product.archived ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}>{product.archived ? 'آرشیو' : 'فعال'}</Badge></td>
            <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setSelectedProduct(product)} title="نمایش جزئیات" aria-label={'نمایش جزئیات ' + product.name}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => startEdit(product)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className={product.archived ? 'text-emerald-600' : 'text-amber-600'} onClick={() => { const result = upsertProduct({ ...product, archived: !product.archived }); if (!result.ok) notify(result.message || 'تغییر وضعیت کالا انجام نشد.', 'error'); }} title={product.archived ? 'فعال‌سازی' : 'آرشیو کردن'}><Archive className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('این مورد حذف شود؟', { title: 'حذف کالا / خدمت', confirmLabel: 'حذف', danger: true })) { const result = deleteProduct(product.id); if (!result.ok) notify(result.message || 'حذف کالا / خدمت انجام نشد.', 'error'); } }} title="حذف"><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>)}
          {!list.length && <EmptyRow cols={9} text="کالا یا خدمتی پیدا نشد." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else void closeProductForm(); }}>
      <DialogContent>
        <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-lg font-black">تعریف کالا / خدمت</DialogTitle><UnsavedChangesBadge visible={productDraft.hasChanges(edit)} /></div><DialogDescription className="text-sm text-slate-500">موجودی اولیه فقط هنگام ایجاد کالا قابل ثبت است. بعد از آن هر تغییر موجودی در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{formError}</p>}
          <Field label="نام *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="کد"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="SKU"><Input value={edit.sku || ''} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></Field>
          <Field label="بارکد"><Input dir="ltr" value={edit.barcode || ''} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} /></Field>
          <Field label="دسته‌بندی"><Input value={edit.category || ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
          <Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Product['kind'] })}><option value="product">کالا</option><option value="service">خدمت</option></select></Field>
          <Field label="واحد"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field>
          <Field label="قیمت خرید / مبنا"><FormattedInput min={0} value={edit.buyPrice} onValueChange={(buyPrice) => setEdit({ ...edit, buyPrice })} /></Field>
          <Field label="قیمت فروش"><FormattedInput min={0} value={edit.salePrice} onValueChange={(salePrice) => setEdit({ ...edit, salePrice })} /></Field>
          {edit.kind === 'product' && <>
            <Field label={existing ? 'موجودی فعلی' : 'موجودی اولیه'}>
              <FormattedInput allowNegative disabled={existing} className={existing ? 'bg-slate-100' : ''} value={edit.stock} onValueChange={(stock) => setEdit({ ...edit, stock })} />
              {existing && <span className="mt-1 block text-[10px] leading-5 text-slate-400">برای تغییر موجودی از «انبار → شمارش / اصلاح موجودی» استفاده کنید.</span>}
            </Field>
            <Field label="حداقل موجودی"><FormattedInput min={0} value={edit.minStock} onValueChange={(minStock) => setEdit({ ...edit, minStock })} /></Field>
          </>}
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 sm:col-span-2"><div className="text-xs font-black">قیمت‌های ویژه فروش</div><div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={priceCustomerId} onChange={(event) => setPriceCustomerId(event.target.value)}><option value="">مشتری</option>{customers.filter((customer) => customer.kind !== 'supplier').map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><Input type="number" min="0" placeholder="قیمت مشتری" value={priceCustomerAmount} onChange={(event) => setPriceCustomerAmount(event.target.value)} /><Button type="button" variant="outline" onClick={() => { if (!priceCustomerId || Number(priceCustomerAmount) < 0) return; setEdit({ ...edit, customerPrices: { ...(edit.customerPrices || {}), [priceCustomerId]: Number(priceCustomerAmount) } }); }}>افزودن</Button></div><div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"><Input placeholder="گروه مشتری (مثلاً همکار)" value={priceGroupName} onChange={(event) => setPriceGroupName(event.target.value)} /><Input type="number" min="0" placeholder="قیمت گروه" value={priceGroupAmount} onChange={(event) => setPriceGroupAmount(event.target.value)} /><Button type="button" variant="outline" onClick={() => { const key = priceGroupName.trim(); if (!key || Number(priceGroupAmount) < 0) return; setEdit({ ...edit, customerGroupPrices: { ...(edit.customerGroupPrices || {}), [key]: Number(priceGroupAmount) } }); }}>ثبت قیمت گروه</Button></div><div className="flex flex-wrap gap-2 text-[11px] text-slate-500">{Object.entries(edit.customerPrices || {}).map(([id, price]) => <span key={id} className="rounded-lg bg-white px-2 py-1">{customers.find((customer) => customer.id === id)?.name || id}: {money(price)}</span>)}{Object.entries(edit.customerGroupPrices || {}).map(([group, price]) => <span key={group} className="rounded-lg bg-white px-2 py-1">گروه {group}: {money(price)}</span>)}</div></div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(edit.archived)} onChange={(event) => setEdit({ ...edit, archived: event.target.checked })} /> آرشیو شده</label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => void closeProductForm()}>انصراف</Button><Button disabled={!edit.name.trim()} onClick={async () => { setFormError(''); const result = upsertProduct(edit); if (!result.ok) { setFormError(result.message || 'ذخیره کالا انجام نشد.'); return; } try { await flushAccountingPersistence(); } catch (error) { setFormError(error instanceof Error ? error.message : 'ذخیره کالا روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; } productDraft.markClean(edit); setOpen(false); }}>ذخیره</Button></div></div>
        </div>}
      </DialogContent>
    </Dialog>
    <RecordDetailsDialog
      open={!!selectedProduct}
      onOpenChange={(open) => !open && setSelectedProduct(null)}
      title={selectedProduct?.name || 'جزئیات کالا / خدمت'}
      fields={selectedProduct ? [
        { label: 'کد', value: selectedProduct.code },
        { label: 'SKU', value: selectedProduct.sku || '—' },
        { label: 'بارکد', value: selectedProduct.barcode || '—' },
        { label: 'دسته', value: selectedProduct.category || '—' },
        { label: 'نوع', value: selectedProduct.kind === 'service' ? 'خدمت' : 'کالا' },
        { label: 'واحد', value: selectedProduct.unit },
        { label: 'قیمت خرید / مبنا', value: money(selectedProduct.buyPrice) + ' ' + settings.currency },
        { label: 'قیمت فروش', value: money(selectedProduct.salePrice) + ' ' + settings.currency },
        { label: 'موجودی', value: selectedProduct.kind === 'product' ? money(selectedProduct.stock) + ' ' + selectedProduct.unit : '—' },
        { label: 'حداقل موجودی', value: selectedProduct.kind === 'product' ? money(selectedProduct.minStock) + ' ' + selectedProduct.unit : '—' },
        { label: 'میانگین بهای تمام‌شده', value: selectedProduct.kind === 'product' ? money(selectedProduct.averageCost ?? selectedProduct.buyPrice) + ' ' + settings.currency : '—' },
      ] : []}
      onEdit={selectedProduct ? () => { const product = selectedProduct; setSelectedProduct(null); startEdit(product); } : undefined}
    />
  </div>;
}

export function InventoryView({ onOpenInvoice }: { onOpenInvoice?: (invoiceId: string, kind: InvoiceKind) => void }) {
  const { products, stockMovements, addStockAdjustment, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [cardexProductId, setCardexProductId] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustMode, setAdjustMode] = useState<'count' | 'delta'>('count');
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustDate, setAdjustDate] = useState(todayIso());
  const [adjustNote, setAdjustNote] = useState('');

  const list = products.filter((product) => product.kind === 'product' && !product.archived).filter((product) => (product.name + ' ' + product.code + ' ' + product.sku + ' ' + product.barcode).toLowerCase().includes(q.toLowerCase()));
  const total = list.reduce((sum, product) => sum + product.stock * Number(product.averageCost ?? product.buyPrice ?? 0), 0);
  const low = list.filter((product) => product.stock <= product.minStock).length;
  const cardexProduct = products.find((product) => product.id === cardexProductId);
  const cardex = stockMovements.filter((movement) => movement.productId === cardexProductId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const adjustmentProduct = products.find((product) => product.id === adjustProductId);
  const adjustmentDelta = adjustmentProduct
    ? adjustMode === 'count' ? Number(adjustQuantity || 0) - adjustmentProduct.stock : Number(adjustQuantity || 0)
    : 0;
  const projectedStock = adjustmentProduct ? adjustmentProduct.stock + adjustmentDelta : 0;

  const startAdjustment = (productId?: string) => {
    const selected = productId || list[0]?.id || '';
    setAdjustProductId(selected);
    const product = products.find((item) => item.id === selected);
    setAdjustMode('count');
    setAdjustQuantity(product?.stock || 0);
    setAdjustDate(todayIso());
    setAdjustNote('');
    setAdjustOpen(true);
  };

  const changeAdjustmentProduct = (productId: string) => {
    setAdjustProductId(productId);
    const product = products.find((item) => item.id === productId);
    setAdjustQuantity(adjustMode === 'count' ? product?.stock || 0 : 0);
  };

  const changeAdjustmentMode = (mode: 'count' | 'delta') => {
    setAdjustMode(mode);
    setAdjustQuantity(mode === 'count' ? adjustmentProduct?.stock || 0 : 0);
  };

  const submitAdjustment = async () => {
    if (!adjustProductId || !adjustmentProduct || !adjustNote.trim() || Math.abs(adjustmentDelta) < 0.0001 || projectedStock < -0.0001) return;
    const approved = await confirmDialog(
      `برای «${adjustmentProduct.name}» موجودی ${adjustMode === 'count' ? 'با ثبت شمارش' : 'با اصلاح دستی'} به اندازه ${adjustmentDelta > 0 ? '+' : '−'}${money(Math.abs(adjustmentDelta))} ${adjustmentProduct.unit} تغییر می‌کند. موجودی فعلی ${money(adjustmentProduct.stock)} و موجودی پس از ثبت ${money(Math.max(0, projectedStock))} ${adjustmentProduct.unit} خواهد بود. ادامه می‌دهید؟`,
      { title: 'تأیید اصلاح موجودی', confirmLabel: 'ثبت در کاردکس' }
    );
    if (!approved) return;
    const result = addStockAdjustment({ productId: adjustProductId, date: adjustDate, mode: adjustMode, quantity: Number(adjustQuantity), note: adjustNote });
    if (!result.ok) {
      notify(result.message || 'ثبت اصلاح موجودی انجام نشد.', 'error');
      return;
    }
    setAdjustOpen(false);
  };

  return <div className="space-y-5">
    <PageHead title="انبار" subtitle="انبار اصلی؛ موجودی و میانگین موزون از روی کاردکس قابل ردیابی است" action={<Button disabled={!list.length} onClick={() => startAdjustment()}><Plus className="h-4 w-4" /> شمارش / اصلاح موجودی</Button>} />
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard icon={Boxes} title="تعداد اقلام" value={String(list.length)} />
      <MetricCard icon={Archive} title="ارزش موجودی (میانگین موزون)" value={money(total) + ' ' + settings.currency} />
      <MetricCard icon={AlertTriangle} title="زیر حداقل موجودی" value={String(low)} tone={low > 0 ? 'danger' : 'neutral'} />
    </div>

    <Card>
      <CardHeader className="flex-wrap"><SearchBox value={q} onChange={setQ} /><Badge className="bg-sky-50 text-sky-700">انبار اصلی · main</Badge></CardHeader>
      <div className="table-wrap"><DataTable className="data-table min-w-[980px]">
        <thead><tr><th>کد</th><th>کالا</th><th>واحد</th><th>موجودی</th><th>حداقل</th><th>میانگین موزون</th><th>ارزش موجودی</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((product) => {
            const average = Number(product.averageCost ?? product.buyPrice ?? 0);
            return <tr key={product.id}>
              <td>{product.code}</td><td className="font-bold">{product.name}</td><td>{product.unit}</td>
              <td className="font-black">{money(product.stock)}</td><td>{money(product.minStock)}</td>
              <td>{money(average)} {settings.currency}</td><td className="font-bold">{money(product.stock * average)}</td>
              <td>{product.stock <= product.minStock ? <Badge className="bg-rose-50 text-rose-700">نیاز به تامین</Badge> : <Badge className="bg-emerald-50 text-emerald-700">مناسب</Badge>}</td>
              <td><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setCardexProductId(product.id)}><Archive className="h-4 w-4" /> کاردکس</Button><Button variant="ghost" size="sm" onClick={() => startAdjustment(product.id)}><Edit3 className="h-4 w-4" /> اصلاح</Button></div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={9} text="کالایی برای نمایش نیست." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={!!cardexProductId} onOpenChange={(open) => !open && setCardexProductId(null)}>
      <DialogContent className="w-full max-w-5xl">
        <DialogHeader><DialogTitle className="text-lg font-black">کاردکس {cardexProduct?.name || ''}</DialogTitle><DialogDescription className="text-sm text-slate-500">هر حرکت موجودی با منبع، مقدار ورود/خروج، مانده و میانگین موزون بعد از حرکت ثبت می‌شود.</DialogDescription></DialogHeader>
        <div className="max-h-[65vh] overflow-auto"><DataTable className="data-table min-w-[900px]">
          <thead><tr><th>تاریخ</th><th>نوع حرکت</th><th>مرجع</th><th>ورود</th><th>خروج</th><th>مانده</th><th>میانگین بعد حرکت</th><th>سند</th></tr></thead>
          <tbody>
            {cardex.map((movement) => <tr key={movement.id}>
              <td>{movement.date === 'ابتدای دوره' ? movement.date : formatPersianDate(movement.date)}</td>
              <td><div className="font-bold">{stockMovementLabel(movement)}</div>{movement.note && <div className="mt-1 max-w-xs text-[10px] leading-5 text-slate-500">{movement.note}</div>}</td>
              <td>{movement.sourceReference || '—'}</td>
              <td className="font-bold text-emerald-700">{movement.quantity > 0 ? money(movement.quantity) : '—'}</td>
              <td className="font-bold text-rose-700">{movement.quantity < 0 ? money(Math.abs(movement.quantity)) : '—'}</td>
              <td className="font-black">{money(movement.balanceAfter)} {cardexProduct?.unit}</td>
              <td>{money(movement.averageCostAfter)} {settings.currency}</td>
              <td>{movement.sourceType === 'invoice' && (movement.sourceKind === 'sale' || movement.sourceKind === 'purchase') && onOpenInvoice ? <Button variant="ghost" size="sm" onClick={() => { setCardexProductId(null); onOpenInvoice(movement.sourceId, movement.sourceKind as InvoiceKind); }}><FileText className="h-3.5 w-3.5" /> فاکتور {movement.sourceReference}</Button> : <Badge>{movement.sourceType === 'return' ? 'مرجوعی' : movement.sourceType === 'adjustment' ? 'اصلاحیه' : 'سیستم'}</Badge>}</td>
            </tr>)}
            {!cardex.length && <EmptyRow cols={8} text="حرکتی برای این کالا ثبت نشده است." />}
          </tbody>
        </DataTable></div>
      </DialogContent>
    </Dialog>

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">شمارش / اصلاح موجودی</DialogTitle><DialogDescription className="text-sm text-slate-500">این عملیات موجودی قبلی را بازنویسی نمی‌کند؛ اختلاف به‌صورت یک StockMovement مستقل در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="کالا"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustProductId} onChange={(e) => changeAdjustmentProduct(e.target.value)}><option value="">انتخاب...</option>{products.filter((product) => product.kind === 'product' && !product.archived).map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name} · موجودی {money(product.stock)}</option>)}</select></Field>
          <Field label="نوع عملیات"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustMode} onChange={(e) => changeAdjustmentMode(e.target.value as 'count' | 'delta')}><option value="count">شمارش انبار (موجودی واقعی)</option><option value="delta">اصلاح افزایشی / کاهشی</option></select></Field>
          <Field label={adjustMode === 'count' ? 'موجودی واقعی شمارش‌شده' : 'مقدار اصلاح (+ / -)'}><FormattedInput allowNegative value={adjustQuantity} onValueChange={setAdjustQuantity} /></Field>
          <Field label="تاریخ"><JalaliDatePicker value={adjustDate} onChange={setAdjustDate} /></Field>
          <Field label="دلیل / شرح *" className="sm:col-span-2"><Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="مثلاً شمارش پایان ماه، شکستگی، کسری انبار..." /></Field>
          {adjustmentProduct && <div className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap gap-x-4 gap-y-1">موجودی فعلی: <b>{money(adjustmentProduct.stock)} {adjustmentProduct.unit}</b><span>اختلاف: <b className={adjustmentDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}>{adjustmentDelta > 0 ? '+' : ''}{money(adjustmentDelta)} {adjustmentProduct.unit}</b></span><span>موجودی پس از ثبت: <b>{money(Math.max(0, projectedStock))} {adjustmentProduct.unit}</b></span></div>
            {projectedStock < -0.0001 && <div className="mt-2 font-bold text-rose-700">موجودی نهایی نمی‌تواند منفی باشد.</div>}
          </div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button><Button disabled={!adjustProductId || !adjustNote.trim() || Math.abs(adjustmentDelta) < 0.0001 || projectedStock < -0.0001} onClick={submitAdjustment}>ثبت در کاردکس</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function stockMovementLabel(movement: StockMovement) {
  if (movement.type === 'opening') return movement.action === 'product-opening' ? 'موجودی اولیه کالا' : 'مانده انتقالی';
  if (movement.type === 'purchase') return movement.action === 'revision' ? 'خرید - Revision' : 'ورود از خرید';
  if (movement.type === 'sale') return movement.action === 'revision' ? 'فروش - Revision' : 'خروج از فروش';
  if (movement.type === 'sale-return') return 'ورود از مرجوعی فروش';
  if (movement.type === 'purchase-return') return 'خروج از مرجوعی خرید';
  if (movement.type === 'adjustment') return movement.action === 'count' ? 'اختلاف شمارش انبار' : 'اصلاح موجودی';
  return movement.action === 'void-reversal' ? 'برگشت بابت ابطال' : 'برگشت نسخه قبلی';
}

export function PaymentsView() {
  const { payments, customers, invoices, checks, returns, reserveDocumentNumber, addPayment, deletePayment, settings } = useAccountingStore();
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

  const availableChecks = checks.filter((check) =>
    check.status !== 'bounced' &&
    check.direction === (form.direction === 'receipt' ? 'received' : 'issued') &&
    (!form.customerId || check.customerId === form.customerId) &&
    !payments.some((payment) => payment.checkId === check.id)
  );

  const selectInvoice = (invoiceId: string) => {
    if (!invoiceId) {
      setForm({ ...form, invoiceId: '' });
      return;
    }
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const direction: Payment['direction'] = invoice.kind === 'sale' ? 'receipt' : 'payment';
    const remaining = invoiceOutstandingAmount(invoice, payments, checks, returns);
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

  const selectCheck = (checkId: string) => {
    if (!checkId) {
      setForm({ ...form, checkId: undefined });
      return;
    }
    const check = checks.find((item) => item.id === checkId);
    if (!check) return;
    const direction: Payment['direction'] = check.direction === 'received' ? 'receipt' : 'payment';
    const linkedInvoice = form.invoiceId ? invoices.find((invoice) => invoice.id === form.invoiceId) : undefined;
    setForm({
      ...form,
      checkId: check.id,
      customerId: check.customerId,
      direction,
      documentNumber: direction === form.direction ? form.documentNumber : reserveDocumentNumber(direction),
      amount: check.amount,
      reference: check.number,
      invoiceId: linkedInvoice && linkedInvoice.customerId === check.customerId && (linkedInvoice.kind === 'sale' ? 'receipt' : 'payment') === direction ? linkedInvoice.id : '',
    });
  };

  const submit = async () => {
    setFormError('');
    const result = addPayment(form);
    if (!result.ok) {
      setFormError(result.message || 'ثبت تراکنش انجام نشد.');
      return;
    }
    try { await flushAccountingPersistence(); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'ذخیره دریافت روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; }
    setOpen(false);
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
                  const result = deletePayment(payment.id, reason);
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
        <DialogHeader>
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
          <Field label="روش">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Payment['method'], checkId: undefined })}>
              <option value="cash">نقدی</option><option value="card">کارت / واریز</option><option value="check">چک</option>
            </select>
          </Field>
          {form.method === 'check' && <Field label="چک ثبت‌شده *" className="sm:col-span-2">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.checkId || ''} onChange={(e) => selectCheck(e.target.value)}>
              <option value="">انتخاب چک...</option>{availableChecks.map((check) => <option key={check.id} value={check.id}>{check.number} · {check.bank || 'بدون بانک'} · {money(check.amount)} · {check.status === 'cleared' ? 'وصول/پاس شده' : 'در انتظار'}</option>)}
            </select>
          </Field>}
          <Field label={`مبلغ (${settings.currency}) *`}><FormattedInput min={0} value={form.amount} readOnly={form.method === 'check' && !!form.checkId} onValueChange={(amount) => setForm({ ...form, amount })} /></Field>
          <Field label="تاریخ"><JalaliDatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} /></Field>
          <Field label="شماره پیگیری / مرجع"><Input value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <Field label="توضیحات"><Input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {form.method === 'check' && <div className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">تراکنش چکی هنگام ثبت ایجاد می‌شود، اما تا زمانی که وضعیت چک «وصول/پاس شده» نباشد، مبلغ آن در مانده تسویه فاکتور محاسبه نمی‌شود.</div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!form.customerId || form.amount <= 0 || (form.method === 'check' && !form.checkId)} onClick={() => void submit()}>ثبت {form.direction === 'receipt' ? 'دریافت' : 'پرداخت'}</Button></div>
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

export function ChecksView({ initialCheckId }: { initialCheckId?: string | null } = {}) {
  const { checks, payments, customers, reserveDocumentNumber, upsertCheck, deleteCheck, settings } = useAccountingStore();
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

  const save = async () => {
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
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog('چک حذف شود؟', { title: 'حذف چک', confirmLabel: 'حذف', danger: true }))) return;
    const result = deleteCheck(id);
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
        <DialogHeader><DialogTitle className="text-lg font-black">ثبت / ویرایش چک</DialogTitle><DialogDescription className="text-sm text-slate-500">{linkedPayment ? 'این چک به تراکنش متصل است؛ نوع، طرف حساب و مبلغ قفل هستند. تغییر وضعیت چک، تسویه فاکتور را خودکار باز محاسبه می‌کند.' : 'چک می‌تواند بعداً از بخش دریافت و پرداخت به یک تراکنش متصل شود.'}</DialogDescription></DialogHeader>
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
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!form.customerId || form.amount <= 0} onClick={save}>ذخیره</Button></div>
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

function CheckStatus({ status }: { status: CheckRecord['status'] }) { return status === 'cleared' ? <Badge className="bg-emerald-50 text-emerald-700">وصول شده</Badge> : status === 'bounced' ? <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge> : <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>; }

export function SettingsView() {
  const { settings, setSettings, resetAll } = useAccountingStore();
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const saveGlobalSettings = () => {
    setSettings({
      ...settings,
      currency: draft.currency,
      defaultTax: Number(draft.defaultTax || 0),
      numbering: draft.numbering,
      defaultInvoiceTemplateId: draft.defaultInvoiceTemplateId,
      defaultInvoicePaperSize: draft.defaultInvoicePaperSize || 'A4',
    });
  };

  const resetDatabase = async () => {
    const approved = await confirmDialog(
      'اسناد و تنظیمات حسابداری پاک می‌شوند. پیش از پاک‌سازی یک Snapshot کامل ساخته می‌شود؛ حساب مدیر و Snapshotها باقی می‌مانند. این عملیات را می‌توان با بازیابی Snapshot برگرداند.',
      { title: 'پاک‌کردن کل پایگاه داده', confirmLabel: 'پاک‌کردن و شروع دوباره', danger: true }
    );
    if (!approved) return;
    try {
      await clearApplicationDatabase();
      window.location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'پاک‌کردن پایگاه داده انجام نشد.', 'error');
    }
  };

  return <div className="space-y-5">
    <PageHead title="تنظیمات" subtitle="تنظیمات عمومی اسناد، شماره‌گذاری و نسخه پشتیبان" action={<Button onClick={saveGlobalSettings}>ذخیره تنظیمات عمومی</Button>} />
    <div className="grid gap-5 xl:grid-cols-[1fr_.72fr]">
      <Card>
        <CardHeader><CardTitle>تنظیمات عمومی اسناد</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="واحد پول"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'تومان' | 'ریال' })}><option value="تومان">تومان</option><option value="ریال">ریال</option></select></Field>
          <Field label="مالیات پیش‌فرض"><FormattedInput min={0} value={draft.defaultTax} onValueChange={(defaultTax) => setDraft({ ...draft, defaultTax })} /></Field>
          <Field label="اندازه پیش‌فرض کاغذ فاکتورهای جدید"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.defaultInvoicePaperSize || 'A4'} onChange={(e) => setDraft({ ...draft, defaultInvoicePaperSize: e.target.value === 'A5' ? 'A5' : 'A4' })}><option value="A4">A4 · ۲۱۰ × ۲۹۷ میلی‌متر</option><option value="A5">A5 · ۱۴۸ × ۲۱۰ میلی‌متر</option></select></Field>
          <div className="sm:col-span-2">
            <div className="mb-2 text-sm font-bold text-slate-700">قالب پیش‌فرض فاکتورهای جدید</div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4" role="group" aria-label="انتخاب قالب پیش‌فرض فاکتور">
              {INVOICE_TEMPLATES.map((template) => <button
                key={template.id}
                type="button"
                aria-pressed={draft.defaultInvoiceTemplateId === template.id}
                onClick={() => setDraft({ ...draft, defaultInvoiceTemplateId: template.id })}
                className={'invoice-template-choice text-right ' + (draft.defaultInvoiceTemplateId === template.id ? 'invoice-template-choice-selected' : '')}
              >
                <InvoiceTemplateThumbnail templateId={template.id} />
                <span className="mt-2 block text-sm font-black">{template.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</span>
                {draft.defaultInvoiceTemplateId === template.id && <Badge className="mt-2 bg-sky-50 text-sky-700">پیش‌فرض</Badge>}
              </button>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">این انتخاب برای فاکتورهای تازه استفاده می‌شود. قالب فاکتورهای موجود جداگانه انتخاب می‌شود.</p>
          </div>
          <NumberingSettingsEditor draft={draft} onChange={setDraft} />
        </CardContent>
      </Card>

      <div className="space-y-5">
        <StorageBackupPanel />
        <YasImporterPanel />
        <Card><CardHeader><CardTitle className="text-rose-700">پاک‌کردن داده‌ها</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">همه اسناد حسابداری حذف می‌شوند و فقط پروفایل خالی و سرفصل‌های پایه باقی می‌مانند.</p><Button variant="danger" onClick={async () => { if (await confirmDialog('همه داده‌های حسابداری این مرورگر پاک شوند؟ این عملیات قابل بازگشت نیست.', { title: 'پاک‌کردن داده‌ها', confirmLabel: 'پاک‌کردن', danger: true })) resetAll(); }}><Trash2 className="h-4 w-4" /> پاک‌کردن داده‌ها</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-rose-700">شروع دوباره</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">تمام پایگاه داده محلی، شامل کاربران، نسخه‌های پشتیبان و اطلاعات حسابداری پاک می‌شود و برنامه به راه‌اندازی مدیر اول برمی‌گردد.</p><Button variant="danger" onClick={resetDatabase}><Trash2 className="h-4 w-4" /> پاک‌کردن کل پایگاه داده</Button></CardContent></Card>
      </div>
    </div>
  </div>;
}
function InvoiceTemplateThumbnail({ templateId }: { templateId: (typeof INVOICE_TEMPLATES)[number]['id'] }) {
  return <span className={'invoice-template-thumbnail invoice-template-thumbnail-' + templateId} aria-hidden="true">
    <span className="invoice-template-thumbnail-heading" />
    <span className="invoice-template-thumbnail-meta"><i /><i /></span>
    <span className="invoice-template-thumbnail-row" />
    <span className="invoice-template-thumbnail-row short" />
    <span className="invoice-template-thumbnail-total" />
  </span>;
}
function NumberingSettingsEditor({ draft, onChange }: { draft: BusinessSettings; onChange: (settings: BusinessSettings) => void }) {
  const rows = [
    ['sale', 'فاکتور فروش'],
    ['purchase', 'فاکتور خرید'],
    ['receipt', 'دریافت'],
    ['payment', 'پرداخت'],
    ['check', 'چک'],
  ] as const;
  const update = (key: keyof BusinessSettings['numbering'], field: 'prefix' | 'next' | 'padding', value: string | number) => {
    onChange({
      ...draft,
      numbering: {
        ...draft.numbering,
        [key]: { ...draft.numbering[key], [field]: field === 'prefix' ? String(value) : Number(value) },
      },
    });
  };
  return <Panel variant="subtle" padding="sm" className="sm:col-span-2">
    <div className="mb-3 text-sm font-black">الگوی شماره‌گذاری اسناد</div>
    <div className="grid gap-2">
      {rows.map(([key, label]) => <div key={key} className="grid grid-cols-[1fr_.8fr_.7fr_.6fr] items-end gap-2">
        <div className="text-xs font-bold text-slate-600">{label}</div>
        <Field label="پیشوند"><Input value={draft.numbering[key].prefix} onChange={(e) => update(key, 'prefix', e.target.value)} /></Field>
        <Field label="شماره بعدی"><FormattedInput allowDecimal={false} min={1} value={draft.numbering[key].next} onValueChange={(value) => update(key, 'next', value)} /></Field>
        <Field label="تعداد رقم"><FormattedInput allowDecimal={false} min={1} max={12} value={draft.numbering[key].padding} onValueChange={(value) => update(key, 'padding', value)} /></Field>
      </div>)}
    </div>
  </Panel>;
}

function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>; }

