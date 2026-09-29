'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock,
  Check, CircleDollarSign, Download, Edit3, FileText, Package, Plus, Search, Settings2,
  Trash2, Upload, UserRound, WalletCards
} from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { AccountingData, CheckRecord, Customer, InvoiceKind, Payment, Product } from '@/lib/types';
import { customerNetBalance, effectivePaymentAmount, invoiceTotal, money, resolvedPaymentDirection, settledForInvoice, todayFa, uid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{action}</div>;
}

function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative w-full max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pr-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function InvoiceListView({ kind, onEdit, onNew }: { kind: InvoiceKind; onEdit: (id: string) => void; onNew: () => void }) {
  const { invoices, payments, checks, deleteInvoice, settings } = useAccountingStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const list = invoices.filter((i) => i.kind === kind).filter((i) => (i.number + ' ' + i.customerName).toLowerCase().includes(q.toLowerCase())).filter((i) => status === 'all' || i.status === status);
  const label = kind === 'sale' ? 'فاکتورهای فروش' : 'فاکتورهای خرید';
  return <div className="space-y-5">
    <PageHead title={label} subtitle="ثبت، جستجو، ویرایش و کنترل وضعیت فاکتورها" action={<Button onClick={onNew}><Plus className="h-4 w-4" /> {kind === 'sale' ? 'فاکتور فروش جدید' : 'فاکتور خرید جدید'}</Button>} />
    <Card><CardHeader className="flex-wrap"><SearchBox value={q} onChange={setQ} /><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">همه وضعیت‌ها</option><option value="draft">پیش‌نویس</option><option value="final">قطعی</option><option value="partial">بخشی تسویه</option><option value="settled">تسویه‌شده</option><option value="void">باطل</option></select></CardHeader>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>طرف حساب</th><th>وضعیت</th><th>مبلغ کل</th><th>پرداخت</th><th>مانده</th><th>عملیات</th></tr></thead><tbody>
        {list.map((i) => { const total = invoiceTotal(i); const paid = settledForInvoice(i, payments, checks); return <tr key={i.id}><td className="font-black">{i.number}</td><td>{i.date}</td><td>{i.customerName || '—'}</td><td><InvoiceStatus status={i.status} /></td><td className="font-bold">{money(total)} <span className="text-[10px] text-slate-400">{settings.currency}</span></td><td>{money(paid)}</td><td className={total - paid > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{money(Math.max(0, total - paid))}</td><td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(i.id)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button>{i.status === 'draft' && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => confirm('پیش‌نویس حذف شود؟') && deleteInvoice(i.id)} title="حذف پیش‌نویس"><Trash2 className="h-4 w-4" /></Button>}</div></td></tr>; })}
        {!list.length && <EmptyRow cols={8} text="فاکتوری مطابق فیلتر پیدا نشد." />}
      </tbody></table></div>
    </Card>
  </div>;
}

function InvoiceStatus({ status }: { status: string }) {
  const x: Record<string, [string, string]> = { draft: ['پیش‌نویس', 'bg-slate-100 text-slate-600'], final: ['قطعی', 'bg-sky-50 text-sky-700'], partial: ['بخشی تسویه', 'bg-amber-50 text-amber-700'], settled: ['تسویه‌شده', 'bg-emerald-50 text-emerald-700'], void: ['باطل', 'bg-rose-50 text-rose-700'] };
  const [label, cls] = x[status] || [status, '']; return <Badge className={cls}>{label}</Badge>;
}

