'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus, ScanBarcode, ShoppingCart, Trash2 } from 'lucide-react';
import { AppNavbarContent } from '@/components/app-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAccountingNavigation } from '@/components/accounting-app';
import { useAccountingStore } from '@/lib/store';
import type { Invoice, Payment } from '@/lib/types';
import { invoiceTotal, money, uid } from '@/lib/utils';
import { todayIso } from '@/lib/standards';
import { notify } from '@/lib/feedback';

type CartLine = { productId: string; qty: number; discount: number };

export function QuickRetailSale() {
  const store = useAccountingStore();
  const navigation = useAccountingNavigation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const products = store.products.filter((product) => product.kind === 'product' && !product.archived);
  const customer = store.customers.find((item) => item.id === customerId);
  const matching = useMemo(() => products.filter((product) => `${product.name} ${product.code} ${product.sku || ''} ${product.barcode || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8), [products, query]);
  const priceFor = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return 0;
    const customerPrice = customerId ? product.customerPrices?.[customerId] : undefined;
    const groupPrice = customer?.priceGroup ? product.customerGroupPrices?.[customer.priceGroup] : undefined;
    return Number(customerPrice ?? groupPrice ?? product.salePrice);
  };
  const gross = cart.reduce((sum, line) => sum + priceFor(line.productId) * line.qty, 0);
  const discount = cart.reduce((sum, line) => sum + Math.min(priceFor(line.productId) * line.qty, line.discount), 0);
  const total = Math.max(0, gross - discount);

  const addProduct = (productId: string) => {
    setCart((previous) => {
      const found = previous.find((item) => item.productId === productId);
      return found ? previous.map((item) => item.productId === productId ? { ...item, qty: item.qty + 1 } : item) : [...previous, { productId, qty: 1, discount: 0 }];
    });
    setQuery('');
    searchRef.current?.focus();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = query.trim().toLowerCase();
    const exact = products.find((product) => [product.barcode, product.sku, product.code].some((value) => value?.trim().toLowerCase() === code));
    if (exact) addProduct(exact.id);
    else if (matching[0]) addProduct(matching[0].id);
    else notify('کالا با این بارکد یا جست‌وجو پیدا نشد.', 'warning');
  };

  const checkout = () => {
    if (!customer) return notify('برای ثبت فروش مشتری انتخاب کنید.', 'error');
    if (!cart.length) return notify('سبد فروش خالی است.', 'error');
    const lines = cart.map((line) => ({ line, product: products.find((item) => item.id === line.productId)! }));
    const shortage = lines.find(({ line, product }) => line.qty <= 0 || product.stock < line.qty);
    if (shortage) return notify(`موجودی ${shortage.product.name} کافی نیست؛ موجودی فعلی ${money(shortage.product.stock)} ${shortage.product.unit} است.`, 'error');
    const now = new Date().toISOString();
    const invoice: Invoice = {
      id: uid('invoice'), number: store.reserveDocumentNumber('sale'), businessProfileId: store.settings.defaultBusinessProfileId,
      templateId: store.settings.defaultInvoiceTemplateId, paperSize: store.settings.defaultInvoicePaperSize,
      kind: 'sale', status: 'draft', date: todayIso(), customerId: customer.id, customerName: customer.name,
      customerPhone: customer.phone, customerAddress: customer.address, customerNationalId: customer.nationalId,
      customerEconomicCode: customer.economicCode, customerPostalCode: customer.postalCode,
      items: lines.map(({ line, product }) => ({ id: uid('line'), productId: product.id, description: product.name, unit: product.unit, qty: line.qty, unitPrice: priceFor(product.id), discount: Math.min(priceFor(product.id) * line.qty, line.discount) })),
      discount: 0, tax: 0, shipping: 0, notes: 'ثبت‌شده از فروش سریع', createdAt: now, updatedAt: now,
    };
    const expectedTotal = invoiceTotal(invoice);
    const received = Number(amountReceived || 0);
    if (!Number.isFinite(received) || received < 0 || received > expectedTotal) return notify('مبلغ دریافتی باید بین صفر و مبلغ فاکتور باشد.', 'error');
    setBusy(true);
    try {
      const finalized = store.finalizeInvoice(invoice);
      if (!finalized.ok || !finalized.invoice) return notify(finalized.message || 'ثبت فروش انجام نشد.', 'error');
      if (received > 0) {
        const payment: Payment = {
          id: uid('payment'), documentNumber: store.reserveDocumentNumber('receipt'), invoiceId: finalized.invoice.id,
          customerId: customer.id, direction: 'receipt', method: 'cash', amount: received, date: todayIso(), notes: 'دریافت هنگام فروش سریع',
        };
        const paid = store.addPayment(payment);
        if (!paid.ok) return notify(`فاکتور قطعی و موجودی به‌روز شد، اما دریافت ثبت نشد: ${paid.message || 'خطای دریافت'}`, 'error');
      }
      notify(received >= expectedTotal ? 'فروش و دریافت کامل ثبت شد.' : received > 0 ? 'فروش و دریافت جزئی ثبت شد.' : 'فروش با مانده دریافتنی ثبت شد.', 'success');
      setCart([]); setAmountReceived('');
      navigation.viewInvoice(finalized.invoice.id, 'sale');
    } finally { setBusy(false); }
  };

  return <div className="space-y-5" dir="rtl">
    <AppNavbarContent title="فروش سریع کالا" subtitle="بارکد را اسکن کنید یا نام کالا را جست‌وجو کنید؛ ثبت نهایی به همان فاکتور، کاردکس و حسابداری فروش متصل است." />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ScanBarcode className="h-5 w-5 text-sky-600" />جست‌وجو / بارکد</CardTitle></CardHeader><CardContent className="space-y-3"><Input ref={searchRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="اسکن بارکد یا جست‌وجوی نام، SKU و کد" dir="auto" />{query && <div className="divide-y rounded-xl border border-slate-200">{matching.map((product) => <button key={product.id} onClick={() => addProduct(product.id)} className="flex w-full items-center justify-between gap-3 p-3 text-right hover:bg-slate-50"><span><b>{product.name}</b><span className="mr-2 text-xs text-slate-400">{product.sku || product.barcode || product.code}</span></span><span className="text-left text-xs text-slate-500">{money(priceFor(product.id))} · موجودی {money(product.stock)}</span></button>)}{!matching.length && <div className="p-4 text-sm text-slate-400">کالایی پیدا نشد.</div>}</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-sky-600" />سبد فروش <span className="text-xs font-normal text-slate-400">{cart.length} قلم</span></CardTitle></CardHeader><CardContent className="space-y-3">{cart.map((line) => { const product = products.find((item) => item.id === line.productId); if (!product) return null; return <div key={line.productId} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto_auto]"><div className="min-w-0"><b className="block truncate text-sm">{product.name}</b><span className="text-xs text-slate-500">{money(priceFor(product.id))} {store.settings.currency} · موجودی {money(product.stock)} {product.unit}</span></div><div className="flex items-center gap-1"><Button size="icon" variant="outline" onClick={() => setCart((items) => items.map((item) => item.productId === product.id ? { ...item, qty: Math.max(1, item.qty - 1) } : item))}><Minus className="h-3.5 w-3.5" /></Button><Input aria-label={`تعداد ${product.name}`} className="h-9 w-16 px-2 text-center" type="number" min="1" step="any" value={line.qty} onChange={(event) => setCart((items) => items.map((item) => item.productId === product.id ? { ...item, qty: Number(event.target.value) } : item))} /><Button size="icon" variant="outline" onClick={() => setCart((items) => items.map((item) => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item))}><Plus className="h-3.5 w-3.5" /></Button></div><label className="flex items-center gap-2 text-xs text-slate-500">تخفیف<Input className="h-9 w-28 px-2" type="number" min="0" max={priceFor(product.id) * line.qty} value={line.discount} onChange={(event) => setCart((items) => items.map((item) => item.productId === product.id ? { ...item, discount: Number(event.target.value) } : item))} /></label><Button size="icon" variant="ghost" className="text-rose-600" title="حذف از سبد" onClick={() => setCart((items) => items.filter((item) => item.productId !== product.id))}><Trash2 className="h-4 w-4" /></Button></div>; })}{!cart.length && <div className="py-8 text-center text-sm text-slate-400">با جست‌وجو یا اسکن بارکد کالا را به سبد اضافه کنید.</div>}</CardContent></Card>
      </div>
      <Card className="h-fit"><CardHeader><CardTitle>مشتری و دریافت</CardTitle></CardHeader><CardContent className="space-y-4"><label className="space-y-1 text-xs font-bold text-slate-600">مشتری<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">انتخاب مشتری</option>{store.customers.filter((item) => item.kind !== 'supplier' && item.status !== 'archived').map((item) => <option key={item.id} value={item.id}>{item.name}{item.priceGroup ? ` · ${item.priceGroup}` : ''}</option>)}</select></label><div className="rounded-2xl bg-slate-50 p-4"><div className="flex justify-between text-sm"><span>ناخالص</span><span>{money(gross)} {store.settings.currency}</span></div><div className="mt-2 flex justify-between text-sm"><span>تخفیف</span><span>{money(discount)} {store.settings.currency}</span></div><div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-black"><span>جمع فروش</span><span>{money(total)} {store.settings.currency}</span></div></div><label className="space-y-1 text-xs font-bold text-slate-600">دریافت نقدی هنگام فروش (اختیاری)<Input type="number" min="0" max={total} value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} placeholder={money(total)} /></label><div className="text-xs leading-5 text-slate-500">موجودی قبل از قطعی‌شدن بررسی می‌شود. دریافت کمتر از کل، مانده فاکتور را باز می‌گذارد تا بعداً تسویه شود.</div><Button className="w-full" disabled={busy || !cart.length || !customer} onClick={checkout}>ثبت فروش نهایی</Button></CardContent></Card>
    </div>
  </div>;
}
