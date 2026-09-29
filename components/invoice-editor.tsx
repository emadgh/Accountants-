'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, CheckCircle2, Copy, Eye, History, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { BusinessProfile, Invoice, InvoiceItem, InvoiceKind } from '@/lib/types';
import { invoiceTotal, money, uid } from '@/lib/utils';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { PersianDateInput } from '@/components/persian-date-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function blankInvoice(kind: InvoiceKind, customerName = '', number = '', businessProfileId = ''): Invoice {
  const now = new Date().toISOString();
  return {
    id: uid('inv'),
    number,
    businessProfileId,
    kind,
    status: 'draft',
    date: todayIso(),
    customerId: '', customerName, customerPhone: '', customerAddress: '', customerNationalId: '', customerEconomicCode: '', customerPostalCode: '',
    items: [{ id: uid('row'), description: '', details: '', unit: 'عدد', qty: 1, unitPrice: 0 }],
    discount: 0, tax: 0, shipping: 0, notes: '', createdAt: now, updatedAt: now,
  };
}

export function InvoiceEditor({ kind, invoiceId, onBack }: { kind: InvoiceKind; invoiceId?: string | null; onBack?: () => void }) {
  const { invoices, customers, products, settings, upsertBusinessProfile, reserveDocumentNumber, saveInvoiceDraft, finalizeInvoice, reviseInvoice, voidInvoice } = useAccountingStore();
  const existing = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const [invoice, setInvoice] = useState<Invoice>(() => existing ? structuredClone(existing) : blankInvoice(kind));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (existing) {
      setInvoice(structuredClone(existing));
      return;
    }
    setInvoice(blankInvoice(kind, '', reserveDocumentNumber(kind), settings.defaultBusinessProfileId));
  }, [existing?.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = invoice.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0);
  const total = invoiceTotal(invoice);
  const customer = customers.find((c) => c.id === invoice.customerId);
  const businessProfile = settings.businessProfiles.find((profile) => profile.id === invoice.businessProfileId)
    || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
    || settings.businessProfiles[0];
  const updateBusinessProfile = (values: Partial<BusinessProfile>) => {
    if (!businessProfile) return;
    const result = upsertBusinessProfile({ ...businessProfile, ...values });
    if (!result.ok) window.alert(result.message || 'ذخیره پروفایل انجام نشد.');
  };
  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';
  const isPosted = !isDraft && !isVoid;
  const isDirty = !!existing && invoiceEditableSignature(existing) !== invoiceEditableSignature(invoice);
  const statusLabel = invoice.status === 'draft' ? 'پیش‌نویس' : invoice.status === 'partial' ? 'بخشی تسویه' : invoice.status === 'settled' ? 'تسویه‌شده' : invoice.status === 'void' ? 'باطل' : 'قطعی';
  const statusClass = invoice.status === 'draft' ? '' : invoice.status === 'void' ? 'bg-rose-50 text-rose-700' : invoice.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

  const patch = <K extends keyof Invoice>(key: K, value: Invoice[K]) => setInvoice((x) => ({ ...x, [key]: value, updatedAt: new Date().toISOString() }));
  const patchItem = (id: string, values: Partial<InvoiceItem>) => setInvoice((x) => ({ ...x, items: x.items.map((item) => item.id === id ? { ...item, ...values } : item), updatedAt: new Date().toISOString() }));

  const chooseCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (!c) return patch('customerId', '');
    setInvoice((x) => ({ ...x, customerId: c.id, customerName: c.name, customerPhone: c.phone, customerAddress: c.address, customerNationalId: c.nationalId, customerEconomicCode: c.economicCode, customerPostalCode: c.postalCode }));
  };

  const chooseProduct = (rowId: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return patchItem(rowId, { productId: undefined });
    patchItem(rowId, { productId: p.id, description: p.name, unit: p.unit, unitPrice: invoice.kind === 'sale' ? p.salePrice : p.buyPrice });
  };

  const showSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const persist = () => {
    if (isVoid) return null;

    if (isDraft) {
      const result = saveInvoiceDraft(invoice);
      if (!result.ok || !result.invoice) {
        window.alert(result.message || 'ذخیره فاکتور انجام نشد.');
        return null;
      }
      setInvoice(structuredClone(result.invoice));
      showSaved();
      return result.invoice;
    }

    if (!isDirty) {
      window.alert('تغییری برای ثبت Revision وجود ندارد.');
      return existing || invoice;
    }

    const reason = window.prompt('دلیل ویرایش سند قطعی را وارد کنید:');
    if (!reason?.trim()) return null;
    const result = reviseInvoice(invoice, reason);
    if (!result.ok || !result.invoice) {
      window.alert(result.message || 'ثبت Revision انجام نشد.');
      return null;
    }
    setInvoice(structuredClone(result.invoice));
    showSaved();
    return result.invoice;
  };

  const previewPrint = () => {
    window.setTimeout(() => window.print(), 50);
  };

  const print = () => {
    if (isVoid) {
      window.print();
      return;
    }

    if (isDraft) {
      const result = finalizeInvoice(invoice);
      if (!result.ok || !result.invoice) {
        window.alert(result.message || 'ثبت نهایی فاکتور انجام نشد.');
        return;
      }
      setInvoice(structuredClone(result.invoice));
      window.setTimeout(() => window.print(), 120);
      return;
    }

    if (isDirty && !persist()) return;
    window.setTimeout(() => window.print(), 80);
  };

  const voidCurrent = () => {
    if (!isPosted) return;
    const reason = window.prompt('دلیل ابطال فاکتور را وارد کنید:');
    if (!reason?.trim()) return;
    const result = voidInvoice(invoice.id, reason);
    if (!result.ok || !result.invoice) {
      window.alert(result.message || 'ابطال فاکتور انجام نشد.');
      return;
    }
    setInvoice(structuredClone(result.invoice));
  };

  const duplicate = () => {
    const now = new Date().toISOString();
    setInvoice({
      ...invoice,
      id: uid('inv'),
      number: reserveDocumentNumber(invoice.kind),
      status: 'draft',
      date: todayIso(),
      revision: 0,
      finalizedAt: undefined,
      voidedAt: undefined,
      voidReason: undefined,
      auditTrail: [],
      createdAt: now,
      updatedAt: now,
    });
  };

  return <div className="space-y-4">
    <div className="screen-only sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack}><ArrowRight className="h-4 w-4" /></Button>}
        <div><div className="font-black">{invoice.kind === 'sale' ? 'ویرایش فاکتور فروش' : 'ویرایش فاکتور خرید'}</div><div className="mt-0.5 text-xs text-slate-400">همین فرم نسخه قابل چاپ فاکتور است.</div></div>
        <Badge className={statusClass}>{statusLabel}{(invoice.revision || 0) > 1 ? ` · R${invoice.revision}` : ''}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {savedFlash && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> ذخیره شد</span>}
        <Button variant="outline" size="sm" onClick={duplicate}><Copy className="h-4 w-4" /> کپی فاکتور</Button>
        {!isVoid && <Button variant="outline" size="sm" onClick={persist}><Save className="h-4 w-4" /> {isDraft ? 'ذخیره پیش‌نویس' : 'ثبت Revision'}</Button>}
        {isPosted && <Button variant="danger" size="sm" onClick={voidCurrent}><Ban className="h-4 w-4" /> ابطال</Button>}
        <Button variant="outline" size="sm" onClick={previewPrint}><Eye className="h-4 w-4" /> پیش‌نمایش چاپ</Button>
        <Button size="sm" onClick={print}><Printer className="h-4 w-4" /> {isDraft ? 'ثبت نهایی و چاپ' : isVoid ? 'چاپ نسخه باطل' : 'چاپ'}</Button>
      </div>
    </div>

    <div className="print-surface invoice-paper relative">
      {isDraft && <div className="print-only print-watermark text-slate-500">پیش‌نویس</div>}
      {isVoid && <div className="print-only print-watermark text-rose-500">باطل</div>}
      {isVoid && <div className="screen-only mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">این فاکتور باطل شده است.{invoice.voidReason ? ` دلیل: ${invoice.voidReason}` : ''}</div>}
      <fieldset disabled={isVoid} className="contents">
      <header className="invoice-party-block mb-3">
        <div className="screen-only mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2">
          <div><div className="text-xs font-black text-sky-800">پروفایل صادرکننده</div><div className="text-[10px] text-slate-500">این انتخاب روی خود فاکتور ذخیره می‌شود.</div></div>
          <select className="h-9 min-w-[220px] rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold" value={invoice.businessProfileId} onChange={(e) => patch('businessProfileId', e.target.value)}>
            {settings.businessProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}{profile.id === settings.defaultBusinessProfileId ? ' — پیش‌فرض' : ''}</option>)}
          </select>
        </div>
        <EditableText value={invoice.kind === 'sale' ? (businessProfile?.invoiceTitle || 'فاکتور فروش') : 'فاکتور خرید'} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="mx-auto max-w-[320px] text-center text-[22px] font-black" readOnly={invoice.kind === 'purchase'} />
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] leading-7 sm:grid-cols-[.85fr_1.55fr]">
          <div className="order-2 sm:order-1">
            <div className="print-only print-block text-[10px] leading-6 text-slate-600">
              <div><b>شناسه ملی:</b> {businessProfile?.nationalId || '—'}</div>
              <div><b>کد اقتصادی:</b> {businessProfile?.economicCode || '—'}</div>
              <div><b>کدپستی:</b> {businessProfile?.postalCode || '—'}</div>
            </div>
            <div className="screen-only grid gap-1">
              <MiniEdit placeholder="شناسه ملی فروشنده" value={businessProfile?.nationalId || ''} onChange={(v) => updateBusinessProfile({ nationalId: v })} />
              <MiniEdit placeholder="کد اقتصادی فروشنده" value={businessProfile?.economicCode || ''} onChange={(v) => updateBusinessProfile({ economicCode: v })} />
              <MiniEdit placeholder="کدپستی فروشنده" value={businessProfile?.postalCode || ''} onChange={(v) => updateBusinessProfile({ postalCode: v })} />
            </div>
          </div>
          <div className="order-1 sm:order-2">
            <InfoLine label="فروشنده" value={businessProfile?.businessName || ''} onChange={(v) => updateBusinessProfile({ businessName: v })} />
            <InfoLine label="تلفن" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} />
            <InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} />
          </div>
        </div>
      </header>

      <div className="invoice-party-block mb-2 border-t-2 border-slate-700 pt-2">
        <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><span className="shrink-0 font-bold">طرف حساب:</span>
              <select className="screen-editor invoice-inline-select font-bold" value={invoice.customerId} onChange={(e) => chooseCustomer(e.target.value)}>
                <option value="">انتخاب / ورود دستی</option>{customers.filter((c) => invoice.kind === 'sale' ? c.kind !== 'supplier' : c.kind !== 'customer').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select><span className="print-only font-bold">{invoice.customerName || '—'}</span>
              {!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}
            </div>
            <InfoLine label="تلفن" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} />
            <InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} />
            {(invoice.customerNationalId || invoice.customerEconomicCode || invoice.customerPostalCode) && <div className="print-block text-[10px] text-slate-500">شناسه ملی: {invoice.customerNationalId || '—'} &nbsp; کد اقتصادی: {invoice.customerEconomicCode || '—'} &nbsp; کدپستی: {invoice.customerPostalCode || '—'}</div>}
            <div className="screen-only grid grid-cols-3 gap-1 pt-1">
              <MiniEdit placeholder="شناسه ملی" value={invoice.customerNationalId || ''} onChange={(v) => patch('customerNationalId', v)} />
              <MiniEdit placeholder="کد اقتصادی" value={invoice.customerEconomicCode || ''} onChange={(v) => patch('customerEconomicCode', v)} />
              <MiniEdit placeholder="کدپستی" value={invoice.customerPostalCode || ''} onChange={(v) => patch('customerPostalCode', v)} />
            </div>
          </div>
          <div className="space-y-1 sm:text-left">
            <InfoLine label="شماره" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="screen-only flex items-center gap-2 sm:justify-end"><span className="font-bold">تاریخ:</span><PersianDateInput value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></div>
            <div className="print-only"><b>تاریخ:</b> {formatPersianDate(invoice.date)}</div>
            <div className="flex gap-1 text-[10px] text-slate-500 sm:justify-end"><span>{customer?.code ? `کد شخص: ${customer.code}` : ''}</span></div>
          </div>
        </div>
      </div>

      <table className="invoice-grid-table mt-2">
        <colgroup><col style={{ width: '7%' }} /><col style={{ width: '38%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '16%' }} /><col style={{ width: '18%' }} /></colgroup>
        <thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>مقدار</th><th>واحد</th><th>قیمت واحد</th><th>مبلغ کل</th><th className="screen-only !w-8"></th></tr></thead>
        <tbody>{invoice.items.map((item, index) => <tr key={item.id}>
          <td className="text-center font-bold">{index + 1}</td>
          <td>
            <select className="screen-editor invoice-inline-select desc" value={item.productId || ''} onChange={(e) => chooseProduct(item.id, e.target.value)}><option value="">شرح دستی...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <span className="print-only desc">{item.description || '—'}</span>
            {!item.productId && <input className="screen-editor invoice-inline-input desc" placeholder="شرح کالا یا خدمت" value={item.description} onChange={(e) => patchItem(item.id, { description: e.target.value })} />}
            <textarea className="screen-editor invoice-inline-textarea detail" placeholder="توضیحات ردیف..." value={item.details || ''} onChange={(e) => patchItem(item.id, { details: e.target.value })} />
            {!!item.details && <div className="print-only print-block detail">{item.details}</div>}
          </td>
          <td><NumberEdit value={item.qty} onChange={(v) => patchItem(item.id, { qty: v })} /></td>
          <td><EditableText value={item.unit} onChange={(v) => patchItem(item.id, { unit: v })} className="text-center" /></td>
          <td><NumberEdit value={item.unitPrice} onChange={(v) => patchItem(item.id, { unitPrice: v })} formatted /></td>
          <td className="text-left font-bold" dir="ltr">{money(item.qty * item.unitPrice)}</td>
          <td className="screen-only"><button aria-label="حذف ردیف" className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" onClick={() => patch('items', invoice.items.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4" /></button></td>
        </tr>)}</tbody>
      </table>
      <div className="screen-only mt-2"><Button variant="outline" size="sm" onClick={() => patch('items', [...invoice.items, { id: uid('row'), description: '', details: '', unit: 'عدد', qty: 1, unitPrice: 0 }])}><Plus className="h-4 w-4" /> افزودن ردیف</Button></div>

      <div className="invoice-summary-block mt-4 grid grid-cols-1 gap-6 border-t border-blue-200 pt-3 sm:grid-cols-2">
        <div className="order-2 text-[12px] sm:order-1">
          <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="توضیحات فاکتور..." />
        </div>
        <div className="order-1 space-y-1 text-[12px] sm:order-2">
          <AmountLine label="جمع جزء" value={subtotal} fixed />
          <AmountLine label="تخفیف" value={invoice.discount} onChange={(v) => patch('discount', v)} />
          <AmountLine label="مالیات / عوارض" value={invoice.tax} onChange={(v) => patch('tax', v)} />
          <AmountLine label="هزینه حمل" value={invoice.shipping} onChange={(v) => patch('shipping', v)} />
          <div className="mt-2 flex items-center justify-between border-t border-sky-200 pt-3 text-sky-700"><span className="text-[14px] font-black">مبلغ فاکتور:</span><span className="text-[16px] font-black" dir="ltr">{money(total)} <small className="text-[11px]">{settings.currency}</small></span></div>
        </div>
      </div>

      <div className="invoice-payment-block mt-8 grid grid-cols-2 gap-8 text-[12px]">
        <div className="leading-7">
          <div className="font-bold">اطلاعات پرداخت:</div>
          <InfoLine label="شماره کارت" value={businessProfile?.cardNumber || ''} onChange={(v) => updateBusinessProfile({ cardNumber: v })} />
          <InfoLine label="شبا" value={businessProfile?.iban || ''} onChange={(v) => updateBusinessProfile({ iban: v })} />
          <InfoLine label="به نام" value={businessProfile?.ownerName || ''} onChange={(v) => updateBusinessProfile({ ownerName: v })} />
        </div>
        <div className="text-slate-500"><EditableArea value={businessProfile?.footer || ''} onChange={(v) => updateBusinessProfile({ footer: v })} placeholder="پاورقی فاکتور..." /></div>
      </div>

      <div className="invoice-signatures mt-20 grid grid-cols-2 text-center text-[12px]"><div><div className="mx-auto mb-12 h-px w-24 border-t border-dashed border-slate-300"></div>امضاء فروشنده</div><div><div className="mx-auto mb-12 h-px w-24 border-t border-dashed border-slate-300"></div>امضاء خریدار</div></div>
      </fieldset>
    </div>

    {!!invoice.auditTrail?.length && <div className="screen-only rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-black text-slate-800"><History className="h-4 w-4 text-sky-600" /> تاریخچه سند</div>
      <div className="space-y-2">
        {[...invoice.auditTrail].reverse().map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
          <div><span className="font-bold">{auditActionLabel(entry.action)}</span>{entry.note ? <span className="mr-2 text-slate-500">— {entry.note}</span> : null}</div>
          <div className="text-slate-400">Revision {entry.revision} · {new Date(entry.at).toLocaleString('fa-IR')}</div>
        </div>)}
      </div>
    </div>}
  </div>;
}

