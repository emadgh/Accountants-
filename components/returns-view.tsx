'use client';

import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Edit3, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { Invoice, ReturnDocument, ReturnItem } from '@/lib/types';
import { money, returnDocumentAmount, returnedQuantityForItem, uid } from '@/lib/utils';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { PersianDateInput } from '@/components/persian-date-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { confirmDialog, notify, promptDialog } from '@/lib/feedback';

function blankReturn(invoice?: Invoice): ReturnDocument {
  const now = new Date().toISOString();
  const kind = invoice?.kind === 'purchase' ? 'purchase-return' : 'sale-return';
  return {
    id: uid('return'),
    number: (kind === 'sale-return' ? 'RS-' : 'RP-') + String(Date.now()).slice(-6),
    kind,
    status: 'draft',
    originalInvoiceId: invoice?.id || '',
    originalInvoiceNumber: invoice?.number || '',
    customerId: invoice?.customerId || '',
    customerName: invoice?.customerName || '',
    date: todayIso(),
    items: invoice?.items.map((item) => ({
      id: uid('retrow'),
      originalItemId: item.id,
      productId: item.productId,
      description: item.description,
      unit: item.unit,
      qty: 0,
      unitPrice: item.unitPrice,
    })) || [],
    totalAmount: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    auditTrail: [],
  };
}

