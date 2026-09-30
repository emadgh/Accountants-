'use client';

import { useMemo, useState } from 'react';
import { Check, FilePlus2, FileText, Search, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAccountingNavigation } from '@/components/accounting-app';
import { useAccountingStore } from '@/lib/store';
import type { Quote } from '@/lib/types';
import { invoiceTotal, money, uid } from '@/lib/utils';
import { todayIso } from '@/lib/standards';
import { notify } from '@/lib/feedback';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';

const statusNames: Record<Quote['status'], string> = {
  draft: 'پیش‌نویس', issued: 'ارسال‌شده', accepted: 'پذیرفته‌شده', rejected: 'ردشده', converted: 'تبدیل‌شده',
};

export function QuotesView() {
  const store = useAccountingStore();
  const navigation = useAccountingNavigation();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Quote['status']>('all');
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<Array<{ id: string; productId?: string; description: string; unit: string; qty: string; unitPrice: string }>>([{ id: 'quote-line-1', description: '', unit: 'عدد', qty: '1', unitPrice: '' }]);
  const [notes, setNotes] = useState('');
  const quotes = useMemo(() => store.quotes.filter((quote) => (statusFilter === 'all' || quote.status === statusFilter) && `${quote.number} ${quote.customerName} ${quote.items.map((item) => item.description).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [store.quotes, query, statusFilter]);

  const save = (status: Quote['status']) => {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) return notify('مشتری را انتخاب کنید.', 'error');
    if (!items.length || items.some((item) => !item.description.trim() || Number(item.qty) <= 0 || Number(item.unitPrice) < 0)) return notify('شرح، تعداد و مبلغ همه ردیف‌ها را بررسی کنید.', 'error');
    const now = new Date().toISOString();
    const quote: Quote = {
      id: uid('quote'), number: store.reserveDocumentNumber('quote'), status,
      customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, customerAddress: customer.address,
      businessProfileId: store.settings.defaultBusinessProfileId, date: todayIso(),
      ...(validUntil ? { validUntil } : {}),
      items: items.map((item) => ({ id: uid('quote_item'), ...(item.productId ? { productId: item.productId } : {}), description: item.description.trim(), unit: item.unit, qty: Number(item.qty), unitPrice: Number(item.unitPrice), discount: 0 })),
      discount: 0, tax: 0, shipping: 0, notes: notes.trim(), ...(projectId ? { projectId } : {}),
      createdAt: now, updatedAt: now,
    };
    const result = store.upsertQuote(quote);
    if (!result.ok) return notify(result.message || 'ذخیره پیش‌فاکتور انجام نشد.', 'error');
    setCreating(false); setItems([{ id: 'quote-line-1', description: '', unit: 'عدد', qty: '1', unitPrice: '' }]); setNotes(''); setValidUntil(''); setProjectId('');
    notify('پیش‌فاکتور ذخیره شد.', 'success');
  };

  const mark = (quote: Quote, status: Quote['status']) => {
    const result = store.setQuoteStatus(quote.id, status);
    if (!result.ok) notify(result.message || 'تغییر وضعیت انجام نشد.', 'error');
  };

  const convert = (quote: Quote) => {
    const result = store.convertQuoteToInvoice(quote.id);
    if (!result.ok || !result.invoice) return notify(result.message || 'تبدیل انجام نشد.', 'error');
    notify('پیش‌نویس فاکتور فروش ساخته شد.', 'success');
    navigation.viewInvoice(result.invoice.id, 'sale');
  };

  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="flex items-center gap-2 text-2xl font-black"><FileText className="h-6 w-6 text-sky-600" />پیش‌فاکتورها</div><p className="mt-1 text-sm text-slate-500">پیش‌فاکتور را ثبت و پس از پذیرش به پیش‌نویس فاکتور فروش تبدیل کنید.</p></div>
      <Button onClick={() => setCreating((value) => !value)}><FilePlus2 className="h-4 w-4" /> پیش‌فاکتور جدید</Button>
    </div>

    {creating && <Card><CardHeader><CardTitle>ثبت پیش‌فاکتور خدماتی</CardTitle><Button variant="ghost" size="sm" onClick={() => setCreating(false)}>بستن</Button></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-xs font-bold text-slate-600">مشتری<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">انتخاب مشتری</option>{store.customers.filter((item) => item.kind !== 'supplier').map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">پروژه (اختیاری)<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">بدون پروژه</option>{store.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">اعتبار تا<JalaliDatePicker value={validUntil} onChange={setValidUntil} placeholder="بدون تاریخ پایان" /></label>
      <div className="space-y-2 sm:col-span-2 lg:col-span-3"><div className="flex items-center justify-between"><span className="text-xs font-black text-slate-600">ردیف‌های خدمت / کالا</span><Button type="button" size="sm" variant="outline" onClick={() => setItems((rows) => [...rows, { id: uid('quote_line'), description: '', unit: 'عدد', qty: '1', unitPrice: '' }])}><FilePlus2 className="h-3.5 w-3.5" /> افزودن ردیف</Button></div>{items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-100 p-2 sm:grid-cols-[1fr_1.5fr_.5fr_.7fr_auto]"><select aria-label={`خدمت آماده ردیف ${index + 1}`} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm" value={item.productId || ''} onChange={(event) => { const product = store.products.find((candidate) => candidate.id === event.target.value); setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, productId: product?.id, description: product?.name || row.description, unit: product?.unit || row.unit, unitPrice: product ? String(product.salePrice) : row.unitPrice } : row)); }}><option value="">دستی</option>{store.products.filter((product) => product.kind === 'service' && !product.archived).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><Input aria-label={`شرح ردیف ${index + 1}`} value={item.description} onChange={(event) => setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row))} placeholder="شرح ردیف" /><Input aria-label={`تعداد ردیف ${index + 1}`} type="number" min="0.01" step="any" value={item.qty} onChange={(event) => setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, qty: event.target.value } : row))} /><Input aria-label={`مبلغ واحد ردیف ${index + 1}`} type="number" min="0" value={item.unitPrice} onChange={(event) => setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, unitPrice: event.target.value } : row))} placeholder="مبلغ واحد" /><Button type="button" size="icon" variant="ghost" disabled={items.length === 1} onClick={() => setItems((rows) => rows.filter((row) => row.id !== item.id))} aria-label="حذف ردیف"><X className="h-4 w-4 text-rose-500" /></Button></div>)}</div>
      <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-3">یادداشت<Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="توضیحات اختیاری" /></label>
      <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3"><span className="text-sm text-slate-500">مبلغ برآوردی: <b className="text-slate-900">{money(items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0))} {store.settings.currency}</b></span><div className="flex gap-2"><Button variant="outline" onClick={() => save('draft')}>ذخیره پیش‌نویس</Button><Button onClick={() => save('issued')}><Send className="h-4 w-4" /> ثبت و ارسال</Button></div></div>
    </CardContent></Card>}

    <Card><CardHeader><div className="relative w-full max-w-sm"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input className="pr-9" placeholder="جست‌وجو در شماره، مشتری یا شرح" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="فیلتر وضعیت پیش‌فاکتور" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="text-xs text-slate-500">{quotes.length} پیش‌فاکتور</span></CardHeader><CardContent className="space-y-3">
      {quotes.map((quote) => {
        const amount = invoiceTotal(quote);
        const linkedInvoice = store.invoices.find((invoice) => invoice.id === quote.linkedInvoiceId);
        return <div key={quote.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b>{quote.number}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{statusNames[quote.status]}</span>{quote.validUntil && <span className="text-xs text-slate-400">اعتبار تا {quote.validUntil}</span>}</div><div className="mt-1 text-sm text-slate-600">{quote.customerName} · {quote.items.map((item) => item.description).join('، ')}</div><div className="mt-1 text-xs text-slate-400">{quote.projectId ? store.projects.find((item) => item.id === quote.projectId)?.title : 'بدون پروژه'}</div></div>
          <div className="flex flex-wrap items-center gap-2"><b className="ml-2 text-sm">{money(amount)} {store.settings.currency}</b>
            {quote.status === 'issued' && <><Button size="sm" variant="outline" onClick={() => mark(quote, 'accepted')}><Check className="h-4 w-4" /> پذیرفته شد</Button><Button size="sm" variant="ghost" onClick={() => mark(quote, 'rejected')}><X className="h-4 w-4" /> رد شد</Button></>}
            {quote.status === 'accepted' && <Button size="sm" onClick={() => convert(quote)}><FilePlus2 className="h-4 w-4" /> تبدیل به فاکتور</Button>}
            {quote.status === 'converted' && linkedInvoice && <Button size="sm" variant="outline" onClick={() => navigation.viewInvoice(linkedInvoice.id, 'sale')}>مشاهده فاکتور</Button>}
          </div>
        </div>;
      })}
      {!quotes.length && <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">پیش‌فاکتوری ثبت نشده است.</div>}
    </CardContent></Card>
  </div>;
}
