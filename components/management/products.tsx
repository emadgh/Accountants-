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
import { Input } from '@/components/ui/input';
import { RecordDetailsDialog } from '@/components/ui/record-details-dialog';
import { UnsavedChangesBadge, useUnsavedDraft } from '@/components/ui/unsaved-changes';
import { confirmDialog, notify } from '@/lib/feedback';
import { flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { Product } from '@/lib/types';
import { money, uid } from '@/lib/utils';
import {
  Archive,
  Edit3, Eye,
  Plus,
  Trash2
} from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, PageHead, SearchBox } from './shared';
export function ProductsView() {
  const submission = useAsyncSubmission();
  const { products, customers, upsertProduct, deleteProduct, settings } = useAccountingStore(useShallow((state) => ({ products: state.products, customers: state.customers, upsertProduct: state.upsertProduct, deleteProduct: state.deleteProduct, settings: state.settings })));
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
            <td><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => setSelectedProduct(product)} title="نمایش جزئیات" aria-label={'نمایش جزئیات ' + product.name}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => startEdit(product)} title="ویرایش"><Edit3 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className={product.archived ? 'text-emerald-600' : 'text-amber-600'} onClick={() => { const result = upsertProduct({ ...product, archived: !product.archived }); if (!result.ok) notify(result.message || 'تغییر وضعیت کالا انجام نشد.', 'error'); }} title={product.archived ? 'فعال‌سازی' : 'آرشیو کردن'}><Archive className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={async () => { if (await confirmDialog('این مورد حذف شود؟', { title: 'حذف کالا / خدمت', confirmLabel: 'حذف', danger: true })) { const result = await persistOperation(() => deleteProduct(product.id)); if (!result.ok) notify(result.message || 'حذف کالا / خدمت انجام نشد.', 'error'); } }} title="حذف"><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>)}
          {!list.length && <EmptyRow cols={9} text="کالا یا خدمتی پیدا نشد." />}
        </tbody>
      </DataTable></div>
    </Card>

    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else void closeProductForm(); }}>
      <DialogContent>
        <AccountingRecoveryNotice /><DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-lg font-black">تعریف کالا / خدمت</DialogTitle><UnsavedChangesBadge visible={productDraft.hasChanges(edit)} /></div><DialogDescription className="text-sm text-slate-500">موجودی اولیه فقط هنگام ایجاد کالا قابل ثبت است. بعد از آن هر تغییر موجودی در کاردکس ثبت می‌شود.</DialogDescription></DialogHeader>
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
          <div className="flex items-center justify-between gap-2 sm:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(edit.archived)} onChange={(event) => setEdit({ ...edit, archived: event.target.checked })} /> آرشیو شده</label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => void closeProductForm()}>انصراف</Button><Button disabled={submission.busy || !edit.name.trim()} onClick={() => submission.run(async () => { setFormError(''); const result = upsertProduct(edit); if (!result.ok) { setFormError(result.message || 'ذخیره کالا انجام نشد.'); return; } try { await flushAccountingPersistence(); } catch (error) { setFormError(error instanceof Error ? error.message : 'ذخیره کالا روی سرور انجام نشد. اطلاعات فرم حفظ شد.'); return; } productDraft.markClean(edit); setOpen(false); })}>ذخیره</Button></div></div>
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

