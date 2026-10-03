'use client';
import { useShallow } from 'zustand/react/shallow';

import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
import { AppNavbarContent } from '@/components/app-navbar';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { useAccountingStore } from '@/lib/store';
import { flushAccountingPersistence } from '@/lib/storage';
import { notify, promptDialog } from '@/lib/feedback';
import { todayIso } from '@/lib/standards';
import { invoiceTotal, money, uid } from '@/lib/utils';
import type { Invoice } from '@/lib/types';
import { calculateAutomaticInstallments, existingAutomaticInstallmentOptions } from '@/lib/installment-plan';

export function InvoiceInstallments({ invoiceId, onBack }: { invoiceId: string | null; onBack: () => void }) {
  const { invoices, settings, saveInvoiceDraft, reviseInvoice } = useAccountingStore(useShallow((state) => ({ invoices: state.invoices, settings: state.settings, saveInvoiceDraft: state.saveInvoiceDraft, reviseInvoice: state.reviseInvoice })));
  const saved = invoices.find((item) => item.id === invoiceId && item.kind === 'sale');
  const [form, setForm] = useState<Invoice | null>(() => saved ? structuredClone(saved) : null);
  const [automatic, setAutomatic] = useState(() => saved ? existingAutomaticInstallmentOptions(saved) : { downPayment: 0, count: 3, profitPercent: 0, firstDueDate: todayIso() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(saved ? structuredClone(saved) : null);
    if (saved) setAutomatic(existingAutomaticInstallmentOptions(saved));
  }, [saved?.id, saved?.revision, saved?.updatedAt]);

  const editable = form?.status === 'draft' || form?.status === 'final';
  const total = form ? invoiceTotal(form) : 0;
  const installments = form?.installments || [];
  const installmentTotal = installments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const valid = installments.length === 0 || (Math.abs(installmentTotal - total) < 0.01 && installments.every((item) => item.dueDate && Number.isFinite(item.amount) && item.amount > 0));
  const update = (changes: Partial<Invoice>) => setForm((current) => current ? { ...current, ...changes } : current);
  const automaticPreview = (() => {
    if (!form) return null;
    try { return { result: calculateAutomaticInstallments(form, automatic), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'محاسبه اقساط انجام نشد.' }; }
  })();
  const generate = () => {
    if (!automaticPreview?.result) return;
    setForm(automaticPreview.result.invoice);
  };

  const save = async () => {
    if (!form || !saved || !editable || saving) return;
    if (!valid) {
      notify('جمع اقساط باید برابر مبلغ کل فاکتور باشد.', 'error');
      return;
    }
    setSaving(true);
    try {
      let result;
      if (saved.status === 'draft') {
        result = saveInvoiceDraft(form);
      } else {
        const reason = await promptDialog('دلیل تغییر سررسید یا اقساط سند قطعی را وارد کنید:', { title: 'ثبت Revision', confirmLabel: 'ثبت تغییرات', placeholder: 'دلیل تغییر...' });
        if (!reason?.trim()) return;
        result = reviseInvoice(form, reason);
      }
      if (!result.ok || !result.invoice) {
        notify(result.message || 'ذخیره برنامه اقساط انجام نشد.', 'error');
        return;
      }
      await flushAccountingPersistence();
      setForm(structuredClone(result.invoice));
      notify('برنامه دریافت ذخیره شد.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'ذخیره روی سرور انجام نشد.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
    <AppNavbarContent title="سررسید و اقساط فاکتور" subtitle={saved ? `فاکتور فروش ${saved.number}` : 'فاکتور پیدا نشد'} leading={<Button variant="ghost" size="icon" onClick={onBack} aria-label="بازگشت به فاکتور"><ArrowRight className="h-4 w-4" /></Button>} />
    {!form || !saved ? <Panel>فاکتور فروش موردنظر پیدا نشد. از فهرست فاکتورها دوباره وارد شوید.</Panel> : <>
      <Panel padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">فاکتور {form.number}</h2><p className="mt-1 text-sm text-slate-500">{form.customerName || 'بدون نام مشتری'}</p></div>
          <div className="text-left"><div className="text-xs text-slate-500">مبلغ کل فاکتور</div><div className="text-lg font-black" dir="ltr">{money(total)} {settings.currency}</div></div>
        </div>
        <p className="mt-4 text-xs text-slate-500">برنامه اقساط زمان‌بندی مطالبات است و به‌تنهایی دریافت مالی ثبت نمی‌کند.</p>
      </Panel>
      {editable && <Panel padding="md" className="space-y-4">
        <div><h2 className="text-base font-black">قسط‌بندی خودکار</h2><p className="mt-1 text-xs leading-6 text-slate-500">سود، یک‌بار روی ماندهٔ پس از پیش‌پرداخت محاسبه می‌شود؛ نرخ ماهانه یا سالانه نیست. پیش‌پرداخت فقط در برنامه ثبت می‌شود و دریافت واقعی باید جداگانه ثبت شود.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold text-slate-600">پیش‌پرداخت ({settings.currency})<input type="number" min="0" step="1" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={automatic.downPayment} onChange={(event) => setAutomatic((current) => ({ ...current, downPayment: Number(event.target.value) }))} /></label>
          <label className="space-y-1 text-xs font-bold text-slate-600">تعداد اقساط<input type="number" min="1" max="60" step="1" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={automatic.count} onChange={(event) => setAutomatic((current) => ({ ...current, count: Number(event.target.value) }))} /></label>
          <label className="space-y-1 text-xs font-bold text-slate-600">سود ثابت روی مانده (درصد)<input type="number" min="0" max="100" step="0.01" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={automatic.profitPercent} onChange={(event) => setAutomatic((current) => ({ ...current, profitPercent: Number(event.target.value) }))} /></label>
          <label className="space-y-1 text-xs font-bold text-slate-600">تاریخ اولین قسط<JalaliDatePicker value={automatic.firstDueDate} onChange={(firstDueDate) => setAutomatic((current) => ({ ...current, firstDueDate }))} /></label>
        </div>
        {automaticPreview?.error ? <p className="text-xs font-bold text-rose-600" role="alert">{automaticPreview.error}</p> : automaticPreview?.result && <div className="grid gap-2 rounded-xl bg-sky-50 p-3 text-sm sm:grid-cols-2">
          <div>مبلغ پایه: <strong>{money(automaticPreview.result.baseAmount)} {settings.currency}</strong></div>
          <div>مانده برای قسط‌بندی: <strong>{money(automaticPreview.result.financed)} {settings.currency}</strong></div>
          <div>سود افزوده به فاکتور: <strong>{money(automaticPreview.result.financeCharge)} {settings.currency}</strong></div>
          <div>مبلغ نهایی فاکتور: <strong>{money(automaticPreview.result.grandTotal)} {settings.currency}</strong></div>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">اعمال محاسبه، برنامهٔ فعلی اقساط را جایگزین می‌کند؛ ذخیره فقط با دکمهٔ پایین صفحه انجام می‌شود.</p><Button type="button" variant="outline" disabled={!automaticPreview?.result} onClick={generate}>محاسبه و جایگزینی اقساط</Button></div>
      </Panel>}
      <Panel padding="md" className="space-y-5">
        <div><h2 className="font-black">سررسید دریافت</h2><p className="mt-1 text-xs text-slate-500">اگر اقساط تعریف نشوند، این تاریخ مبنای پیگیری کل مانده است.</p></div>
        <div className="flex flex-wrap items-center gap-2"><div className="w-full max-w-xs"><JalaliDatePicker value={form.dueDate || ''} onChange={(dueDate) => update({ dueDate })} disabled={!editable} placeholder="بدون سررسید" /></div>{editable && <Button variant="ghost" size="sm" onClick={() => update({ dueDate: undefined })}>پاک‌کردن سررسید</Button>}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5"><div><h2 className="font-black">برنامه اقساط</h2><p className="mt-1 text-xs text-slate-500">جمع اقساط باید با مبلغ کل فاکتور برابر باشد.</p></div>{editable && <Button variant="outline" size="sm" onClick={() => update({ installments: [...installments, { id: uid('installment'), dueDate: todayIso(), amount: installments.length ? 0 : total }] })}><Plus className="h-4 w-4" /> افزودن قسط</Button>}</div>
        {installments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">برای این فاکتور برنامه اقساط ثبت نشده است.</div> : <div className="space-y-3">{installments.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[75px_minmax(0,1fr)_minmax(0,1fr)_40px] sm:items-end"><span className="pb-2 text-sm font-bold">{item.id === `installment-down-${form.id}` ? 'پیش‌پرداخت' : `قسط ${index + (installments[0]?.id === `installment-down-${form.id}` ? 0 : 1)}`}</span><label className="space-y-1 text-xs font-bold text-slate-600">تاریخ سررسید<JalaliDatePicker value={item.dueDate} onChange={(dueDate) => update({ installments: installments.map((entry) => entry.id === item.id ? { ...entry, dueDate } : entry) })} disabled={!editable} /></label><label className="space-y-1 text-xs font-bold text-slate-600">مبلغ<input type="number" min="0" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={item.amount} disabled={!editable} onChange={(event) => update({ installments: installments.map((entry) => entry.id === item.id ? { ...entry, amount: Number(event.target.value) } : entry) })} /></label>{editable && <Button variant="ghost" size="icon" aria-label={`حذف موعد ${index + 1}`} onClick={() => update({ installments: installments.filter((entry) => entry.id !== item.id) })}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}</div>)}</div>}
        <div className={`text-sm font-bold ${valid ? 'text-slate-600' : 'text-rose-600'}`}>جمع اقساط: {money(installmentTotal)} از {money(total)} {settings.currency}</div>
        {!editable && <p className="text-sm text-amber-700">برنامه این فاکتور پس از دریافت، تسویه یا ابطال فقط قابل مشاهده است.</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onBack}>بازگشت به فاکتور</Button>{editable && <Button onClick={save} disabled={!valid || saving}><Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیره برنامه'}</Button>}</div>
      </Panel>
    </>}
  </div>;
}