export function CustomersView() {
  const { customers, invoices, payments, checks, upsertCustomer, deleteCustomer, settings } = useAccountingStore();
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Customer | null>(null); const [open, setOpen] = useState(false);
  const list = customers.filter((c) => (c.name + ' ' + c.phone + ' ' + c.code).toLowerCase().includes(q.toLowerCase()));
  const balance = (id: string) => customerNetBalance(id, invoices, payments, checks);
  const start = (c?: Customer) => { setEdit(c ? { ...c } : { id: uid('cus'), code: String(100000 + customers.length + 1), name: '', kind: 'customer', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '' }); setOpen(true); };
  return <div className="space-y-5"><PageHead title="مشتریان و تامین‌کنندگان" subtitle="دفتر طرف حساب، مشخصات رسمی و مانده حساب" action={<Button onClick={() => start()}><Plus className="h-4 w-4" /> طرف حساب جدید</Button>} />
    <Card><CardHeader><SearchBox value={q} onChange={setQ} placeholder="نام، تلفن یا کد شخص..." /></CardHeader><div className="table-wrap"><table className="data-table"><thead><tr><th>کد</th><th>نام</th><th>نوع</th><th>تلفن</th><th>آدرس</th><th>مانده حساب</th><th>عملیات</th></tr></thead><tbody>{list.map((c) => { const b = balance(c.id); return <tr key={c.id}><td className="font-bold">{c.code}</td><td className="font-bold">{c.name}</td><td>{c.kind === 'customer' ? 'مشتری' : c.kind === 'supplier' ? 'تامین‌کننده' : 'هر دو'}</td><td>{c.phone || '—'}</td><td className="max-w-xs truncate">{c.address || '—'}</td><td className={b > 0 ? 'font-black text-rose-600' : b < 0 ? 'font-black text-emerald-600' : 'font-bold'}>{money(Math.abs(b))} {settings.currency}{b > 0 ? ' بدهکار' : b < 0 ? ' بستانکار' : ''}</td><td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => start(c)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => confirm('طرف حساب حذف شود؟') && deleteCustomer(c.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}{!list.length && <EmptyRow cols={7} text="طرف حسابی پیدا نشد." />}</tbody></table></div></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle className="text-lg font-black">{edit && customers.some((c) => c.id === edit.id) ? 'ویرایش طرف حساب' : 'طرف حساب جدید'}</DialogTitle><DialogDescription className="text-sm text-slate-500">اطلاعات حقوقی برای فاکتور رسمی قابل استفاده است.</DialogDescription></DialogHeader>{edit && <div className="grid gap-3 sm:grid-cols-2"><Field label="نام *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="کد شخص"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field><Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Customer['kind'] })}><option value="customer">مشتری</option><option value="supplier">تامین‌کننده</option><option value="both">هر دو</option></select></Field><Field label="تلفن"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field><Field label="شناسه ملی"><Input value={edit.nationalId} onChange={(e) => setEdit({ ...edit, nationalId: e.target.value })} /></Field><Field label="کد اقتصادی"><Input value={edit.economicCode} onChange={(e) => setEdit({ ...edit, economicCode: e.target.value })} /></Field><Field label="کد پستی"><Input value={edit.postalCode} onChange={(e) => setEdit({ ...edit, postalCode: e.target.value })} /></Field><Field label="آدرس" className="sm:col-span-2"><Textarea value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field><div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!edit.name.trim()} onClick={() => { upsertCustomer(edit); setOpen(false); }}><Check className="h-4 w-4" /> ذخیره</Button></div></div>}</DialogContent></Dialog>
  </div>;
}

export function ProductsView() {
  const { products, upsertProduct, deleteProduct, settings } = useAccountingStore();
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<Product | null>(null); const [open, setOpen] = useState(false);
  const list = products.filter((p) => (p.name + ' ' + p.code).toLowerCase().includes(q.toLowerCase()));
  const start = (p?: Product) => { setEdit(p ? { ...p } : { id: uid('prd'), code: String(1000 + products.length + 1), name: '', kind: 'product', unit: 'عدد', salePrice: 0, buyPrice: 0, stock: 0, minStock: 0 }); setOpen(true); };
  return <div className="space-y-5"><PageHead title="کالا و خدمات" subtitle="تعریف کالا، خدمت، قیمت خرید و فروش و حداقل موجودی" action={<Button onClick={() => start()}><Plus className="h-4 w-4" /> کالا / خدمت جدید</Button>} />
    <Card><CardHeader><SearchBox value={q} onChange={setQ} /></CardHeader><div className="table-wrap"><table className="data-table"><thead><tr><th>کد</th><th>نام</th><th>نوع</th><th>واحد</th><th>قیمت خرید</th><th>قیمت فروش</th><th>موجودی</th><th>عملیات</th></tr></thead><tbody>{list.map((p) => <tr key={p.id}><td className="font-bold">{p.code}</td><td className="font-bold">{p.name}</td><td><Badge className={p.kind === 'service' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}>{p.kind === 'service' ? 'خدمت' : 'کالا'}</Badge></td><td>{p.unit}</td><td>{money(p.buyPrice)}</td><td className="font-bold">{money(p.salePrice)} <span className="text-[10px] text-slate-400">{settings.currency}</span></td><td className={p.kind === 'product' && p.stock <= p.minStock ? 'font-black text-rose-600' : ''}>{p.kind === 'product' ? `${money(p.stock)} ${p.unit}` : '—'}</td><td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => start(p)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => confirm('این مورد حذف شود؟') && deleteProduct(p.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}{!list.length && <EmptyRow cols={8} text="کالا یا خدمتی پیدا نشد." />}</tbody></table></div></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle className="text-lg font-black">تعریف کالا / خدمت</DialogTitle><DialogDescription className="text-sm text-slate-500">خدمات روی موجودی انبار اثر نمی‌گذارند.</DialogDescription></DialogHeader>{edit && <div className="grid gap-3 sm:grid-cols-2"><Field label="نام *"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="کد"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field><Field label="نوع"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Product['kind'] })}><option value="product">کالا</option><option value="service">خدمت</option></select></Field><Field label="واحد"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field><Field label="قیمت خرید"><Input type="number" min="0" value={edit.buyPrice} onChange={(e) => setEdit({ ...edit, buyPrice: Number(e.target.value) })} /></Field><Field label="قیمت فروش"><Input type="number" min="0" value={edit.salePrice} onChange={(e) => setEdit({ ...edit, salePrice: Number(e.target.value) })} /></Field>{edit.kind === 'product' && <><Field label="موجودی اولیه / فعلی"><Input type="number" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field><Field label="حداقل موجودی"><Input type="number" min="0" value={edit.minStock} onChange={(e) => setEdit({ ...edit, minStock: Number(e.target.value) })} /></Field></>}<div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!edit.name.trim()} onClick={() => { upsertProduct(edit); setOpen(false); }}>ذخیره</Button></div></div>}</DialogContent></Dialog>
  </div>;
}

export function InventoryView() {
  const { products, settings } = useAccountingStore(); const [q, setQ] = useState('');
  const list = products.filter((p) => p.kind === 'product').filter((p) => (p.name + p.code).toLowerCase().includes(q.toLowerCase()));
  const total = list.reduce((s, p) => s + p.stock * p.buyPrice, 0); const low = list.filter((p) => p.stock <= p.minStock).length;
  return <div className="space-y-5"><PageHead title="انبار" subtitle="موجودی کالا از روی فاکتورهای قطعی خرید و فروش به‌روزرسانی می‌شود" />
    <div className="grid gap-4 sm:grid-cols-3"><Metric icon={Boxes} title="تعداد اقلام" value={String(list.length)} /><Metric icon={Archive} title="ارزش موجودی" value={`${money(total)} ${settings.currency}`} /><Metric icon={AlertTriangle} title="زیر حداقل موجودی" value={String(low)} danger={low > 0} /></div>
    <Card><CardHeader><SearchBox value={q} onChange={setQ} /></CardHeader><div className="table-wrap"><table className="data-table"><thead><tr><th>کد</th><th>کالا</th><th>واحد</th><th>موجودی</th><th>حداقل</th><th>قیمت خرید</th><th>ارزش موجودی</th><th>وضعیت</th></tr></thead><tbody>{list.map((p) => <tr key={p.id}><td>{p.code}</td><td className="font-bold">{p.name}</td><td>{p.unit}</td><td className="font-black">{money(p.stock)}</td><td>{money(p.minStock)}</td><td>{money(p.buyPrice)}</td><td>{money(p.stock * p.buyPrice)}</td><td>{p.stock <= p.minStock ? <Badge className="bg-rose-50 text-rose-700">نیاز به تامین</Badge> : <Badge className="bg-emerald-50 text-emerald-700">مناسب</Badge>}</td></tr>)}{!list.length && <EmptyRow cols={8} text="کالایی برای نمایش نیست." />}</tbody></table></div></Card>
  </div>;
}

export function PaymentsView() {
  const { payments, customers, invoices, checks, addPayment, deletePayment, settings } = useAccountingStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const emptyPayment = (direction: Payment['direction'] = 'receipt'): Payment => ({
    id: uid('pay'),
    customerId: '',
    invoiceId: '',
    direction,
    method: 'cash',
    checkId: undefined,
    amount: 0,
    date: todayFa(),
    reference: '',
    notes: '',
  });
  const [form, setForm] = useState<Payment>(() => emptyPayment());

  const start = (direction: Payment['direction'] = 'receipt') => {
    setForm(emptyPayment(direction));
    setOpen(true);
  };

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name || '—';
  const invoiceFor = (payment: Payment) => payment.invoiceId ? invoices.find((invoice) => invoice.id === payment.invoiceId) : undefined;
  const directionOf = (payment: Payment) => resolvedPaymentDirection(payment, invoiceFor(payment));

  const list = payments.filter((payment) =>
    (customerName(payment.customerId) + ' ' + (payment.reference || '') + ' ' + (directionOf(payment) === 'receipt' ? 'دریافت' : 'پرداخت'))
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
      amount: check.amount,
      reference: check.number,
      invoiceId: linkedInvoice && linkedInvoice.customerId === check.customerId && (linkedInvoice.kind === 'sale' ? 'receipt' : 'payment') === direction ? linkedInvoice.id : '',
    });
  };

  const submit = () => {
    const result = addPayment(form);
    if (!result.ok) {
      window.alert(result.message || 'ثبت تراکنش انجام نشد.');
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
        <thead><tr><th>تاریخ</th><th>نوع</th><th>طرف حساب</th><th>روش</th><th>فاکتور</th><th>مبلغ</th><th>وضعیت اثر</th><th>مرجع</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((payment) => {
            const invoice = invoiceFor(payment);
            const direction = directionOf(payment);
            const check = payment.checkId ? checks.find((item) => item.id === payment.checkId) : undefined;
            const effective = effectivePaymentAmount(payment, checks) > 0;
            return <tr key={payment.id}>
              <td>{payment.date}</td>
              <td><Badge className={direction === 'receipt' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{direction === 'receipt' ? 'دریافت' : 'پرداخت'}</Badge></td>
              <td className="font-bold">{customerName(payment.customerId)}</td>
              <td>{payment.method === 'cash' ? 'نقدی' : payment.method === 'card' ? 'کارت / واریز' : 'چک'}</td>
              <td>{invoice?.number || '—'}</td>
              <td className={direction === 'receipt' ? 'font-black text-emerald-700' : 'font-black text-rose-700'}>{money(payment.amount)} {settings.currency}</td>
              <td>{payment.method !== 'check' ? <Badge className="bg-emerald-50 text-emerald-700">اعمال‌شده</Badge> : effective ? <Badge className="bg-emerald-50 text-emerald-700">وصول / پاس شده</Badge> : <Badge className={check?.status === 'bounced' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>{check?.status === 'bounced' ? 'برگشتی؛ بدون اثر' : check ? 'در انتظار؛ بدون اثر' : 'چک نامعتبر'}</Badge>}</td>
              <td>{payment.reference || check?.number || '—'}</td>
              <td><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => confirm('تراکنش حذف شود؟') && deletePayment(payment.id)}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={9} text="تراکنشی ثبت نشده است." />}
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
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Payment['direction'], invoiceId: '', checkId: undefined })}>
              <option value="receipt">دریافت</option><option value="payment">پرداخت</option>
            </select>
          </Field>
          <Field label="طرف حساب *">
            <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, invoiceId: '', checkId: undefined })}>
              <option value="">انتخاب...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
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
          <Field label="تاریخ"><Input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
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
  const { checks, payments, customers, upsertCheck, deleteCheck, settings } = useAccountingStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState<CheckRecord>({ id: '', direction: 'received', customerId: '', amount: 0, dueDate: '', number: '', bank: '', owner: '', status: 'pending', notes: '' });

  const start = (check?: CheckRecord) => {
    setForm(check ? { ...check } : { id: uid('chk'), direction: 'received', customerId: '', amount: 0, dueDate: '', number: '', bank: '', owner: '', status: 'pending', notes: '' });
    setOpen(true);
  };
  const list = checks.filter((check) => filter === 'all' || check.status === filter);
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name || '—';
  const linkedPayment = payments.find((payment) => payment.checkId === form.id);

  const save = () => {
    const result = upsertCheck(form);
    if (!result.ok) {
      window.alert(result.message || 'ذخیره چک انجام نشد.');
      return;
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    if (!confirm('چک حذف شود؟')) return;
    const result = deleteCheck(id);
    if (!result.ok) window.alert(result.message || 'حذف چک انجام نشد.');
  };

  return <div className="space-y-5">
    <PageHead title="چک‌ها و سررسید" subtitle="چک‌های دریافتی و پرداختی؛ اثر مالی چک فقط پس از وصول/پاس شدن اعمال می‌شود" action={<Button onClick={() => start()}><Plus className="h-4 w-4" /> چک جدید</Button>} />
    <Card>
      <CardHeader><div className="flex flex-wrap gap-2">{[['all','همه'],['pending','در انتظار'],['cleared','وصول / پاس شده'],['bounced','برگشتی']].map(([key,label]) => <Button key={key} variant={filter === key ? 'default' : 'outline'} size="sm" onClick={() => setFilter(key)}>{label}</Button>)}</div></CardHeader>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>نوع</th><th>طرف حساب</th><th>شماره چک</th><th>بانک</th><th>مبلغ</th><th>سررسید</th><th>وضعیت</th><th>اتصال</th><th>عملیات</th></tr></thead>
        <tbody>
          {list.map((check) => {
            const linked = payments.find((payment) => payment.checkId === check.id);
            return <tr key={check.id}>
              <td>{check.direction === 'received' ? <span className="font-bold text-emerald-700">دریافتی</span> : <span className="font-bold text-rose-700">پرداختی</span>}</td>
              <td className="font-bold">{customerName(check.customerId)}</td><td>{check.number}</td><td>{check.bank}</td>
              <td className="font-black">{money(check.amount)} {settings.currency}</td><td>{check.dueDate || '—'}</td><td><CheckStatus status={check.status} /></td>
              <td>{linked ? <Badge className="bg-sky-50 text-sky-700">متصل به تراکنش</Badge> : <span className="text-slate-400">آزاد</span>}</td>
              <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => start(check)}><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => remove(check.id)}><Trash2 className="h-4 w-4" /></Button></div></td>
            </tr>;
          })}
          {!list.length && <EmptyRow cols={9} text="چکی در این وضعیت وجود ندارد." />}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-lg font-black">ثبت / ویرایش چک</DialogTitle><DialogDescription className="text-sm text-slate-500">{linkedPayment ? 'این چک به تراکنش متصل است؛ نوع، طرف حساب و مبلغ قفل هستند. تغییر وضعیت چک، تسویه فاکتور را خودکار باز محاسبه می‌کند.' : 'چک می‌تواند بعداً از بخش دریافت و پرداخت به یک تراکنش متصل شود.'}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CheckRecord['direction'] })}><option value="received">دریافتی</option><option value="issued">پرداختی</option></select></Field>
          <Field label="طرف حساب"><select disabled={!!linkedPayment} className="h-10 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">انتخاب...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
          <Field label="شماره چک"><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
          <Field label="بانک"><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
          <Field label="صاحب چک"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label={`مبلغ (${settings.currency})`}><Input readOnly={!!linkedPayment} className={linkedPayment ? 'bg-slate-100' : ''} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="سررسید"><Input value={form.dueDate} placeholder="۱۴۰۵/۰۴/۱۵" onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="وضعیت"><select className="h-10 w-full rounded-xl border border-slate-200 px-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CheckRecord['status'] })}><option value="pending">در انتظار</option><option value="cleared">وصول / پاس شده</option><option value="bounced">برگشتی</option></select></Field>
          <Field label="توضیحات" className="sm:col-span-2"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button disabled={!form.customerId || form.amount <= 0} onClick={save}>ذخیره</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function CheckStatus({ status }: { status: CheckRecord['status'] }) { return status === 'cleared' ? <Badge className="bg-emerald-50 text-emerald-700">وصول شده</Badge> : status === 'bounced' ? <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge> : <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>; }

