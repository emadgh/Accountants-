'use client';
import { AttachmentList } from '@/components/ui/attachment-list';
import { useAsyncSubmission } from '@/hooks/use-persisted-action';
import { useShallow } from 'zustand/react/shallow';

import { useAccountingNavigation } from '@/components/accounting-app';
import { MoneyTransactionFields } from '@/components/forms/money-transaction-fields';
import { PartyPicker } from '@/components/forms/party-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { projectPurchaseInvoiceAllocation, projectPurchaseReturnAllocation } from '@/lib/accounting';
import { projectFinancialSummary } from '@/lib/domain/project-summary';
import { notify } from '@/lib/feedback';
import { persistOperation } from '@/lib/operation-result';
import { flushAccountingPersistence, uploadProjectAttachment } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { MoneyTransaction, Project, ProjectStatus } from '@/lib/types';
import { invoiceTotal, money, todayFa, uid } from '@/lib/utils';
import { ArrowUpFromLine, BriefcaseBusiness, FilePlus2, FileText, Plus, Search, ShoppingCart, Wallet } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

const statusLabels: Record<ProjectStatus, string> = {
  'in-progress': 'در حال انجام', 'awaiting-approval': 'منتظر تأیید', completed: 'تکمیل‌شده', cancelled: 'لغوشده',
};