function EditableText({ value, onChange, className = '', readOnly = false }: { value: string; onChange: (v: string) => void; className?: string; readOnly?: boolean }) {
  return <><input readOnly={readOnly} className={`screen-editor invoice-inline-input ${className}`} value={value} onChange={(e) => onChange(e.target.value)} /><span className={`print-only ${className}`}>{value || '—'}</span></>;
}
function EditableArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <><textarea className="screen-editor invoice-inline-textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /><div className="print-only print-block whitespace-pre-wrap leading-6">{value}</div></>;
}
function MiniEdit({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) { return <input className="invoice-inline-input !border-slate-200 text-[10px]" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />; }
function NumberEdit({ value, onChange, formatted = false }: { value: number; onChange: (v: number) => void; formatted?: boolean }) {
  return <><input dir="ltr" type="number" min="0" className="screen-editor invoice-inline-input text-center" value={value} onChange={(e) => onChange(Number(e.target.value))} /><span className="print-only" dir="ltr">{formatted ? money(value) : value}</span></>;
}
function InfoLine({ label, value, onChange, readOnly = false }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) { return <div className="flex min-h-7 items-center gap-1"><span className="shrink-0 font-bold">{label}:</span><EditableText value={value} onChange={onChange} readOnly={readOnly} /></div>; }
function AmountLine({ label, value, onChange, fixed }: { label: string; value: number; onChange?: (v: number) => void; fixed?: boolean }) { return <div className="flex min-h-8 items-center justify-between gap-4"><span className="font-bold text-slate-600">{label}</span>{fixed ? <span className="font-bold" dir="ltr">{money(value)}</span> : <div className="w-36"><NumberEdit value={value} onChange={onChange!} formatted /></div>}</div>; }


function invoiceEditableSignature(invoice: Invoice) {
  return JSON.stringify({
    number: invoice.number,
    businessProfileId: invoice.businessProfileId,
    date: invoice.date,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    customerAddress: invoice.customerAddress,
    customerNationalId: invoice.customerNationalId || '',
    customerEconomicCode: invoice.customerEconomicCode || '',
    customerPostalCode: invoice.customerPostalCode || '',
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
    shipping: invoice.shipping,
    notes: invoice.notes,
  });
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    created: 'ایجاد پیش‌نویس',
    draft_saved: 'ذخیره پیش‌نویس',
    finalized: 'ثبت نهایی',
    revised: 'ویرایش سند قطعی',
    voided: 'ابطال سند',
  };
  return labels[action] || action;
}