export function ReportsView() {
  const { invoices, payments, products, checks, settings } = useAccountingStore();
  const posted = invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void');
  const sales = posted.filter((invoice) => invoice.kind === 'sale').reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const purchases = posted.filter((invoice) => invoice.kind === 'purchase').reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const directionOf = (payment: Payment) => resolvedPaymentDirection(payment, payment.invoiceId ? invoices.find((invoice) => invoice.id === payment.invoiceId) : undefined);
  const receipts = payments.filter((payment) => directionOf(payment) === 'receipt').reduce((sum, payment) => sum + effectivePaymentAmount(payment, checks), 0);
  const outgoing = payments.filter((payment) => directionOf(payment) === 'payment').reduce((sum, payment) => sum + effectivePaymentAmount(payment, checks), 0);
  const stock = products.filter((product) => product.kind === 'product').reduce((sum, product) => sum + product.stock * product.buyPrice, 0);
  const pending = checks.filter((check) => check.status === 'pending').reduce((sum, check) => sum + check.amount, 0);
  const rows = [
    ['فروش قطعی', sales],
    ['خرید قطعی', purchases],
    ['دریافت موثر', receipts],
    ['پرداخت موثر', outgoing],
    ['ارزش موجودی کالا', stock],
    ['چک‌های در انتظار', pending],
  ] as const;
  const max = Math.max(...rows.map((item) => item[1]), 1);

  return <div className="space-y-5">
    <PageHead title="گزارش‌ها" subtitle="خلاصه مالی و عملیاتی؛ چک‌های در انتظار/برگشتی تا زمان وصول در دریافت و پرداخت موثر محاسبه نمی‌شوند" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{rows.map(([label, value]) => <Card key={label}><CardContent><div className="text-xs font-bold text-slate-500">{label}</div><div className="mt-2 text-xl font-black">{money(value)} <span className="text-[10px] text-slate-400">{settings.currency}</span></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>مقایسه شاخص‌ها</CardTitle></CardHeader><CardContent className="space-y-5">{rows.map(([label, value]) => <div key={label}><div className="mb-2 flex justify-between text-sm"><span className="font-bold">{label}</span><span>{money(value)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div></div>)}</CardContent></Card>
  </div>;
}

export function SettingsView() {
  const store = useAccountingStore(); const { settings, setSettings, replaceAll, resetAll } = store; const fileRef = useRef<HTMLInputElement>(null); const [draft, setDraft] = useState(settings);
  const exportData = () => { const data: AccountingData = { customers: store.customers, products: store.products, invoices: store.invoices, payments: store.payments, checks: store.checks, settings: store.settings }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `accountants-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href); };
  const importData = async (file?: File) => { if (!file) return; try { const parsed = JSON.parse(await file.text()) as AccountingData; if (!parsed.customers || !parsed.products || !parsed.invoices || !parsed.settings) throw new Error('invalid'); replaceAll(parsed); setDraft(parsed.settings); alert('نسخه پشتیبان با موفقیت بازیابی شد.'); } catch { alert('فایل پشتیبان معتبر نیست.'); } };
  return <div className="space-y-5"><PageHead title="تنظیمات" subtitle="اطلاعات کسب‌وکار، فاکتور رسمی و نسخه پشتیبان" />
    <div className="grid gap-5 xl:grid-cols-[1fr_.72fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-sky-600" /> اطلاعات کسب‌وکار و فاکتور</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Field label="نام کسب‌وکار"><Input value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} /></Field><Field label="نام صاحب حساب"><Input value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} /></Field><Field label="تلفن"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field><Field label="عنوان فاکتور فروش"><Input value={draft.invoiceTitle} onChange={(e) => setDraft({ ...draft, invoiceTitle: e.target.value })} /></Field><Field label="شناسه ملی"><Input value={draft.nationalId} onChange={(e) => setDraft({ ...draft, nationalId: e.target.value })} /></Field><Field label="کد اقتصادی"><Input value={draft.economicCode} onChange={(e) => setDraft({ ...draft, economicCode: e.target.value })} /></Field><Field label="کد پستی"><Input value={draft.postalCode} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} /></Field><Field label="واحد پول"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'تومان' | 'ریال' })}><option value="تومان">تومان</option><option value="ریال">ریال</option></select></Field><Field label="شماره کارت"><Input value={draft.cardNumber} onChange={(e) => setDraft({ ...draft, cardNumber: e.target.value })} /></Field><Field label="شماره شبا"><Input value={draft.iban} onChange={(e) => setDraft({ ...draft, iban: e.target.value })} /></Field><Field label="آدرس" className="sm:col-span-2"><Textarea value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field><Field label="پاورقی فاکتور" className="sm:col-span-2"><Textarea value={draft.footer} onChange={(e) => setDraft({ ...draft, footer: e.target.value })} /></Field><div className="sm:col-span-2 flex justify-end"><Button onClick={() => setSettings(draft)}>ذخیره تنظیمات</Button></div></CardContent></Card>
      <div className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-sky-600" /> پشتیبان‌گیری</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-slate-600"><p>تمام داده‌ها در LocalStorage مرورگر نگهداری می‌شوند. برای انتقال به سیستم دیگر خروجی JSON بگیرید.</p><div className="grid gap-2"><Button variant="outline" onClick={exportData}><ArrowDownToLine className="h-4 w-4" /> دانلود نسخه پشتیبان</Button><Button variant="outline" onClick={() => fileRef.current?.click()}><ArrowUpFromLine className="h-4 w-4" /> بازیابی نسخه پشتیبان</Button><input ref={fileRef} type="file" className="hidden" accept="application/json" onChange={(e) => importData(e.target.files?.[0])} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-rose-700">بازنشانی داده‌ها</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">داده‌های فعلی با نمونه اولیه جایگزین می‌شوند.</p><Button variant="danger" onClick={() => confirm('همه داده‌ها بازنشانی شوند؟') && resetAll()}><Trash2 className="h-4 w-4" /> بازنشانی کامل</Button></CardContent></Card></div>
    </div>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`space-y-1.5 ${className}`}><span className="block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>; }
function Metric({ icon: Icon, title, value, danger = false }: { icon: typeof Boxes; title: string; value: string; danger?: boolean }) { return <Card><CardContent className="flex items-center gap-4"><div className={`grid h-11 w-11 place-items-center rounded-xl ${danger ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'}`}><Icon className="h-5 w-5" /></div><div><div className="text-xs font-bold text-slate-500">{title}</div><div className={`mt-1 text-xl font-black ${danger ? 'text-rose-700' : ''}`}>{value}</div></div></CardContent></Card>; }