export function ReturnsView() {
  const {
    invoices,
    returns,
    settings,
    saveReturnDraft,
    finalizeReturn,
    voidReturn,
    deleteReturn,
  } = useAccountingStore();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReturnDocument>(() => blankReturn());
  const [filter, setFilter] = useState<'all' | 'sale-return' | 'purchase-return'>('all');

  const eligibleInvoices = invoices.filter(
    (invoice) => invoice.status !== 'draft' && invoice.status !== 'void'
  );
  const visible = returns.filter((document) => filter === 'all' || document.kind === filter);
  const original = useMemo(
    () => invoices.find((invoice) => invoice.id === draft.originalInvoiceId),
    [invoices, draft.originalInvoiceId]
  );
  const previewAmount = original ? returnDocumentAmount(original, draft.items) : 0;

  const startNew = () => {
    const invoice = eligibleInvoices[0];
    setDraft(blankReturn(invoice));
    setOpen(true);
  };

  const editDraft = (document: ReturnDocument) => {
    setDraft(structuredClone(document));
    setOpen(true);
  };

  const selectInvoice = (invoiceId: string) => {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      setDraft(blankReturn());
      return;
    }
    const currentNumber = draft.number || undefined;
    const next = blankReturn(invoice);
    if (currentNumber) next.number = currentNumber;
    setDraft(next);
  };

  const patchQty = (originalItemId: string, value: number) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.originalItemId === originalItemId ? { ...item, qty: Math.max(0, Number(value || 0)) } : item
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const saveDraft = () => {
    const result = saveReturnDraft(draft);
    if (!result.ok || !result.returnDocument) {
      notify(result.message || 'ذخیره پیش‌نویس مرجوعی انجام نشد.', 'error');
      return;
    }
    setDraft(structuredClone(result.returnDocument));
    setOpen(false);
  };

  const finalize = () => {
    const result = finalizeReturn(draft);
    if (!result.ok || !result.returnDocument) {
      notify(result.message || 'ثبت نهایی مرجوعی انجام نشد.', 'error');
      return;
    }
    setDraft(structuredClone(result.returnDocument));
    setOpen(false);
  };

  const voidDocument = async (document: ReturnDocument) => {
    const reason = await promptDialog('دلیل ابطال سند مرجوعی را وارد کنید:', { title: 'ابطال مرجوعی', confirmLabel: 'ابطال سند', danger: true, placeholder: 'دلیل ابطال...' });
    if (!reason?.trim()) return;
    const result = voidReturn(document.id, reason);
    if (!result.ok) notify(result.message || 'ابطال مرجوعی انجام نشد.', 'error');
  };

  const removeDraft = async (document: ReturnDocument) => {
    if (!(await confirmDialog('پیش‌نویس مرجوعی حذف شود؟', { title: 'حذف پیش‌نویس مرجوعی', confirmLabel: 'حذف', danger: true }))) return;
    const result = deleteReturn(document.id);
    if (!result.ok) notify(result.message || 'حذف پیش‌نویس انجام نشد.', 'error');
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-slate-950">مرجوعی فروش و خرید</h1>
        <p className="mt-1 text-sm text-slate-500">سند مستقل و قابل ردیابی با ارجاع به فاکتور اصلی؛ مرجوعی جزئی و کامل پشتیبانی می‌شود.</p>
      </div>
      <Button disabled={!eligibleInvoices.length} onClick={startNew}><Plus className="h-4 w-4" /> مرجوعی جدید</Button>
    </div>

    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>اسناد مرجوعی</CardTitle>
        <div className="flex gap-2">
          {[
            ['all', 'همه'],
            ['sale-return', 'مرجوعی فروش'],
            ['purchase-return', 'مرجوعی خرید'],
          ].map(([key, label]) => <Button key={key} variant={filter === key ? 'default' : 'outline'} size="sm" onClick={() => setFilter(key as typeof filter)}>{label}</Button>)}
        </div>
      </CardHeader>
      <div className="table-wrap"><table className="data-table min-w-[900px]">
        <thead><tr><th>شماره</th><th>نوع</th><th>فاکتور اصلی</th><th>طرف حساب</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>
          {visible.map((document) => <tr key={document.id}>
            <td className="font-black">{document.number}</td>
            <td>{document.kind === 'sale-return' ? 'مرجوعی فروش' : 'مرجوعی خرید'}</td>
            <td>{document.originalInvoiceNumber}</td>
            <td className="font-bold">{document.customerName}</td>
            <td>{formatPersianDate(document.date)}</td>
            <td className="font-black">{money(document.totalAmount)} {settings.currency}</td>
            <td><ReturnStatusBadge document={document} /></td>
            <td><div className="flex gap-1">
              {document.status === 'draft' && <Button variant="ghost" size="icon" onClick={() => editDraft(document)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button>}
              {document.status === 'draft' && <Button variant="ghost" size="icon" className="text-rose-600" onClick={() => removeDraft(document)} title="حذف پیش‌نویس"><Trash2 className="h-4 w-4" /></Button>}
              {document.status === 'final' && <Button variant="danger" size="sm" onClick={() => voidDocument(document)}><Ban className="h-4 w-4" /> ابطال</Button>}
            </div></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={8} className="!py-14 text-center text-slate-400">سند مرجوعی ثبت نشده است.</td></tr>}
        </tbody>
      </table></div>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black">{draft.kind === 'sale-return' ? 'مرجوعی فروش' : 'مرجوعی خرید'}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">فقط مقدار کالا/خدمت برگشتی را وارد کنید. مبلغ مالی مرجوعی با نسبت مبلغ خالص فاکتور اصلی محاسبه می‌شود.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="فاکتور اصلی">
            <select disabled={draft.status !== 'draft' && !!draft.originalInvoiceId} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={draft.originalInvoiceId} onChange={(e) => selectInvoice(e.target.value)}>
              <option value="">انتخاب...</option>
              {eligibleInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.kind === 'sale' ? 'فروش' : 'خرید'} {invoice.number} — {invoice.customerName}</option>)}
            </select>
          </Field>
          <Field label="شماره سند"><Input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></Field>
          <Field label="تاریخ"><PersianDateInput value={draft.date} onChange={(date) => setDraft({ ...draft, date })} /></Field>
          <Field label="طرف حساب"><Input readOnly className="bg-slate-100" value={original?.customerName || draft.customerName} /></Field>
        </div>

        {original ? <div className="max-h-[46vh] overflow-auto rounded-xl border border-slate-200">
          <table className="data-table min-w-[780px]">
            <thead><tr><th>شرح</th><th>مقدار فاکتور</th><th>قبلاً مرجوع</th><th>قابل مرجوعی</th><th>مقدار این سند</th><th>قیمت واحد</th></tr></thead>
            <tbody>
              {draft.items.map((item) => {
                const source = original.items.find((sourceItem) => sourceItem.id === item.originalItemId);
                if (!source) return null;
                const already = returnedQuantityForItem(source.id, returns, draft.id);
                const remaining = Math.max(0, Number(source.qty || 0) - already);
                return <tr key={item.id}>
                  <td className="font-bold">{source.description}</td>
                  <td>{money(source.qty)} {source.unit}</td>
                  <td>{money(already)}</td>
                  <td className="font-bold">{money(remaining)}</td>
                  <td><Input className="w-28" type="number" min="0" max={remaining} step="any" value={item.qty} onChange={(e) => patchQty(item.originalItemId, Number(e.target.value))} /></td>
                  <td>{money(source.unitPrice)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div> : <div className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">ابتدا فاکتور اصلی را انتخاب کنید.</div>}

        <div className="grid gap-3 md:grid-cols-[1fr_.45fr]">
          <Field label="توضیحات"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="علت مرجوعی، شماره حواله یا توضیحات..." /></Field>
          <Card className="shadow-none"><CardContent>
            <div className="text-xs font-bold text-slate-500">مبلغ مرجوعی این سند</div>
            <div className="mt-2 text-xl font-black text-sky-700">{money(previewAmount)} <span className="text-xs">{settings.currency}</span></div>
            <div className="mt-2 text-[10px] leading-5 text-slate-400">تخفیف، مالیات و هزینه‌های سطح فاکتور به نسبت ارزش ردیف‌های برگشتی تخصیص داده می‌شوند.</div>
          </CardContent></Card>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
          <Button variant="outline" disabled={!original} onClick={saveDraft}><Save className="h-4 w-4" /> ذخیره پیش‌نویس</Button>
          <Button disabled={!original || !draft.items.some((item) => item.qty > 0)} onClick={finalize}><CheckCircle2 className="h-4 w-4" /> ثبت نهایی مرجوعی</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function ReturnStatusBadge({ document }: { document: ReturnDocument }) {
  if (document.status === 'void') return <Badge className="bg-rose-50 text-rose-700"><Ban className="ml-1 h-3 w-3" /> باطل</Badge>;
  if (document.status === 'final') return <Badge className="bg-emerald-50 text-emerald-700"><CheckCircle2 className="ml-1 h-3 w-3" /> قطعی</Badge>;
  return <Badge><RotateCcw className="ml-1 h-3 w-3" /> پیش‌نویس</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}
