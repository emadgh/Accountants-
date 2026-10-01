'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, BriefcaseBusiness, FilePlus2, FileText, Plus, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/input';
import { useAccountingStore } from '@/lib/store';
import { useAccountingNavigation } from '@/components/accounting-app';
import { flushAccountingPersistence, uploadProjectAttachment } from '@/lib/storage';
import type { MoneyTransaction, Project, ProjectStatus } from '@/lib/types';
import { effectivePaymentAmount, invoiceTotal, money, returnDocumentAmount, settledForInvoice, todayFa, uid } from '@/lib/utils';
import { notify } from '@/lib/feedback';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';

const statusLabels: Record<ProjectStatus, string> = {
  'in-progress': 'در حال انجام', 'awaiting-approval': 'منتظر تأیید', completed: 'تکمیل‌شده', cancelled: 'لغوشده',
};

export function ProjectsView() {
  const store = useAccountingStore();
  const navigation = useAccountingNavigation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [costError, setCostError] = useState('');
  const projects = useMemo(() => store.projects.filter((project) => (statusFilter === 'all' || project.status === statusFilter) && `${project.title} ${store.customers.find((customer) => customer.id === project.customerId)?.name || ''}`.toLowerCase().includes(query.toLowerCase())), [store.projects, store.customers, query, statusFilter]);
  const selected = store.projects.find((project) => project.id === selectedId) || projects[0];

  const saveProject = async () => {
    setProjectError('');
    setSaving(true);
    const now = new Date().toISOString();
    const project: Project = { id: uid('project'), title: title.trim(), customerId, status: 'in-progress', ...(dueDate ? { dueDate } : {}), agreedAmount: Number(agreedAmount || 0), notes: notes.trim(), createdAt: now, updatedAt: now };
    const result = store.upsertProject(project);
    if (!result.ok) { setProjectError(result.message || 'ذخیره پروژه انجام نشد.'); setSaving(false); return; }
    try { await flushAccountingPersistence(); }
    catch (error) { setProjectError(error instanceof Error ? error.message : 'ذخیره پروژه روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); setSaving(false); return; }
    setSelectedId(project.id); setCreating(false); setTitle(''); setCustomerId(''); setDueDate(''); setAgreedAmount(''); setNotes(''); setSaving(false);
    notify('پروژه ایجاد شد.', 'success');
  };

  const addCost = async () => {
    if (!selected) return;
    setCostError('');
    const transaction: MoneyTransaction = {
      id: uid('transaction'), kind: 'expense', status: 'final', date: todayFa(), amount: Number(costAmount),
      settlementAccountId: cashAccountId, categoryAccountId: expenseAccountId, description: costDescription.trim(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId: selected.id,
    };
    const result = store.addMoneyTransaction(transaction);
    if (!result.ok) { setCostError(result.message || 'ثبت هزینه انجام نشد.'); return; }
    try { await flushAccountingPersistence(); }
    catch (error) { setCostError(error instanceof Error ? error.message : 'ذخیره هزینه روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; }
    setCostAmount(''); setCostDescription('');
    notify('هزینه به تراکنش مالی موجود متصل شد.', 'success');
  };

  const upload = async (file?: File) => {
    if (!file || !selected) return;
    setBusy(true);
    try {
      const attachment = await uploadProjectAttachment(selected.id, file);
      const result = store.addAttachment(attachment);
      if (!result.ok) throw new Error(result.message || 'ثبت پیوست در پرونده انجام نشد.');
      notify('پیوست به پرونده پروژه اضافه شد.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'بارگذاری پیوست انجام نشد.', 'error');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const projectInvoices = selected ? store.invoices.filter((invoice) => invoice.projectId === selected.id && invoice.kind === 'sale' && invoice.status !== 'draft' && invoice.status !== 'void') : [];
  const linkedInvoiceIds = new Set(projectInvoices.map((invoice) => invoice.id));
  const projectReturns = selected ? store.returns.filter((document) => document.status === 'final' && linkedInvoiceIds.has(document.originalInvoiceId)) : [];
  const grossSalesExcludingTax = projectInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice) - Number(invoice.tax || 0), 0);
  const netReturnedSales = projectReturns.reduce((sum, document) => {
    const invoice = projectInvoices.find((item) => item.id === document.originalInvoiceId);
    if (!invoice) return sum;
    const total = invoiceTotal(invoice);
    const returnedTax = total > 0 ? Number(document.totalAmount || 0) * Number(invoice.tax || 0) / total : 0;
    return sum + Number(document.totalAmount || 0) - returnedTax;
  }, 0);
  const income = Math.max(0, grossSalesExcludingTax - netReturnedSales);
  const projectReturnIds = new Set(projectReturns.map((document) => document.id));
  const saleCost = store.stockMovements.filter((movement) => movement.sourceType === 'invoice' && linkedInvoiceIds.has(movement.sourceId) && movement.sourceKind === 'sale')
    .reduce((sum, movement) => sum - movement.quantity * movement.unitCost, 0);
  const returnedCost = store.stockMovements.filter((movement) => movement.sourceType === 'return' && projectReturnIds.has(movement.sourceId) && movement.sourceKind === 'sale-return')
    .reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);
  const costOfGoodsSold = Math.max(0, saleCost - returnedCost);
  const expenses = selected ? store.moneyTransactions.filter((transaction) => transaction.projectId === selected.id && transaction.status === 'final' && transaction.kind === 'expense') : [];
  const cost = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const estimatedProfit = income - cost - costOfGoodsSold;
  const received = projectInvoices.reduce((sum, invoice) => sum + settledForInvoice(invoice, store.payments, store.checks), 0);
  const attachments = selected ? store.attachments.filter((attachment) => attachment.projectId === selected.id) : [];
  const linkedQuotes = selected ? store.quotes.filter((quote) => quote.projectId === selected.id) : [];
  const linkedInvoices = selected ? store.invoices.filter((invoice) => invoice.projectId === selected.id) : [];

  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2 text-2xl font-black"><BriefcaseBusiness className="h-6 w-6 text-sky-600" />پروژه‌ها</div><p className="mt-1 text-sm text-slate-500">فاکتورها، هزینه‌های مستقیم و فایل‌های تحویلی هر مشتری را کنار هم نگه دارید.</p></div><Button onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> پروژه جدید</Button></div>

    {creating && <Card><CardHeader><CardTitle>پرونده پروژه</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projectError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2 lg:col-span-3">{projectError}</p>}
      <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2">عنوان پروژه<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً طراحی بسته‌بندی محصول" /></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">مشتری<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">انتخاب مشتری</option>{store.customers.filter((customer) => customer.kind !== 'supplier').map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">موعد<JalaliDatePicker value={dueDate} onChange={setDueDate} placeholder="بدون موعد" /></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">مبلغ توافقی<Input type="number" min="0" value={agreedAmount} onChange={(event) => setAgreedAmount(event.target.value)} /></label>
      <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-3">یادداشت<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3"><Button variant="outline" onClick={() => setCreating(false)}>انصراف</Button><Button disabled={saving} onClick={() => void saveProject()}>ذخیره پروژه</Button></div>
    </CardContent></Card>}

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card><CardHeader><div className="relative w-full"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input className="pr-9" placeholder="جست‌وجوی پروژه یا مشتری" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="فیلتر وضعیت پروژه" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CardHeader><CardContent className="space-y-2">
        {projects.map((project) => <button key={project.id} onClick={() => setSelectedId(project.id)} className={`w-full rounded-xl border p-3 text-right transition ${selected?.id === project.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex justify-between gap-2"><b className="truncate">{project.title}</b><span className="shrink-0 text-[11px] text-slate-500">{statusLabels[project.status]}</span></div><div className="mt-1 text-xs text-slate-500">{store.customers.find((customer) => customer.id === project.customerId)?.name || 'مشتری حذف‌شده'} · {project.dueDate || 'بدون موعد'}</div></button>)}
        {!projects.length && <div className="py-8 text-center text-sm text-slate-400">پروژه‌ای ثبت نشده است.</div>}
      </CardContent></Card>

      {selected ? <div className="space-y-4"><Card><CardHeader><div><CardTitle>{selected.title}</CardTitle><div className="mt-1 text-xs text-slate-500">{store.customers.find((customer) => customer.id === selected.customerId)?.name} · موعد {selected.dueDate || 'تعیین نشده'}</div></div><select aria-label="وضعیت پروژه" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" value={selected.status} onChange={(event) => store.upsertProject({ ...selected, status: event.target.value as ProjectStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">مبلغ توافقی</div><b className="mt-1 block">{money(selected.agreedAmount)} {store.settings.currency}</b></div><div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-700">فروش خالص پس از مرجوعی و مالیات</div><b className="mt-1 block">{money(income)} {store.settings.currency}</b></div><div className="rounded-xl bg-sky-50 p-3"><div className="text-xs text-sky-700">دریافت مؤثر</div><b className="mt-1 block">{money(received)} {store.settings.currency}</b></div><div className="rounded-xl bg-rose-50 p-3"><div className="text-xs text-rose-700">هزینه مستقیم ثبت‌شده</div><b className="mt-1 block">{money(cost)} {store.settings.currency}</b></div><div className="rounded-xl bg-amber-50 p-3"><div className="text-xs text-amber-700">بهای تمام‌شده کالای فروخته‌شده</div><b className="mt-1 block">{money(costOfGoodsSold)} {store.settings.currency}</b></div><div className="text-xs leading-6 text-slate-500 sm:col-span-3">سود برآوردی بر پایه هزینه‌های ثبت‌شده: <b className="text-slate-800">{money(estimatedProfit)} {store.settings.currency}</b>. دریافت از مشتری جدا از درآمد نمایش داده شده است.</div>{selected.notes && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 sm:col-span-3">{selected.notes}</p>}</CardContent></Card>

      <Card><CardHeader><div className="flex w-full flex-wrap items-center justify-between gap-3"><CardTitle>پیش‌فاکتور و فاکتورهای پروژه</CardTitle><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigation.navigate('quotes', { projectId: selected.id })}><FilePlus2 className="h-4 w-4" /> پیش‌فاکتور جدید</Button><Button size="sm" onClick={() => navigation.newInvoice('sale', selected.id)}><FilePlus2 className="h-4 w-4" /> فاکتور فروش جدید</Button></div></div></CardHeader><CardContent className="space-y-2">{linkedQuotes.map((quote) => <button key={quote.id} onClick={() => navigation.navigate('quotes')} className="flex w-full justify-between rounded-xl border border-slate-200 p-3 text-right text-sm hover:bg-slate-50"><span>{quote.number} · پیش‌فاکتور</span><b>{quote.status}</b></button>)}{linkedInvoices.map((invoice) => <button key={invoice.id} onClick={() => navigation.viewInvoice(invoice.id, invoice.kind)} className="flex w-full justify-between rounded-xl border border-slate-200 p-3 text-right text-sm hover:bg-slate-50"><span>{invoice.number} · فاکتور {invoice.kind === 'sale' ? 'فروش' : 'خرید'}</span><b>{invoice.status === 'draft' ? 'پیش‌نویس' : invoice.status}</b></button>)}{!linkedQuotes.length && !linkedInvoices.length && <div className="text-sm text-slate-400">هنوز سندی به این پروژه متصل نیست.</div>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />هزینه مستقیم پروژه</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{costError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{costError}</p>}<Input placeholder="شرح هزینه" value={costDescription} onChange={(event) => setCostDescription(event.target.value)} /><Input type="number" min="1" placeholder="مبلغ" value={costAmount} onChange={(event) => setCostAmount(event.target.value)} /><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)}><option value="">پرداخت از صندوق/بانک</option>{store.accounts.filter((account) => account.active && account.type === 'asset').map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}><option value="">سرفصل هزینه</option>{store.accounts.filter((account) => account.active && account.type === 'expense').map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><Button className="sm:col-span-2" onClick={() => void addCost()}>ثبت هزینه در حسابداری و اتصال به پروژه</Button><div className="space-y-2 sm:col-span-2">{expenses.map((transaction) => <div key={transaction.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{transaction.description}</span><b>{money(transaction.amount)}</b></div>)}</div></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />اسناد و پیوست‌ها</CardTitle><Button variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}><ArrowUpFromLine className="h-4 w-4" /> افزودن PDF یا تصویر</Button></CardHeader><CardContent className="space-y-2">{attachments.map((attachment) => <button key={attachment.id} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-right hover:bg-slate-50" onClick={() => window.open(`/api/attachments?id=${encodeURIComponent(attachment.id)}`, '_blank', 'noopener,noreferrer')}><span className="truncate text-sm font-semibold">{attachment.filename}</span><span className="mr-3 shrink-0 text-xs text-slate-400">{attachment.mimeType === 'application/pdf' ? 'PDF' : 'تصویر WebP'}</span></button>)}{!attachments.length && <div className="py-5 text-center text-sm text-slate-400">فایلی به این پروژه پیوست نشده است.</div>}</CardContent></Card>
      </div> : <Card><CardContent className="p-10 text-center text-sm text-slate-500">برای دیدن جزئیات، یک پروژه انتخاب کنید.</CardContent></Card>}
    </div>
    <input ref={fileInput} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0])} />
  </div>;
}
