'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock,
  BookOpen, Check, CircleDollarSign, Edit3, FileText, Package, Plus, Search, Settings2,
  Trash2, Upload, UserRound, WalletCards
} from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { BusinessProfile, BusinessSettings, CheckRecord, Customer, InvoiceKind, Payment, Product, StockMovement } from '@/lib/types';
import { buildCustomerLedger, customerNetBalance, effectivePaymentAmount, invoiceTotal, money, normalizeDateKey, resolvedPaymentDirection, settledForInvoice, uid } from '@/lib/utils';
import { formatPersianDate, todayIso, validateOfficialFields } from '@/lib/standards';
import { PersianDateInput } from '@/components/persian-date-input';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StorageBackupPanel } from '@/components/storage-backup-panel';
import { YasImporterPanel } from '@/components/yas-importer-panel';
import { confirmDialog, notify } from '@/lib/feedback';

function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{action}</div>;
}

function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative w-full max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pr-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function InvoiceListView({ kind, onEdit, onNew }: { kind: InvoiceKind; onEdit: (id: string) => void; onNew: () => void }) {
  const { invoices, returns, payments, checks, deleteInvoice, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const list = invoices.filter((i) => i.kind === kind).filter((i) => (i.number + ' ' + i.customerName).toLowerCase().includes(q.toLowerCase())).filter((i) => status === 'all' || i.status === status);
  const label = kind === 'sale' ? 'فاکتورهای فروش' : 'فاکتورهای خرید';
  return <div className="space-y-5">
    <PageHead title={label} subtitle="ثبت، جستجو، ویرایش و کنترل وضعیت فاکتورها" action={<Button onClick={onNew}><Plus className="h-4 w-4" /> {kind === 'sale' ? 'فاکتور فروش جدید' : 'فاکتور خرید جدید'}</Button>} />
    <Card><CardHeader className="flex-wrap"><SearchBox value={q} onChange={setQ} /><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">همه وضعیت‌ها</option><option value="draft">پیش‌نویس</option><option value="final">قطعی</option><option value="partial">بخشی تسویه</option><option value="settled">تسویه‌شده</option><option value="void">باطل</option></select></CardHeader>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>طرف حساب</th><th>وضعیت</th><th>مبلغ کل</th><th>پرداخت</th><th>مانده</th><th>عملیات</th></tr></thead><tbody>
        {list.map((i) => {
          const total = invoiceTotal(i);
          const returned = returns.filter((document) => document.originalInvoiceId === i.id && document.status === 'final').reduce((sum, document) => sum + document.totalAmount, 0);
          const netTotal = Math.max(0, total - returned);
          const paid = settledForInvoice(i, payments, checks);
          return <tr key={i.id}>
            <td className="font-black">{i.number}</td><td>{formatPersianDate(i.date)}</td><td>{i.customerName || '—'}</td>
            <td><div className="flex flex-wrap gap-1"><InvoiceStatus status={i.status} /><ReturnProgressBadge returned={returned} total={total} /></div></td>
            <td className="font-bold">{money(total)} <span className="text-[10px] text-slate-400">{settings.currency}</span>{returned > 0 && <div className="mt-1 text-[10px] font-normal text-rose-500">مرجوعی: {money(returned)} · خالص: {money(netTotal)}</div>}</td>
            <td>{money(paid)}</td>
            <td className={netTotal - paid > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{money(Math.max(0, netTotal - paid))}</td>
            <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(i.id)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button>{i.status === 'draft' && <Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('پیش‌نویس حذف شود؟', { title: 'حذف پیش‌نویس', confirmLabel: 'حذف', danger: true })) deleteInvoice(i.id); }} title="حذف پیش‌نویس"><Trash2 className="h-4 w-4" /></Button>}</div></td>
          </tr>;
        })}
        {!list.length && <EmptyRow cols={8} text="فاکتوری مطابق فیلتر پیدا نشد." />}
      </tbody></table></div>
    </Card>
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
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const list = customers.filter((customer) =>
    (statusFilter === 'all' || customer.status === statusFilter) &&
    (customer.name + ' ' + customer.phone + ' ' + customer.code).toLowerCase().includes(q.toLowerCase())
  );
  const balance = (customer: Customer) => customerNetBalance(customer.id, invoices, payments, checks, adjustments, customer.openingBalance || 0, returns);
  const startEdit = (customer?: Customer) => {
    setEdit(customer ? { ...customer } : {
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
    });
    setOpen(true);
  };

  const saveCustomer = () => {
    if (!edit) return;
    const errors = validateOfficialFields(edit);
    if (errors.length) {
      notify(errors.join('\n'), 'error');
      return;
    }
    upsertCustomer(edit);
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
      <div className="table-wrap"><table className="data-table">
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
                <Button variant="ghost" size="icon" onClick={() => startEdit(customer)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className={customer.status === 'archived' ? 'text-emerald-600' : 'text-amber-600'} onClick={() => upsertCustomer({ ...customer, status: customer.status === 'archived' ? 'active' : 'archived' })} title={customer.status === 'archived' ? 'بازگردانی' : 'آرشیو کردن'}>{customer.status === 'archived' ? <Check className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
                <Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('طرف حساب حذف شود؟', { title: 'حذف طرف حساب', confirmLabel: 'حذف', danger: true })) { const result = deleteCustomer(customer.id); if (!result.ok) notify(result.message || 'حذف طرف حساب انجام نشد.', 'error'); } }} title="حذف"><Trash2 className="h-4 w-4" /></Button>
              </div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={8} text="طرف حسابی پیدا نشد." />}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-black">{edit && customers.some((customer) => customer.id === edit.id) ? 'ویرایش طرف حساب' : 'طرف حساب جدید'}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">اطلاعات حقوقی برای فاکتور رسمی قابل استفاده است. مانده اول دوره فقط هنگام ساخت طرف حساب تعیین می‌شود.</DialogDescription>
        </DialogHeader>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="کد شخص"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Customer['kind'] })}><option value="customer">مشتری</option><option value="supplier">تامین‌کننده</option><option value="both">هر دو</option></select></Field>
          <Field label="وضعیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Customer['status'] })}><option value="active">فعال</option><option value="archived">آرشیو</option></select></Field>
          <Field label="تلفن"><Input dir="rtl" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="شناسه ملی"><Input value={edit.nationalId} onChange={(e) => setEdit({ ...edit, nationalId: e.target.value })} /></Field>
          <Field label="کد اقتصادی"><Input value={edit.economicCode} onChange={(e) => setEdit({ ...edit, economicCode: e.target.value })} /></Field>
          <Field label="کد پستی"><Input value={edit.postalCode} onChange={(e) => setEdit({ ...edit, postalCode: e.target.value })} /></Field>
          <Field label="مانده اول دوره">
            <Input type="number" disabled={customers.some((customer) => customer.id === edit.id)} className={customers.some((customer) => customer.id === edit.id) ? 'bg-slate-100' : ''} value={edit.openingBalance || 0} onChange={(e) => setEdit({ ...edit, openingBalance: Number(e.target.value) })} />
            <span className="mt-1 block text-[10px] leading-5 text-slate-400">مثبت = بدهکار، منفی = بستانکار. اصلاحات بعدی از دفتر حساب ثبت می‌شوند.</span>
          </Field>
          <Field label="آدرس" className="sm:col-span-2"><Textarea value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button disabled={!edit.name.trim()} onClick={saveCustomer}><Check className="h-4 w-4" /> ذخیره</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
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

  const submitAdjustment = () => {
    if (!customer) return;
    const amount = Math.abs(Number(adjustAmount || 0));
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
        <div className="table-wrap"><table className="data-table min-w-[980px]">
          <thead><tr><th>تاریخ</th><th>شرح</th><th>مرجع</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th><th>وضعیت / سند</th></tr></thead>
          <tbody>
            {visible.map((entry) => <tr key={entry.id}>
              <td>{entry.date === 'ابتدای دوره' ? entry.date : formatPersianDate(entry.date)}</td>
              <td><div className="font-bold">{entry.title}</div>{entry.note && <div className="mt-1 max-w-[360px] text-[11px] leading-5 text-slate-500">{entry.note}</div>}{!entry.effective && entry.nominalAmount ? <div className="mt-1 text-[10px] text-amber-600">مبلغ اسمی {money(entry.nominalAmount)}؛ بدون اثر در مانده</div> : null}</td>
              <td>{entry.reference || '—'}</td>
              <td className="font-bold text-rose-700">{entry.debit ? money(entry.debit) : '—'}</td>
              <td className="font-bold text-emerald-700">{entry.credit ? money(entry.credit) : '—'}</td>
              <td className={entry.balance > 0 ? 'font-black text-rose-700' : entry.balance < 0 ? 'font-black text-emerald-700' : 'font-black'}>{money(Math.abs(entry.balance))}{entry.balance > 0 ? ' بدهکار' : entry.balance < 0 ? ' بستانکار' : ''}</td>
              <td><div className="flex items-center gap-2"><LedgerStatus status={entry.status} effective={entry.effective} kind={entry.kind} />{entry.invoiceId && entry.invoiceKind && onOpenInvoice && <Button variant="ghost" size="sm" onClick={() => onOpenInvoice(entry.invoiceId!, entry.invoiceKind!)}><FileText className="h-3.5 w-3.5" /> سند مبنا</Button>}</div></td>
            </tr>)}
            {!visible.length && <EmptyRow cols={7} text="گردشی مطابق فیلتر فعلی وجود ندارد." />}
          </tbody>
        </table></div>
      </Card>
    </> : <Card><CardContent className="py-16 text-center text-slate-400">برای مشاهده دفتر حساب، یک طرف حساب انتخاب کنید.</CardContent></Card>}

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">ثبت اصلاحیه حساب</DialogTitle><DialogDescription className="text-sm text-slate-500">اصلاحیه به‌عنوان یک گردش مستقل ذخیره می‌شود و مانده اول دوره یا اسناد قبلی را بازنویسی نمی‌کند.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع اصلاحیه"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as 'debit' | 'credit')}><option value="debit">بدهکار</option><option value="credit">بستانکار</option></select></Field>
          <Field label={'مبلغ (' + settings.currency + ')'}><Input type="number" min="0" value={adjustAmount} onChange={(e) => setAdjustAmount(Number(e.target.value))} /></Field>
          <Field label="تاریخ"><PersianDateInput value={adjustDate} onChange={setAdjustDate} /></Field>
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
  const { products, upsertProduct, deleteProduct, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const list = products.filter((product) => (product.name + ' ' + product.code).toLowerCase().includes(q.toLowerCase()));
  const startEdit = (product?: Product) => {
    setEdit(product ? { ...product } : { id: uid('prd'), code: String(1000 + products.length + 1), name: '', kind: 'product', unit: 'عدد', salePrice: 0, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0 });
    setOpen(true);
  };
  const existing = edit ? products.some((product) => product.id === edit.id) : false;

  return <div className="space-y-5">
    <PageHead title="کالا و خدمات" subtitle="تعریف کالا، خدمت و قیمت‌ها؛ تغییر موجودی کالای موجود فقط از بخش انبار انجام می‌شود" action={<Button onClick={() => startEdit()}><Plus className="h-4 w-4" /> کالا / خدمت جدید</Button>} />
    <Card>
      <CardHeader><SearchBox value={q} onChange={setQ} /></CardHeader>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>کد</th><th>نام</th><th>نوع</th><th>واحد</th><th>قیمت خرید</th><th>قیمت فروش</th><th>موجودی</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((product) => <tr key={product.id}>
            <td className="font-bold">{product.code}</td><td className="font-bold">{product.name}</td>
            <td><Badge className={product.kind === 'service' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}>{product.kind === 'service' ? 'خدمت' : 'کالا'}</Badge></td>
            <td>{product.unit}</td><td>{money(product.buyPrice)}</td>
            <td className="font-bold">{money(product.salePrice)} <span className="text-[10px] text-slate-400">{settings.currency}</span></td>
            <td className={product.kind === 'product' && product.stock <= product.minStock ? 'font-black text-rose-600' : ''}>{product.kind === 'product' ? money(product.stock) + ' ' + product.unit : '—'}</td>
            <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => startEdit(product)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('این مورد حذف شود؟', { title: 'حذف کالا / خدمت', confirmLabel: 'حذف', danger: true })) { const result = deleteProduct(product.id); if (!result.ok) notify(result.message || 'حذف کالا / خدمت انجام نشد.', 'error'); } }}><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>)}
          {!list.length && <EmptyRow cols={8} text="کالا یا خدمتی پیدا نشد." />}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">تعریف کالا / خدمت</DialogTitle><DialogDescription className="text-sm text-slate-500">موجودی اولیه فقط هنگام ایجاد کالا قابل ثبت است. بعد از آن هر تغییر موجودی در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="کد"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Product['kind'] })}><option value="product">کالا</option><option value="service">خدمت</option></select></Field>
          <Field label="واحد"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field>
          <Field label="قیمت خرید / مبنا"><Input type="number" min="0" value={edit.buyPrice} onChange={(e) => setEdit({ ...edit, buyPrice: Number(e.target.value) })} /></Field>
          <Field label="قیمت فروش"><Input type="number" min="0" value={edit.salePrice} onChange={(e) => setEdit({ ...edit, salePrice: Number(e.target.value) })} /></Field>
          {edit.kind === 'product' && <>
            <Field label={existing ? 'موجودی فعلی' : 'موجودی اولیه'}>
              <Input type="number" disabled={existing} className={existing ? 'bg-slate-100' : ''} value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} />
              {existing && <span className="mt-1 block text-[10px] leading-5 text-slate-400">برای تغییر موجودی از «انبار → شمارش / اصلاح موجودی» استفاده کنید.</span>}
            </Field>
            <Field label="حداقل موجودی"><Input type="number" min="0" value={edit.minStock} onChange={(e) => setEdit({ ...edit, minStock: Number(e.target.value) })} /></Field>
          </>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!edit.name.trim()} onClick={() => { upsertProduct(edit); setOpen(false); }}>ذخیره</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
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

  const list = products.filter((product) => product.kind === 'product').filter((product) => (product.name + product.code).toLowerCase().includes(q.toLowerCase()));
  const total = list.reduce((sum, product) => sum + product.stock * Number(product.averageCost ?? product.buyPrice ?? 0), 0);
  const low = list.filter((product) => product.stock <= product.minStock).length;
  const cardexProduct = products.find((product) => product.id === cardexProductId);
  const cardex = stockMovements.filter((movement) => movement.productId === cardexProductId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const adjustmentProduct = products.find((product) => product.id === adjustProductId);

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

  const submitAdjustment = () => {
    if (!adjustProductId) return;
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
      <div className="table-wrap"><table className="data-table min-w-[980px]">
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
      </table></div>
    </Card>

    <Dialog open={!!cardexProductId} onOpenChange={(open) => !open && setCardexProductId(null)}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle className="text-lg font-black">کاردکس {cardexProduct?.name || ''}</DialogTitle><DialogDescription className="text-sm text-slate-500">هر حرکت موجودی با منبع، مقدار ورود/خروج، مانده و میانگین موزون بعد از حرکت ثبت می‌شود.</DialogDescription></DialogHeader>
        <div className="max-h-[65vh] overflow-auto"><table className="data-table min-w-[900px]">
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
        </table></div>
      </DialogContent>
    </Dialog>

    <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">شمارش / اصلاح موجودی</DialogTitle><DialogDescription className="text-sm text-slate-500">این عملیات موجودی قبلی را بازنویسی نمی‌کند؛ اختلاف به‌صورت یک StockMovement مستقل در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="کالا"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustProductId} onChange={(e) => changeAdjustmentProduct(e.target.value)}><option value="">انتخاب...</option>{products.filter((product) => product.kind === 'product').map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name} · موجودی {money(product.stock)}</option>)}</select></Field>
          <Field label="نوع عملیات"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={adjustMode} onChange={(e) => changeAdjustmentMode(e.target.value as 'count' | 'delta')}><option value="count">شمارش انبار (موجودی واقعی)</option><option value="delta">اصلاح افزایشی / کاهشی</option></select></Field>
          <Field label={adjustMode === 'count' ? 'موجودی واقعی شمارش‌شده' : 'مقدار اصلاح (+ / -)'}><Input type="number" value={adjustQuantity} onChange={(e) => setAdjustQuantity(Number(e.target.value))} /></Field>
          <Field label="تاریخ"><PersianDateInput value={adjustDate} onChange={setAdjustDate} /></Field>
          <Field label="دلیل / شرح *" className="sm:col-span-2"><Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="مثلاً شمارش پایان ماه، شکستگی، کسری انبار..." /></Field>
          {adjustmentProduct && <div className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">موجودی فعلی: <b>{money(adjustmentProduct.stock)} {adjustmentProduct.unit}</b>{adjustMode === 'count' ? ' · اختلاف ثبت‌شونده: ' + money(Number(adjustQuantity || 0) - adjustmentProduct.stock) : ''}</div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button><Button disabled={!adjustProductId || !adjustNote.trim()} onClick={submitAdjustment}>ثبت در کاردکس</Button></div>
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
  const { payments, customers, invoices, checks, reserveDocumentNumber, addPayment, deletePayment, settings } = useAccountingStore();
  const [open, setOpen] = useState(false);
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
    const remaining = Math.max(0, invoiceTotal(invoice) - settledForInvoice(invoice, payments, checks));
    setForm({
      ...form,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      direction,
      documentNumber: direction === form.direction ? form.documentNumber : reserveDocumentNumber(direction),
      checkId: undefined,
      amount: remaining || form.amount,
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

  const submit = () => {
    const result = addPayment(form);
    if (!result.ok) {
      notify(result.message || 'ثبت تراکنش انجام نشد.', 'error');
      return;
    }
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
      <div className="table-wrap"><table className="data-table">
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
              <td>{invoice?.number || '—'}</td>
              <td className={direction === 'receipt' ? 'font-black text-emerald-700' : 'font-black text-rose-700'}>{money(payment.amount)} {settings.currency}</td>
              <td>{payment.method !== 'check' ? <Badge className="bg-emerald-50 text-emerald-700">اعمال‌شده</Badge> : effective ? <Badge className="bg-emerald-50 text-emerald-700">وصول / پاس شده</Badge> : <Badge className={check?.status === 'bounced' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>{check?.status === 'bounced' ? 'برگشتی؛ بدون اثر' : check ? 'در انتظار؛ بدون اثر' : 'چک نامعتبر'}</Badge>}</td>
              <td>{payment.reference || check?.number || '—'}</td>
              <td><Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('تراکنش حذف شود؟', { title: 'حذف تراکنش', confirmLabel: 'حذف', danger: true })) deletePayment(payment.id); }}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={10} text="تراکنشی ثبت نشده است." />}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-black">{form.direction === 'receipt' ? 'ثبت دریافت' : 'ثبت پرداخت'}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">فاکتور فروش فقط با دریافت و فاکتور خرید فقط با پرداخت تسویه می‌شود. چک تا زمان وصول/پاس شدن روی تسویه اثر ندارد.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
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
              <option value="">بدون اتصال</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.kind === 'sale' ? 'فروش' : 'خرید'} {invoice.number} — مانده {money(Math.max(0, invoiceTotal(invoice) - settledForInvoice(invoice, payments, checks)))}</option>)}
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
          <Field label={`مبلغ (${settings.currency}) *`}><Input type="number" min="0" value={form.amount} readOnly={form.method === 'check' && !!form.checkId} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="تاریخ"><PersianDateInput value={form.date} onChange={(date) => setForm({ ...form, date })} /></Field>
          <Field label="شماره پیگیری / مرجع"><Input value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <Field label="توضیحات"><Input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {form.method === 'check' && <div className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">تراکنش چکی هنگام ثبت ایجاد می‌شود، اما تا زمانی که وضعیت چک «وصول/پاس شده» نباشد، مبلغ آن در مانده تسویه فاکتور محاسبه نمی‌شود.</div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!form.customerId || form.amount <= 0 || (form.method === 'check' && !form.checkId)} onClick={submit}>ثبت {form.direction === 'receipt' ? 'دریافت' : 'پرداخت'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

export function ChecksView() {
  const { checks, payments, customers, reserveDocumentNumber, upsertCheck, deleteCheck, settings } = useAccountingStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState<CheckRecord>({ id: '', documentNumber: '', direction: 'received', customerId: '', amount: 0, dueDate: todayIso(), number: '', bank: '', owner: '', status: 'pending', notes: '' });

  const start = (check?: CheckRecord) => {
    setForm(check ? { ...check } : { id: uid('chk'), documentNumber: reserveDocumentNumber('check'), direction: 'received', customerId: '', amount: 0, dueDate: todayIso(), number: '', bank: '', owner: '', status: 'pending', notes: '' });
    setOpen(true);
  };
  const list = checks.filter((check) => filter === 'all' || check.status === filter);
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name || '—';
  const linkedPayment = payments.find((payment) => payment.checkId === form.id);

  const save = () => {
    const result = upsertCheck(form);
    if (!result.ok) {
      notify(result.message || 'ذخیره چک انجام نشد.', 'error');
      return;
    }
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
      <div className="table-wrap"><table className="data-table">
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
              <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => start(check)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => remove(check.id)}><Trash2 className="h-4 w-4" /></Button></div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={10} text="چکی در این وضعیت وجود ندارد." />}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">ثبت / ویرایش چک</DialogTitle><DialogDescription className="text-sm text-slate-500">{linkedPayment ? 'این چک به تراکنش متصل است؛ نوع، طرف حساب و مبلغ قفل هستند. تغییر وضعیت چک، تسویه فاکتور را خودکار باز محاسبه می‌کند.' : 'چک می‌تواند بعداً از بخش دریافت و پرداخت به یک تراکنش متصل شود.'}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CheckRecord['direction'] })}><option value="received">دریافتی</option><option value="issued">پرداختی</option></select></Field>
          <Field label="طرف حساب"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">انتخاب...</option>{customers.filter((customer) => customer.status !== 'archived' || customer.id === form.customerId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
          <Field label="شماره چک"><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
          <Field label="بانک"><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
          <Field label="صاحب چک"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label={`مبلغ (${settings.currency})`}><Input readOnly={!!linkedPayment} className={linkedPayment ? 'bg-slate-100' : ''} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="سررسید"><PersianDateInput value={form.dueDate || todayIso()} onChange={(dueDate) => setForm({ ...form, dueDate })} /></Field>
          <Field label="وضعیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CheckRecord['status'] })}><option value="pending">در انتظار</option><option value="cleared">وصول / پاس شده</option><option value="bounced">برگشتی</option></select></Field>
          <Field label="توضیحات" className="sm:col-span-2"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!form.customerId || form.amount <= 0} onClick={save}>ذخیره</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function CheckStatus({ status }: { status: CheckRecord['status'] }) { return status === 'cleared' ? <Badge className="bg-emerald-50 text-emerald-700">وصول شده</Badge> : status === 'bounced' ? <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge> : <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>; }

