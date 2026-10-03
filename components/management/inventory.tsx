'use client';
import { AccountingRecoveryNotice } from '@/components/accounting-recovery-notice';
import { useAsyncSubmission } from '@/hooks/use-persisted-action';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { MetricCard } from '@/components/ui/metric-card';
import { useTableDensity } from '@/components/ui/table-density-context';
import { confirmDialog, notify } from '@/lib/feedback';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { InvoiceKind } from '@/lib/types';
import { money } from '@/lib/utils';
import {
  AlertTriangle, Archive,
  Boxes,
  Edit3,
  FileText,
  Plus
} from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, PageHead, SearchBox, stockMovementLabel } from './shared';
export function InventoryView({ onOpenInvoice }: { onOpenInvoice?: (invoiceId: string, kind: InvoiceKind) => void }) {
  const submission = useAsyncSubmission();
  const tableDensity = useTableDensity();
  const { products, stockMovements, addStockAdjustment, settings } = useAccountingStore(useShallow((state) => ({ products: state.products, stockMovements: state.stockMovements, addStockAdjustment: state.addStockAdjustment, settings: state.settings })));
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

  const submitAdjustment = () => submission.run(async () => {
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
    try { await flushAccountingPersistence(); } catch (error) { notify(error instanceof Error ? error.message : 'ذخیره انجام نشد؛ فرم حفظ شد.', 'error'); return; }
    setAdjustOpen(false);
  });

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
      <DialogContent className="w-full max-w-5xl" data-table-density={tableDensity}>
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">کاردکس {cardexProduct?.name || ''}</DialogTitle><DialogDescription className="text-sm text-slate-500">هر حرکت موجودی با منبع، مقدار ورود/خروج، مانده و میانگین موزون بعد از حرکت ثبت می‌شود.</DialogDescription></DialogHeader>
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
        <AccountingRecoveryNotice /><DialogHeader><DialogTitle className="text-lg font-black">شمارش / اصلاح موجودی</DialogTitle><DialogDescription className="text-sm text-slate-500">این عملیات موجودی قبلی را بازنویسی نمی‌کند؛ اختلاف به‌صورت یک StockMovement مستقل در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
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
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline" onClick={() => setAdjustOpen(false)}>انصراف</Button><Button disabled={submission.busy || !adjustProductId || !adjustNote.trim() || Math.abs(adjustmentDelta) < 0.0001 || projectedStock < -0.0001} onClick={submitAdjustment}>ثبت در کاردکس</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