export function ProjectsView() {
  const formSubmission = useAsyncSubmission();
  const store = useAccountingStore(useShallow((state) => ({ accounts: state.accounts, addAttachment: state.addAttachment, addMoneyTransaction: state.addMoneyTransaction, attachments: state.attachments, checks: state.checks, customers: state.customers, invoices: state.invoices, moneyTransactions: state.moneyTransactions, payments: state.payments, products: state.products, projects: state.projects, quotes: state.quotes, returns: state.returns, settings: state.settings, stockMovements: state.stockMovements, upsertProject: state.upsertProject })));
  const navigation = useAccountingNavigation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [creating, setCreating] = useState(false);
  const projectSearch = useSearchParams();
  const selectedId = projectSearch.get('projectId');
  const setSelectedId = (id: string) => { const params = new URLSearchParams(window.location.search); params.set('projectId', id); window.history.replaceState(null, '', `/projects?${params}`); };
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [agreedAmount, setAgreedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [costDate, setCostDate] = useState(todayFa());
  const [costReference, setCostReference] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [costError, setCostError] = useState('');
  const projects = useMemo(() => store.projects.filter((project) => (statusFilter === 'all' || project.status === statusFilter) && `${project.title} ${store.customers.find((customer) => customer.id === project.customerId)?.name || ''}`.toLowerCase().includes(query.toLowerCase())), [store.projects, store.customers, query, statusFilter]);
  const selected = store.projects.find((project) => project.id === selectedId) || projects[0];

  const saveProject = () => formSubmission.run(async () => {
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
  });

  const addCost = () => formSubmission.run(async () => {
    if (!selected) return;
    setCostError('');
    const transaction: MoneyTransaction = {
      id: uid('transaction'), kind: 'expense', status: 'final', date: costDate, reference: costReference, amount: Number(costAmount),
      settlementAccountId: cashAccountId, categoryAccountId: expenseAccountId, description: costDescription.trim(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId: selected.id,
    };
    const result = store.addMoneyTransaction(transaction);
    if (!result.ok) { setCostError(result.message || 'ثبت هزینه انجام نشد.'); return; }
    try { await flushAccountingPersistence(); }
    catch (error) { setCostError(error instanceof Error ? error.message : 'ذخیره هزینه روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; }
    setCostAmount(''); setCostDescription('');
    notify('هزینه به تراکنش مالی موجود متصل شد.', 'success');
  });

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

  const { income, expenses, purchaseInvoices, purchaseReturns, cost, costOfGoodsSold, inventoryPurchases, estimatedProfit, received } = useMemo(() => projectFinancialSummary(store, selected?.id), [store.invoices, store.returns, store.products, store.stockMovements, store.moneyTransactions, store.payments, store.checks, selected?.id]);
  const attachments = selected ? store.attachments.filter((attachment) => attachment.projectId === selected.id) : [];
  const linkedQuotes = selected ? store.quotes.filter((quote) => quote.projectId === selected.id) : [];
  const linkedInvoices = selected ? store.invoices.filter((invoice) => invoice.projectId === selected.id) : [];

  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2 text-2xl font-black"><BriefcaseBusiness className="h-6 w-6 text-sky-600" />پروژه‌ها</div><p className="mt-1 text-sm text-slate-500">فاکتورها، هزینه‌های مستقیم و فایل‌های تحویلی هر مشتری را کنار هم نگه دارید.</p></div><Button onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> پروژه جدید</Button></div>

    {creating && <Card><CardHeader><CardTitle>پرونده پروژه</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projectError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2 lg:col-span-3">{projectError}</p>}
      <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2">عنوان پروژه<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً طراحی بسته‌بندی محصول" /></label>
      <label className="space-y-1 text-xs font-bold text-slate-600">مشتری<PartyPicker value={customerId} onChange={setCustomerId} /></label>
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

      {selected ? <div className="space-y-4"><Card><CardHeader><div><CardTitle>{selected.title}</CardTitle><div className="mt-1 text-xs text-slate-500">{store.customers.find((customer) => customer.id === selected.customerId)?.name} · موعد {selected.dueDate || 'تعیین نشده'}</div></div><select aria-label="وضعیت پروژه" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" value={selected.status} onChange={async (event) => { const result = await persistOperation(() => store.upsertProject({ ...selected, status: event.target.value as ProjectStatus })); if (!result.ok) notify(result.message || 'ذخیره انجام نشد.', 'error'); }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">مبلغ توافقی</div><b className="mt-1 block">{money(selected.agreedAmount)} {store.settings.currency}</b></div><div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-700">فروش خالص پس از مرجوعی و مالیات</div><b className="mt-1 block">{money(income)} {store.settings.currency}</b></div><div className="rounded-xl bg-sky-50 p-3"><div className="text-xs text-sky-700">دریافت مؤثر</div><b className="mt-1 block">{money(received)} {store.settings.currency}</b></div><div className="rounded-xl bg-rose-50 p-3"><div className="text-xs text-rose-700">هزینه مستقیم (هزینه دستی + خدمات خرید)</div><b className="mt-1 block">{money(cost)} {store.settings.currency}</b></div><div className="rounded-xl bg-amber-50 p-3"><div className="text-xs text-amber-700">بهای تمام‌شده کالای فروخته‌شده</div><b className="mt-1 block">{money(costOfGoodsSold)} {store.settings.currency}</b></div><div className="rounded-xl bg-indigo-50 p-3"><div className="text-xs text-indigo-700">کالای خریداری‌شده و ثبت‌شده در انبار</div><b className="mt-1 block">{money(inventoryPurchases)} {store.settings.currency}</b></div><div className="text-xs leading-6 text-slate-500 sm:col-span-3">سود برآوردی بر پایه هزینه‌های ثبت‌شده: <b className="text-slate-800">{money(estimatedProfit)} {store.settings.currency}</b>. مبلغ خدمات فاکتور خرید پس از کسر مرجوعی در هزینه مستقیم آمده است؛ خرید کالای انباری تا زمان مصرف جدا نمایش داده می‌شود تا با بهای تمام‌شده دوباره شمرده نشود. دریافت از مشتری جدا از درآمد است.</div>{selected.notes && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 sm:col-span-3">{selected.notes}</p>}</CardContent></Card>

      <Card><CardHeader><div className="flex w-full flex-wrap items-center justify-between gap-3"><CardTitle>اسناد پروژه</CardTitle><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigation.navigate('quotes', { projectId: selected.id })}><FilePlus2 className="h-4 w-4" /> پیش‌فاکتور جدید</Button><Button size="sm" variant="outline" onClick={() => navigation.newInvoice('purchase', selected.id)}><ShoppingCart className="h-4 w-4" /> فاکتور خرید</Button><Button size="sm" onClick={() => navigation.newInvoice('sale', selected.id)}><FilePlus2 className="h-4 w-4" /> فاکتور فروش</Button></div></div></CardHeader><CardContent className="space-y-2">{linkedQuotes.map((quote) => <button key={quote.id} onClick={() => navigation.navigate('quotes', { quoteId: quote.id, projectId: selected.id })} className="flex w-full justify-between rounded-xl border border-slate-200 p-3 text-right text-sm hover:bg-slate-50"><span>{quote.number} · پیش‌فاکتور</span><b>{quote.status}</b></button>)}{linkedInvoices.map((invoice) => <button key={invoice.id} onClick={() => navigation.viewInvoice(invoice.id, invoice.kind)} className="flex w-full justify-between rounded-xl border border-slate-200 p-3 text-right text-sm hover:bg-slate-50"><span>{invoice.number} · فاکتور {invoice.kind === 'sale' ? 'فروش' : 'خرید'} · {money(invoiceTotal(invoice))} {store.settings.currency}</span><b>{invoice.status === 'draft' ? 'پیش‌نویس' : invoice.status === 'void' ? 'باطل' : invoice.status === 'partial' ? 'بخشی‌تسویه' : invoice.status === 'settled' ? 'تسویه‌شده' : 'قطعی'}</b></button>)}{!linkedQuotes.length && !linkedInvoices.length && <div className="text-sm text-slate-400">هنوز سندی به این پروژه متصل نیست.</div>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />هزینه مستقیم پروژه</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{costError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{costError}</p>}<p className="text-xs leading-5 text-slate-500 sm:col-span-2">هزینه خدمات از فاکتورهای خرید متصل به پروژه به‌طور خودکار محاسبه می‌شود. این هزینه را دوباره دستی ثبت نکنید. ثبت دستی برای مخارجی است که فاکتور خرید ندارند.</p><MoneyTransactionFields value={{ kind: 'expense', date: costDate, reference: costReference, amount: Number(costAmount), description: costDescription, settlementAccountId: cashAccountId, categoryAccountId: expenseAccountId }} onChange={(draft) => { setCostAmount(String(draft.amount)); setCostDescription(draft.description); setCashAccountId(draft.settlementAccountId); setExpenseAccountId(draft.categoryAccountId); setCostDate(draft.date); setCostReference(draft.reference || ''); }} accounts={store.accounts} currency={store.settings.currency} fixedKind /><Button disabled={formSubmission.busy} className="sm:col-span-2" onClick={() => void addCost()}>ثبت هزینه در حسابداری و اتصال به پروژه</Button><div className="space-y-2 sm:col-span-2">{expenses.map((transaction) => <div key={transaction.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{transaction.description}</span><b>{money(transaction.amount)}</b></div>)}{purchaseInvoices.map((invoice) => <button key={invoice.id} onClick={() => navigation.viewInvoice(invoice.id, 'purchase')} className="flex w-full justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm hover:bg-slate-100"><span>فاکتور خرید {invoice.number} · هزینه خدمات پس از مرجوعی</span><b>{money(Math.max(0, projectPurchaseInvoiceAllocation(invoice, store.products).service - purchaseReturns.filter((document) => document.originalInvoiceId === invoice.id).reduce((sum, document) => sum + projectPurchaseReturnAllocation(document, invoice, store.products).service, 0)))}</b></button>)}</div></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />اسناد و پیوست‌ها</CardTitle><Button variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}><ArrowUpFromLine className="h-4 w-4" /> افزودن PDF یا تصویر</Button></CardHeader><CardContent className="space-y-2"><AttachmentList attachments={attachments} emptyText="فایلی به این پروژه پیوست نشده است." /></CardContent></Card>
      </div> : <Card><CardContent className="p-10 text-center text-sm text-slate-500">برای دیدن جزئیات، یک پروژه انتخاب کنید.</CardContent></Card>}
    </div>
    <input ref={fileInput} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.target.files?.[0])} />
  </div>;
}