export function SettingsView() {
  const store = useAccountingStore();
  const {
    settings,
    setSettings,
    upsertBusinessProfile,
    deleteBusinessProfile,
    setDefaultBusinessProfile,
    resetAll,
  } = store;
  const [draft, setDraft] = useState(settings);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.defaultBusinessProfileId);
  const selectedProfile = settings.businessProfiles.find((profile) => profile.id === selectedProfileId)
    || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
    || settings.businessProfiles[0];
  const [profileDraft, setProfileDraft] = useState<BusinessProfile>(() => structuredClone(selectedProfile));

  useEffect(() => {
    const profile = settings.businessProfiles.find((item) => item.id === selectedProfileId)
      || settings.businessProfiles.find((item) => item.id === settings.defaultBusinessProfileId)
      || settings.businessProfiles[0];
    if (profile) setProfileDraft(structuredClone(profile));
  }, [selectedProfileId, settings.businessProfiles, settings.defaultBusinessProfileId]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const loadSignature = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('فایل امضا باید تصویر باشد.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify('حجم تصویر امضا حداکثر ۲ مگابایت باشد.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileDraft((current) => ({ ...current, signatureImage: reader.result as string, showSignature: current.showSignature !== false }));
      }
    };
    reader.onerror = () => notify('خواندن تصویر امضا انجام نشد.', 'error');
    reader.readAsDataURL(file);
  };

  const newProfile = () => {
    const base = selectedProfile || settings.businessProfiles[0];
    const profile: BusinessProfile = {
      ...(base || {
        businessName: '', ownerName: '', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '',
        cardNumber: '', iban: '', bankName: '', invoiceTitle: 'فاکتور فروش', footer: '',
      }),
      id: uid('business'),
      label: 'پروفایل جدید',
    };
    setSelectedProfileId(profile.id);
    setProfileDraft(profile);
  };

  const saveProfile = () => {
    if (!profileDraft.label.trim() || !profileDraft.businessName.trim()) {
      notify('عنوان پروفایل و نام کسب‌وکار الزامی است.', 'warning');
      return;
    }
    const errors = validateOfficialFields(profileDraft);
    if (errors.length) {
      notify(errors.join('\n'), 'error');
      return;
    }
    const result = upsertBusinessProfile(profileDraft);
    if (!result.ok) {
      notify(result.message || 'ذخیره پروفایل انجام نشد.', 'error');
      return;
    }
    setSelectedProfileId(profileDraft.id);
  };

  const makeDefault = () => {
    const result = setDefaultBusinessProfile(profileDraft.id);
    if (!result.ok) notify(result.message || 'تغییر پروفایل پیش‌فرض انجام نشد.', 'error');
  };

  const removeProfile = async () => {
    if (!(await confirmDialog('این پروفایل حذف شود؟', { title: 'حذف پروفایل', confirmLabel: 'حذف', danger: true }))) return;
    const result = deleteBusinessProfile(profileDraft.id);
    if (!result.ok) {
      notify(result.message || 'حذف پروفایل انجام نشد.', 'error');
      return;
    }
    setSelectedProfileId(settings.defaultBusinessProfileId);
  };

  const saveGlobalSettings = () => {
    setSettings({
      ...settings,
      currency: draft.currency,
      defaultTax: Number(draft.defaultTax || 0),
      numbering: draft.numbering,
    });
  };

  return <div className="space-y-5">
    <PageHead title="تنظیمات" subtitle="پروفایل‌های صادرکننده، شماره‌گذاری اسناد و نسخه پشتیبان" />

    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-sky-600" /> پروفایل‌های اطلاعات کسب‌وکار</CardTitle>
          <div className="mt-1 text-xs text-slate-500">این پروفایل‌ها فقط هویت، تماس و اطلاعات بانکی چاپ فاکتور را تغییر می‌دهند؛ مشتری، کالا، انبار و شماره‌گذاری مشترک می‌مانند.</div>
        </div>
        <Button onClick={newProfile}><Plus className="h-4 w-4" /> پروفایل جدید</Button>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {settings.businessProfiles.map((profile) => <button
            key={profile.id}
            type="button"
            onClick={() => setSelectedProfileId(profile.id)}
            className={`w-full rounded-xl border p-3 text-right transition ${selectedProfileId === profile.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center justify-between gap-2"><span className="font-black">{profile.label}</span>{profile.id === settings.defaultBusinessProfileId && <Badge className="bg-emerald-50 text-emerald-700">پیش‌فرض</Badge>}</div>
            <div className="mt-1 truncate text-xs text-slate-500">{profile.businessName || 'بدون نام کسب‌وکار'}</div>
          </button>)}
        </div>

        {profileDraft && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="عنوان پروفایل *"><Input value={profileDraft.label} onChange={(e) => setProfileDraft({ ...profileDraft, label: e.target.value })} /></Field>
          <Field label="نام کسب‌وکار *"><Input value={profileDraft.businessName} onChange={(e) => setProfileDraft({ ...profileDraft, businessName: e.target.value })} /></Field>
          <Field label="نام صاحب حساب"><Input value={profileDraft.ownerName} onChange={(e) => setProfileDraft({ ...profileDraft, ownerName: e.target.value })} /></Field>
          <Field label="تلفن"><Input dir="rtl" value={profileDraft.phone} onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })} /></Field>
          <Field label="شناسه ملی / کد ملی"><Input value={profileDraft.nationalId} onChange={(e) => setProfileDraft({ ...profileDraft, nationalId: e.target.value })} /></Field>
          <Field label="کد اقتصادی"><Input value={profileDraft.economicCode} onChange={(e) => setProfileDraft({ ...profileDraft, economicCode: e.target.value })} /></Field>
          <Field label="کد پستی"><Input value={profileDraft.postalCode} onChange={(e) => setProfileDraft({ ...profileDraft, postalCode: e.target.value })} /></Field>
          <Field label="نام بانک"><Input value={profileDraft.bankName} onChange={(e) => setProfileDraft({ ...profileDraft, bankName: e.target.value })} /></Field>
          <Field label="شماره کارت"><Input dir="rtl" value={profileDraft.cardNumber} onChange={(e) => setProfileDraft({ ...profileDraft, cardNumber: e.target.value })} /></Field>
          <Field label="شماره شبا"><Input dir="rtl" value={profileDraft.iban} onChange={(e) => setProfileDraft({ ...profileDraft, iban: e.target.value })} /></Field>
          <Field label="عنوان فاکتور فروش"><Input value={profileDraft.invoiceTitle} onChange={(e) => setProfileDraft({ ...profileDraft, invoiceTitle: e.target.value })} /></Field>
          <Field label="آدرس" className="sm:col-span-2"><Textarea value={profileDraft.address} onChange={(e) => setProfileDraft({ ...profileDraft, address: e.target.value })} /></Field>
          <Field label="پاورقی فاکتور" className="sm:col-span-2"><Textarea value={profileDraft.footer} onChange={(e) => setProfileDraft({ ...profileDraft, footer: e.target.value })} /></Field>
          <Field label="تصویر امضا" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
              <div className="grid h-24 w-40 place-items-center overflow-hidden rounded-lg bg-slate-50">
                {profileDraft.signatureImage ? <img src={profileDraft.signatureImage} alt="پیش‌نمایش امضا" className="max-h-20 max-w-36 object-contain" /> : <span className="text-xs text-slate-400">بدون امضا</span>}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> {profileDraft.signatureImage ? 'جایگزینی تصویر' : 'آپلود تصویر'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { loadSignature(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                </label>
                {profileDraft.signatureImage && <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => setProfileDraft({ ...profileDraft, signatureImage: undefined })}><Trash2 className="h-4 w-4" /> حذف امضا</Button>}
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={profileDraft.showSignature !== false} onChange={(e) => setProfileDraft({ ...profileDraft, showSignature: e.target.checked })} /> نمایش امضا روی فاکتور</label>
              </div>
            </div>
          </Field>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            {profileDraft.id !== settings.defaultBusinessProfileId && <Button variant="outline" onClick={makeDefault}>انتخاب به‌عنوان پیش‌فرض</Button>}
            {settings.businessProfiles.some((profile) => profile.id === profileDraft.id) && <Button variant="danger" onClick={removeProfile}><Trash2 className="h-4 w-4" /> حذف</Button>}
            <Button onClick={saveProfile}><Check className="h-4 w-4" /> ذخیره پروفایل</Button>
          </div>
        </div>}
      </CardContent>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[1fr_.72fr]">
      <Card>
        <CardHeader><CardTitle>تنظیمات عمومی اسناد</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="واحد پول"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'تومان' | 'ریال' })}><option value="تومان">تومان</option><option value="ریال">ریال</option></select></Field>
          <Field label="مالیات پیش‌فرض"><Input type="number" min="0" value={draft.defaultTax} onChange={(e) => setDraft({ ...draft, defaultTax: Number(e.target.value) })} /></Field>
          <NumberingSettingsEditor draft={draft} onChange={setDraft} />
          <div className="sm:col-span-2 flex justify-end"><Button onClick={saveGlobalSettings}>ذخیره تنظیمات عمومی</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <StorageBackupPanel />
        <YasImporterPanel />
        <Card><CardHeader><CardTitle className="text-rose-700">بازنشانی داده‌ها</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">داده‌های فعلی با نمونه اولیه جایگزین می‌شوند.</p><Button variant="danger" onClick={async () => { if (await confirmDialog('همه داده‌ها بازنشانی شوند؟ این عملیات داده فعلی را با داده نمونه جایگزین می‌کند.', { title: 'بازنشانی کامل', confirmLabel: 'بازنشانی', danger: true })) resetAll(); }}><Trash2 className="h-4 w-4" /> بازنشانی کامل</Button></CardContent></Card>
      </div>
    </div>
  </div>;
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
        <Field label="شماره بعدی"><Input type="number" min="1" value={draft.numbering[key].next} onChange={(e) => update(key, 'next', Number(e.target.value))} /></Field>
        <Field label="تعداد رقم"><Input type="number" min="1" max="12" value={draft.numbering[key].padding} onChange={(e) => update(key, 'padding', Number(e.target.value))} /></Field>
      </div>)}
    </div>
  </Panel>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`space-y-1.5 ${className}`}><span className="block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>; }

