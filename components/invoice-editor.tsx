'use client';

import { DataTable } from '@/components/ui/data-table';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowDownToLine, Ban, CheckCircle2, Copy, Edit3, Eye, History, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { BusinessProfile, Invoice, InvoiceItem, InvoiceKind, InvoicePaperSize, InvoiceTemplateId } from '@/lib/types';
import { INVOICE_PAPER_SIZES, INVOICE_TEMPLATES } from '@/lib/invoice-templates';
import { buildCustomerLedger, invoiceLineDiscount, invoiceLineGross, invoiceLineNet, invoiceOutstandingAmount, invoiceTotal, money, numberToPersianWords, settledForInvoice, uid } from '@/lib/utils';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { confirmDialog, notify, promptDialog } from '@/lib/feedback';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormattedInput, formatCardNumber, formatIranIban, formatPostalCode, type TextInputFormat } from '@/components/ui/formatted-input';
import { InvoicePaymentDialog } from '@/components/invoice-payment-dialog';
import { InvoicePaymentHistoryButton } from '@/components/invoice-payment-history';
import { AppNavbarContent } from '@/components/app-navbar';

function blankInvoice(kind: InvoiceKind, customerName = '', number = '', businessProfileId = '', templateId: InvoiceTemplateId = 'classic', paperSize: InvoicePaperSize = 'A4'): Invoice {
  const now = new Date().toISOString();
  return {
    id: uid('inv'),
    number,
    businessProfileId,
    templateId,
    paperSize,
    kind,
    status: 'draft',
    date: todayIso(),
    customerId: '', customerName, customerPhone: '', customerAddress: '', customerNationalId: '', customerEconomicCode: '', customerPostalCode: '',
    items: [{ id: uid('row'), description: '', details: '', unit: 'عدد', qty: 1, unitPrice: 0, discount: 0 }],
    discount: 0, tax: 0, shipping: 0, notes: '', createdAt: now, updatedAt: now,
  };
}

function InvoiceAmount({ value, empty = false }: { value: number; empty?: boolean }) {
  return <span className="invoice-violet-amount" dir="ltr">{empty ? '' : money(value)}</span>;
}

export function InvoiceEditor({ kind, invoiceId, mode, onRequestEdit, onBack }: { kind: InvoiceKind; invoiceId?: string | null; mode: 'view' | 'edit'; onRequestEdit?: () => void; onBack?: () => void }) {
  const { invoices, customers, products, payments, checks, adjustments, returns, settings, upsertBusinessProfile, reserveDocumentNumber, saveInvoiceDraft, setInvoiceTemplate, setInvoicePaperSize, finalizeInvoice, reviseInvoice, voidInvoice } = useAccountingStore();
  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const [invoice, setInvoice] = useState<Invoice>(() => selectedInvoice ? structuredClone(selectedInvoice) : blankInvoice(kind, '', '', '', settings.defaultInvoiceTemplateId, settings.defaultInvoicePaperSize));
  const existing = useMemo(() => invoices.find((item) => item.id === invoice.id), [invoices, invoice.id]);
  const [savedFlash, setSavedFlash] = useState(false);
  const [paymentAction, setPaymentAction] = useState<{ documentNumber: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (selectedInvoice) {
      setInvoice(structuredClone(selectedInvoice));
      return;
    }
    setInvoice(blankInvoice(kind, '', reserveDocumentNumber(kind), settings.defaultBusinessProfileId, settings.defaultInvoiceTemplateId, settings.defaultInvoicePaperSize));
  }, [selectedInvoice?.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedInvoice && invoice.id === selectedInvoice.id && (mode === 'view' || selectedInvoice.status === 'settled' || selectedInvoice.status === 'void' || selectedInvoice.status !== invoice.status)) {
      setInvoice(structuredClone(selectedInvoice));
    }
  }, [selectedInvoice, invoice.id, invoice.status, mode]);

  const grossSubtotal = invoice.items.reduce((sum, item) => sum + invoiceLineGross(item), 0);
  const lineDiscountTotal = invoice.items.reduce((sum, item) => sum + invoiceLineDiscount(item), 0);
  const subtotal = invoice.items.reduce((sum, item) => sum + invoiceLineNet(item), 0);
  const total = invoiceTotal(invoice);
  const customer = customers.find((c) => c.id === invoice.customerId);
  const isOfficialTemplate = invoice.templateId === 'official';
  const isStorefrontTemplate = invoice.templateId === 'storefront';
  const isGreenBrandTemplate = invoice.templateId === 'green-brand';
  const paperSize: InvoicePaperSize = invoice.paperSize === 'A5' ? 'A5' : 'A4';
  const customerLedger = useMemo(
    () => customer ? buildCustomerLedger(customer, invoices, payments, checks, adjustments, returns) : [],
    [customer, invoices, payments, checks, adjustments, returns]
  );
  const invoiceLedgerIndex = customerLedger.findIndex((entry) => entry.invoiceId === invoice.id);
  const previousCustomerBalance = invoiceLedgerIndex >= 0
    ? customerLedger[invoiceLedgerIndex - 1]?.balance ?? 0
    : customerLedger[customerLedger.length - 1]?.balance ?? Number(customer?.openingBalance || 0);
  const businessProfile = settings.businessProfiles.find((profile) => profile.id === invoice.businessProfileId)
    || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
    || settings.businessProfiles[0];
  const invoiceTitle = invoice.kind === 'sale' ? (businessProfile?.invoiceTitle || 'فاکتور فروش') : 'فاکتور خرید';
  const currentStatus = existing?.status || invoice.status;
  const isDraft = currentStatus === 'draft';
  const isVoid = currentStatus === 'void';
  const isSettled = currentStatus === 'settled';
  const isPartial = currentStatus === 'partial';
  const isPosted = !isDraft && !isVoid;
  const canEdit = mode === 'edit' && !isVoid && !isSettled;
  const isReadOnly = mode === 'view' || isVoid || isSettled;
  const isDirty = !!existing && invoiceEditableSignature(existing) !== invoiceEditableSignature(invoice);
  const outstanding = existing ? invoiceOutstandingAmount(existing, payments, checks, returns) : 0;
  const settledAmount = existing ? settledForInvoice(existing, payments, checks) : 0;
  const greenInvoiceRemaining = isVoid ? 0 : existing ? outstanding : total;
  const greenBalanceToDate = previousCustomerBalance + (invoice.kind === 'sale' ? greenInvoiceRemaining : -greenInvoiceRemaining);
  const statusLabel = currentStatus === 'draft' ? 'پیش‌نویس' : currentStatus === 'partial' ? 'بخشی تسویه' : currentStatus === 'settled' ? 'تسویه‌شده' : currentStatus === 'void' ? 'باطل' : 'قطعی';
  const statusClass = currentStatus === 'draft' ? '' : currentStatus === 'void' ? 'bg-rose-50 text-rose-700' : currentStatus === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
  const startPayment = () => {
    const direction = invoice.kind === 'sale' ? 'receipt' : 'payment';
    setPaymentAction({ documentNumber: reserveDocumentNumber(direction) });
  };

  const updateBusinessProfile = (values: Partial<BusinessProfile>) => {
    if (!canEdit || isPartial) return;
    if (!businessProfile) return;
    const result = upsertBusinessProfile({ ...businessProfile, ...values });
    if (!result.ok) notify(result.message || 'ذخیره پروفایل انجام نشد.', 'error');
  };
  const customerOptions: SearchableOption[] = [
    { value: '', label: 'ورود دستی', description: 'نام و اطلاعات طرف حساب را دستی وارد کنید' },
    ...customers
      .filter((c) => (c.status !== 'archived' || c.id === invoice.customerId) && (invoice.kind === 'sale' ? c.kind !== 'supplier' : c.kind !== 'customer'))
      .map((c) => ({
        value: c.id,
        label: c.name,
        description: [c.code, c.phone].filter(Boolean).join(' · '),
        keywords: [c.code, c.phone, c.nationalId, c.economicCode].filter(Boolean).join(' '),
      })),
  ];
  const productOptions: SearchableOption[] = [
    { value: '', label: 'شرح دستی', description: 'ردیف بدون اتصال به کالا/خدمت' },
    ...products.map((p) => ({
      value: p.id,
      label: p.name,
      description: [p.code, p.kind === 'product' ? 'کالا' : 'خدمت', p.unit].join(' · '),
      keywords: [p.code, p.name, p.notes].filter(Boolean).join(' '),
    })),
  ];

  const patch = <K extends keyof Invoice>(key: K, value: Invoice[K]) => {
    if (!canEdit || (isPartial && key !== 'notes')) return;
    setInvoice((x) => ({ ...x, [key]: value, updatedAt: new Date().toISOString() }));
  };
  const patchItem = (id: string, values: Partial<InvoiceItem>) => {
    if (!canEdit || isPartial) return;
    setInvoice((x) => ({ ...x, items: x.items.map((item) => item.id === id ? { ...item, ...values } : item), updatedAt: new Date().toISOString() }));
  };
  const chooseTemplate = (templateId: InvoiceTemplateId) => {
    if (existing) {
      const result = setInvoiceTemplate(invoice.id, templateId);
      if (!result.ok) {
        notify(result.message || 'تغییر قالب فاکتور انجام نشد.', 'error');
        return;
      }
      setInvoice((current) => ({
        ...current,
        templateId,
        updatedAt: result.invoice?.updatedAt || new Date().toISOString(),
        auditTrail: result.invoice?.auditTrail || current.auditTrail,
      }));
      return;
    }
    setInvoice((current) => ({ ...current, templateId, updatedAt: new Date().toISOString() }));
  };

  const choosePaperSize = (paperSize: InvoicePaperSize) => {
    if (existing) {
      const result = setInvoicePaperSize(invoice.id, paperSize);
      if (!result.ok) {
        notify(result.message || 'تغییر اندازه کاغذ فاکتور انجام نشد.', 'error');
        return;
      }
      setInvoice((current) => ({
        ...current,
        paperSize,
        updatedAt: result.invoice?.updatedAt || new Date().toISOString(),
        auditTrail: result.invoice?.auditTrail || current.auditTrail,
      }));
      return;
    }
    setInvoice((current) => ({ ...current, paperSize, updatedAt: new Date().toISOString() }));
  };

  const chooseCustomer = (id: string) => {
    if (!canEdit || isPartial) return;
    const c = customers.find((x) => x.id === id);
    if (!c) return patch('customerId', '');
    setInvoice((x) => ({ ...x, customerId: c.id, customerName: c.name, customerPhone: c.phone, customerAddress: c.address, customerNationalId: c.nationalId, customerEconomicCode: c.economicCode, customerPostalCode: c.postalCode }));
  };

  const chooseProduct = (rowId: string, productId: string) => {
    if (!canEdit || isPartial) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return patchItem(rowId, { productId: undefined });
    patchItem(rowId, { productId: p.id, description: p.name, unit: p.unit, unitPrice: invoice.kind === 'sale' ? p.salePrice : p.buyPrice });
  };

  const showSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const persist = async () => {
    if (!canEdit) return null;
    if (isVoid) return null;

    if (isDraft) {
      const result = saveInvoiceDraft(invoice);
      if (!result.ok || !result.invoice) {
        notify(result.message || 'ذخیره فاکتور انجام نشد.', 'error');
        return null;
      }
      setInvoice(structuredClone(result.invoice));
      showSaved();
      return result.invoice;
    }

    if (!isDirty) {
      notify('تغییری برای ثبت Revision وجود ندارد.', 'info');
      return existing || invoice;
    }

    const reason = await promptDialog(
      isPartial ? 'فاکتور بخشی‌تسویه فقط از نظر توضیحات قابل ویرایش است. دلیل این تغییر را وارد و تأیید کنید:' : 'دلیل ویرایش سند قطعی را وارد کنید:',
      { title: 'ثبت Revision', confirmLabel: 'ثبت Revision', placeholder: 'دلیل ویرایش...' }
    );
    if (!reason?.trim()) return null;
    const result = reviseInvoice(invoice, reason);
    if (!result.ok || !result.invoice) {
      notify(result.message || 'ثبت Revision انجام نشد.', 'error');
      return null;
    }
    setInvoice(structuredClone(result.invoice));
    showSaved();
    return result.invoice;
  };

  const previewPrint = () => {
    setPreviewOpen(true);
  };

  const print = async () => {
    if (isReadOnly) {
      window.print();
      return;
    }
    if (isVoid) {
      window.print();
      return;
    }

    if (isDraft) {
      const approved = await confirmDialog(
        `فاکتور ${invoice.kind === 'sale' ? 'فروش' : 'خرید'} ${invoice.number} به مبلغ ${money(invoiceTotal(invoice))} ${settings.currency} قطعی می‌شود و اثر حسابداری و موجودی آن ثبت خواهد شد. بعد از ثبت، اصلاح سند از مسیر Revision انجام می‌شود. ادامه می‌دهید؟`,
        { title: 'تأیید ثبت نهایی فاکتور', confirmLabel: 'ثبت نهایی و چاپ' }
      );
      if (!approved) return;
      const result = finalizeInvoice(invoice);
      if (!result.ok || !result.invoice) {
        notify(result.message || 'ثبت نهایی فاکتور انجام نشد.', 'error');
        return;
      }
      setInvoice(structuredClone(result.invoice));
      window.setTimeout(() => window.print(), 120);
      return;
    }

    if (isDirty && !(await persist())) return;
    window.setTimeout(() => window.print(), 80);
  };

  const voidCurrent = async () => {
    if (!canEdit || !isPosted || isSettled) return;
    const reason = await promptDialog('دلیل ابطال فاکتور را وارد کنید:', { title: 'ابطال فاکتور', confirmLabel: 'ابطال سند', danger: true, placeholder: 'دلیل ابطال...' });
    if (!reason?.trim()) return;
    const result = voidInvoice(invoice.id, reason);
    if (!result.ok || !result.invoice) {
      notify(result.message || 'ابطال فاکتور انجام نشد.', 'error');
      return;
    }
    setInvoice(structuredClone(result.invoice));
  };

  const duplicate = () => {
    if (!canEdit || isPartial) return;
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

  const addRow = () => {
    if (!canEdit || isPartial) return;
    patch('items', [...invoice.items, { id: uid('row'), description: '', details: '', unit: 'عدد', qty: 1, unitPrice: 0, discount: 0 }]);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void print();
        return;
      }
      if (modifier && event.key === 'Enter') {
        event.preventDefault();
        addRow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return <div className={'invoice-editor-root space-y-4' + (previewOpen ? ' invoice-preview-active' : '')}>
    <style>{`@media print { @page { size: ${paperSize} portrait; margin: ${paperSize === 'A5' ? '5mm' : '8mm 8mm 10mm'}; } }`}</style>
    {previewOpen ? <div className="invoice-preview-toolbar screen-only" data-paper-size={paperSize}>
      <Button variant="outline" onClick={() => setPreviewOpen(false)}><ArrowRight className="h-4 w-4" /> بازگشت به ویرایش</Button>
      <span className="text-sm font-black">پیش‌نمایش قالب {INVOICE_TEMPLATES.find((template) => template.id === invoice.templateId)?.label || 'کلاسیک'} · {paperSize}</span>
      <InvoicePaperSizeSelect value={paperSize} onChange={choosePaperSize} />
      <Button onClick={print}><Printer className="h-4 w-4" /> {canEdit && isDraft ? 'ثبت نهایی و چاپ' : 'چاپ'}</Button>
    </div> : <AppNavbarContent
      title={`${isReadOnly ? 'نمایش' : isPartial ? 'ویرایش محدود' : 'ویرایش'} فاکتور ${invoice.kind === 'sale' ? 'فروش' : 'خرید'}`}
      subtitle={isReadOnly ? 'اطلاعات فاکتور فقط برای مشاهده باز شده است.' : 'همین فرم نسخه قابل چاپ فاکتور است.'}
      leading={<>
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} aria-label="بازگشت"><ArrowRight className="h-4 w-4" /></Button>}
        <Badge className={statusClass}>{statusLabel}{(invoice.revision || 0) > 1 ? ` · R${invoice.revision}` : ''}</Badge>
      </>}
      actions={<>
        {savedFlash && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> ذخیره شد</span>}
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <span>قالب</span>
          <select className="h-9 min-w-[130px] rounded-xl border border-slate-200 bg-white px-2 text-sm" value={invoice.templateId} onChange={(event) => chooseTemplate(event.target.value as InvoiceTemplateId)} aria-label="قالب این فاکتور">
            {INVOICE_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
          </select>
        </label>
        <InvoicePaperSizeSelect value={paperSize} onChange={choosePaperSize} />
        {mode === 'view' && existing && !isSettled && !isVoid && <Button variant="outline" size="sm" onClick={onRequestEdit}><Edit3 className="h-4 w-4" /> {isPartial ? 'ویرایش محدود' : 'ویرایش فاکتور'}</Button>}
        {canEdit && !isPartial && <Button variant="outline" size="sm" onClick={duplicate}><Copy className="h-4 w-4" /> کپی فاکتور</Button>}
        {canEdit && <Button variant="outline" size="sm" onClick={persist} title="Ctrl/Cmd + S"><Save className="h-4 w-4" /> {isDraft ? 'ذخیره پیش‌نویس' : 'ثبت Revision'}</Button>}
        {canEdit && isPosted && !isSettled && <Button variant="danger" size="sm" onClick={voidCurrent}><Ban className="h-4 w-4" /> ابطال</Button>}
        {existing && currentStatus !== 'draft' && <InvoicePaymentHistoryButton invoiceId={existing.id} />}
        {existing && isPosted && outstanding > 0 && <>
          <Button variant="outline" size="sm" disabled={isDirty} title={isDirty ? 'ابتدا تغییرات را ثبت کنید.' : undefined} onClick={startPayment}><ArrowDownToLine className="h-4 w-4" />{invoice.kind === 'sale' ? 'دریافت / تسویه' : 'پرداخت / تسویه'}</Button>
        </>}
        <Button variant="outline" size="sm" onClick={previewPrint}><Eye className="h-4 w-4" /> پیش‌نمایش چاپ</Button>
        <Button size="sm" onClick={print} title="Ctrl/Cmd + P"><Printer className="h-4 w-4" /> {canEdit && isDraft ? 'ثبت نهایی و چاپ' : isVoid ? 'چاپ نسخه باطل' : 'چاپ'}</Button>
      </>}
    />}

    {isPartial && mode === 'edit' && <Alert className="screen-only rounded-xl border-amber-200 bg-amber-50 text-amber-900"><AlertDescription>این فاکتور بخشی‌تسویه است. فقط توضیحات قابل تغییر است و ثبت آن به وارد کردن دلیل و تأیید Revision نیاز دارد.</AlertDescription></Alert>}
    {isSettled && <Alert className="screen-only rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900"><AlertDescription>این فاکتور تسویه شده است و ویرایش آن غیرفعال است.</AlertDescription></Alert>}

    <div className="print-surface invoice-paper relative" data-template={invoice.templateId} data-paper-size={paperSize}>
      {isDraft && <div className="print-only print-watermark text-slate-500">پیش‌نویس</div>}
      {isVoid && <div className="print-only print-watermark text-rose-500">باطل</div>}
      {isVoid && <Alert variant="destructive" className="screen-only mb-4 rounded-xl border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 [&>svg]:text-rose-700"><AlertDescription>این فاکتور باطل شده است.{invoice.voidReason ? ' دلیل: ' + invoice.voidReason : ''}</AlertDescription></Alert>}
      <fieldset disabled={isReadOnly || isPartial} className="contents">
      {invoice.templateId === 'violet-ledger' && <div className="invoice-violet-edge invoice-violet-edge-top" aria-hidden="true" />}
      <div className="invoice-parties-layout">
      <header className="invoice-party-block invoice-issuer-block mb-3">
        <Panel variant="subtle" padding="sm" className="screen-only mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-xs font-black text-sky-800">پروفایل صادرکننده</div><div className="text-[10px] text-slate-500">این انتخاب روی خود فاکتور ذخیره می‌شود.</div></div>
            <select className="h-9 min-w-[220px] rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold" value={invoice.businessProfileId} onChange={(e) => patch('businessProfileId', e.target.value)}>
              {settings.businessProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}{profile.id === settings.defaultBusinessProfileId ? ' — پیش‌فرض' : ''}</option>)}
            </select>
          </div>
        </Panel>
        {isGreenBrandTemplate && <div className="invoice-green-masthead">
          <div className="invoice-green-titlebox invoice-type-title"><EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-green-title" readOnly={invoice.kind === 'purchase'} /></div>
          <div className="invoice-green-brand">
            <div className="invoice-green-logo">{businessProfile?.logoImage ? <img src={businessProfile.logoImage} alt="لوگوی صادرکننده" /> : <span>{(businessProfile?.businessName || businessProfile?.label || 'ف').trim().slice(0, 1)}</span>}</div>
            <EditableText value={businessProfile?.businessName || businessProfile?.label || 'نام فروشگاه'} onChange={(v) => updateBusinessProfile({ businessName: v })} className="invoice-green-brand-name invoice-type-brand" />
          </div>
          <div className="invoice-green-seller-contact">
            <InfoLine label="تلفن" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} valueDirection="rtl" />
            <InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} />
          </div>
        </div>}
        {isStorefrontTemplate && <div className="invoice-storefront-masthead">
          <div className="invoice-storefront-brand">
            <EditableText value={businessProfile?.businessName || businessProfile?.label || 'نام فروشگاه'} onChange={(v) => updateBusinessProfile({ businessName: v })} className="invoice-storefront-store-name invoice-type-brand" />
            <EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-storefront-title invoice-type-title" readOnly={invoice.kind === 'purchase'} />
          </div>
          <div className="invoice-storefront-seller-contact">
            <InfoLine label="تلفن" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} valueDirection="rtl" />
            <InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} />
          </div>
        </div>}
        {isOfficialTemplate && <div className="invoice-official-masthead invoice-type-title"><EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-official-title" readOnly={invoice.kind === 'purchase'} /></div>}
        {invoice.templateId === 'violet-ledger' && <div className="invoice-violet-masthead">
          <div className="invoice-violet-title invoice-type-title"><EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-violet-title-input" readOnly={invoice.kind === 'purchase'} /></div>
          <div className="invoice-violet-logo">{businessProfile?.logoImage ? <img src={businessProfile.logoImage} alt="لوگوی صادرکننده" /> : <span>محل لوگو</span>}</div>
          <div className="invoice-violet-document-meta">
            <InfoLine label="شماره فاکتور" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="invoice-violet-date"><span className="font-bold">تاریخ</span><span className="screen-only"><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></span><span className="print-only">{formatPersianDate(invoice.date)}</span></div>
          </div>
        </div>}
        {invoice.templateId === 'violet-ledger' && <div className="invoice-violet-divider" aria-hidden="true" />}
        {invoice.templateId === 'blue-ledger' && <div className="invoice-reference-masthead">
          <div className="invoice-reference-titlebar invoice-type-title"><EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-reference-title" readOnly={invoice.kind === 'purchase'} /></div>
          <div className="invoice-reference-logo">
            {businessProfile?.logoImage ? <img src={businessProfile.logoImage} alt="لوگوی صادرکننده" /> : <span>لوگوی شرکت شما</span>}
          </div>
          <div className="invoice-reference-meta">
            <InfoLine label="شماره" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="invoice-reference-date">
              <div className="screen-only flex items-center gap-2"><span className="shrink-0 font-bold">تاریخ:</span><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></div>
              <div className="print-only"><b>تاریخ:</b> {formatPersianDate(invoice.date)}</div>
            </div>
          </div>
        </div>}
        <div className="invoice-reference-party-title">{invoice.kind === 'sale' ? 'مشخصات فروشنده' : 'مشخصات خریدار'}</div>
        {invoice.templateId !== 'blue-ledger' && invoice.templateId !== 'violet-ledger' && !isOfficialTemplate && !isStorefrontTemplate && !isGreenBrandTemplate && <EditableText value={invoiceTitle} onChange={(v) => invoice.kind === 'sale' && updateBusinessProfile({ invoiceTitle: v })} className="invoice-type-title mx-auto max-w-[320px] text-center text-[22px] font-black" readOnly={invoice.kind === 'purchase'} />}
        {isGreenBrandTemplate ? null : isStorefrontTemplate ? null : isOfficialTemplate ? <div className="invoice-official-party-content invoice-official-seller-content">
          <div className="invoice-official-party-main">
            <InfoLine label={invoice.kind === 'sale' ? 'فروشنده' : 'خریدار'} value={businessProfile?.businessName || ''} onChange={(v) => updateBusinessProfile({ businessName: v })} hideWhenEmptyForPrint />
            <InfoLine label="تلفن" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} valueDirection="rtl" hideWhenEmptyForPrint />
            <InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} hideWhenEmptyForPrint />
          </div>
          <div className="invoice-official-party-codes">
            <InfoLine label="شناسه ملی" value={businessProfile?.nationalId || ''} onChange={(v) => updateBusinessProfile({ nationalId: v })} format="nationalId" hideWhenEmptyForPrint />
            <InfoLine label="کد اقتصادی" value={businessProfile?.economicCode || ''} onChange={(v) => updateBusinessProfile({ economicCode: v })} format="economicCode" hideWhenEmptyForPrint />
            <InfoLine label="کدپستی" value={businessProfile?.postalCode || ''} onChange={(v) => updateBusinessProfile({ postalCode: v })} format="postalCode" hideWhenEmptyForPrint />
          </div>
        </div> : invoice.templateId === 'violet-ledger' ? <div className="invoice-violet-party-fields invoice-violet-issuer-fields">
          <InfoLine label={invoice.kind === 'sale' ? 'ارائه‌دهنده' : 'خریدار'} value={businessProfile?.businessName || ''} onChange={(v) => updateBusinessProfile({ businessName: v })} />
          <InfoLine label="شماره تماس" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} valueDirection="rtl" />
          <InfoLine label="کد اقتصادی" value={businessProfile?.economicCode || ''} onChange={(v) => updateBusinessProfile({ economicCode: v })} format="economicCode" />
          <div className="invoice-violet-party-address"><InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} /></div>
        </div> : <div className="invoice-reference-party-content mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] leading-7 sm:grid-cols-[.85fr_1.55fr]">
          <div className="order-2 sm:order-1">
            <div className="print-only print-block text-[10px] leading-6 text-slate-600">
              <div><b>شناسه ملی:</b> {businessProfile?.nationalId || '—'}</div>
              <div><b>کد اقتصادی:</b> {businessProfile?.economicCode || '—'}</div>
              <div><b>کدپستی:</b> {formatPostalCode(businessProfile?.postalCode) || '—'}</div>
            </div>
            <div className="screen-only grid gap-1">
              <MiniEdit placeholder="شناسه ملی فروشنده" value={businessProfile?.nationalId || ''} onChange={(v) => updateBusinessProfile({ nationalId: v })} format="nationalId" />
              <MiniEdit placeholder="کد اقتصادی فروشنده" value={businessProfile?.economicCode || ''} onChange={(v) => updateBusinessProfile({ economicCode: v })} format="economicCode" />
              <MiniEdit placeholder="کدپستی فروشنده" value={businessProfile?.postalCode || ''} onChange={(v) => updateBusinessProfile({ postalCode: v })} format="postalCode" />
            </div>
          </div>
          <div className="order-1 sm:order-2">
            <InfoLine label="فروشنده" value={businessProfile?.businessName || ''} onChange={(v) => updateBusinessProfile({ businessName: v })} />
            <InfoLine label="تلفن" value={businessProfile?.phone || ''} onChange={(v) => updateBusinessProfile({ phone: v })} valueDirection="rtl" />
            <InfoLine label="آدرس" value={businessProfile?.address || ''} onChange={(v) => updateBusinessProfile({ address: v })} />
          </div>
        </div>}
      </header>

      <div className="invoice-party-block invoice-customer-block mb-2 border-t-2 border-slate-700 pt-2">
        <div className="invoice-reference-party-title">{invoice.kind === 'sale' ? 'مشخصات خریدار' : 'مشخصات فروشنده'}</div>
        {isGreenBrandTemplate ? <div className="invoice-green-party-layout">
          <div className="invoice-green-buyer">
          <div className="invoice-green-customer-name"><span className="shrink-0 font-bold">{invoice.kind === 'sale' ? 'طرف حساب:' : 'فروشنده:'}</span><span className="screen-only min-w-[110px] flex-1"><SearchableSelect value={invoice.customerId} options={customerOptions} onChange={chooseCustomer} placeholder="انتخاب طرف حساب..." searchPlaceholder="جستجوی نام، کد یا تلفن..." inputClassName="font-bold" /></span><span className="print-only font-bold">{invoice.customerName || '—'}</span>{!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}</div>
            <InfoLine label="تلفن" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} valueDirection="rtl" />
            <InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} />
          </div>
          <div className="invoice-green-document-meta">
            <div><b>کد شخص:</b><span>{customer?.code || '—'}</span></div>
            <InfoLine label="شماره فاکتور" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="invoice-green-date"><span className="font-bold">تاریخ:</span><span className="screen-only"><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></span><span className="print-only">{formatPersianDate(invoice.date)}</span></div>
          </div>
        </div> : isStorefrontTemplate ? <div className="invoice-storefront-party-layout">
          <div className="invoice-storefront-buyer">
          <div className="invoice-storefront-customer-name"><span className="shrink-0 font-bold">{invoice.kind === 'sale' ? 'طرف حساب:' : 'فروشنده:'}</span><span className="screen-only min-w-[110px] flex-1"><SearchableSelect value={invoice.customerId} options={customerOptions} onChange={chooseCustomer} placeholder="انتخاب طرف حساب..." searchPlaceholder="جستجوی نام، کد یا تلفن..." inputClassName="font-bold" /></span><span className="print-only font-bold">{invoice.customerName || '—'}</span>{!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}</div>
            <InfoLine label="تلفن" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} valueDirection="rtl" />
            <InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} />
          </div>
          <div className="invoice-storefront-document-meta">
            <InfoLine label="شماره فاکتور" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="invoice-storefront-date"><span className="font-bold">تاریخ:</span><span className="screen-only"><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></span><span className="print-only">{formatPersianDate(invoice.date)}</span></div>
            <div><b>کد شخص:</b><span>{customer?.code || '—'}</span></div>
          </div>
        </div> : isOfficialTemplate ? <div className="invoice-official-party-content invoice-official-buyer-content">
          <div className="invoice-official-party-main">
            <div className="invoice-official-customer-name" data-print-empty={!hasText(invoice.customerName) ? 'true' : undefined}><span className="shrink-0 font-bold">{invoice.kind === 'sale' ? 'خریدار:' : 'فروشنده:'}</span><span className="screen-only min-w-[110px] flex-1"><SearchableSelect value={invoice.customerId} options={customerOptions} onChange={chooseCustomer} placeholder="انتخاب طرف حساب..." searchPlaceholder="جستجوی نام، کد یا تلفن..." inputClassName="font-bold" /></span><span className="print-only font-bold">{invoice.customerName}</span>{!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}</div>
            <InfoLine label="تلفن" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} valueDirection="rtl" hideWhenEmptyForPrint />
            <InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} hideWhenEmptyForPrint />
            <div className="invoice-official-party-codes">
              <InfoLine label="شناسه ملی" value={invoice.customerNationalId || ''} onChange={(v) => patch('customerNationalId', v)} format="nationalId" hideWhenEmptyForPrint />
              <InfoLine label="کد اقتصادی" value={invoice.customerEconomicCode || ''} onChange={(v) => patch('customerEconomicCode', v)} format="economicCode" hideWhenEmptyForPrint />
              <InfoLine label="کدپستی" value={invoice.customerPostalCode || ''} onChange={(v) => patch('customerPostalCode', v)} format="postalCode" hideWhenEmptyForPrint />
            </div>
          </div>
          <div className="invoice-official-buyer-meta">
            <div data-print-empty={!hasText(customer?.code) ? 'true' : undefined}><b>کد شخص:</b><span>{customer?.code}</span></div>
            <InfoLine label="شماره" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="invoice-official-date"><span className="font-bold">تاریخ:</span><span className="screen-only"><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></span><span className="print-only">{formatPersianDate(invoice.date)}</span></div>
          </div>
        </div> : invoice.templateId === 'violet-ledger' ? <div className="invoice-violet-party-fields invoice-violet-customer-fields">
          <div className="invoice-violet-fields-main">
            <div className="invoice-violet-customer-name"><span className="font-bold">{invoice.kind === 'sale' ? 'خریدار' : 'فروشنده'}:</span><span className="screen-only min-w-[110px] flex-1"><SearchableSelect value={invoice.customerId} options={customerOptions} onChange={chooseCustomer} placeholder="انتخاب طرف حساب..." searchPlaceholder="جستجوی نام، کد یا تلفن..." inputClassName="font-bold" /></span><span className="print-only font-bold">{invoice.customerName || '—'}</span>{!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}</div>
            <InfoLine label="شماره تماس" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} valueDirection="rtl" />
            <InfoLine label="کد اقتصادی" value={invoice.customerEconomicCode || ''} onChange={(v) => patch('customerEconomicCode', v)} format="economicCode" />
          </div>
          <div className="invoice-violet-party-address"><InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} /></div>
        </div> : <div className="invoice-reference-party-content grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><span className="shrink-0 font-bold">{invoice.templateId === 'blue-ledger' ? 'نام' : 'طرف حساب'}:</span>
              <div className="screen-only min-w-[210px] flex-1"><SearchableSelect value={invoice.customerId} options={customerOptions} onChange={chooseCustomer} placeholder="انتخاب طرف حساب..." searchPlaceholder="جستجوی نام، کد یا تلفن..." inputClassName="font-bold" /></div><span className="print-only font-bold">{invoice.customerName || '—'}</span>
              {!invoice.customerId && <input className="screen-editor invoice-inline-input font-bold" placeholder="نام طرف حساب" value={invoice.customerName} onChange={(e) => patch('customerName', e.target.value)} />}
            </div>
            <InfoLine label="تلفن" value={invoice.customerPhone} onChange={(v) => patch('customerPhone', v)} valueDirection="rtl" />
            <InfoLine label="آدرس" value={invoice.customerAddress} onChange={(v) => patch('customerAddress', v)} />
            {(invoice.customerNationalId || invoice.customerEconomicCode || invoice.customerPostalCode) && <div className="print-block text-[10px] text-slate-500">شناسه ملی: {invoice.customerNationalId || '—'} &nbsp; کد اقتصادی: {invoice.customerEconomicCode || '—'} &nbsp; کدپستی: {formatPostalCode(invoice.customerPostalCode) || '—'}</div>}
            <div className="screen-only grid grid-cols-3 gap-1 pt-1">
              <MiniEdit placeholder="شناسه ملی" value={invoice.customerNationalId || ''} onChange={(v) => patch('customerNationalId', v)} format="nationalId" />
              <MiniEdit placeholder="کد اقتصادی" value={invoice.customerEconomicCode || ''} onChange={(v) => patch('customerEconomicCode', v)} format="economicCode" />
              <MiniEdit placeholder="کدپستی" value={invoice.customerPostalCode || ''} onChange={(v) => patch('customerPostalCode', v)} format="postalCode" />
            </div>
          </div>
          <div className="invoice-customer-document-meta space-y-1 sm:text-left">
            <InfoLine label="شماره" value={invoice.number} onChange={(v) => patch('number', v)} readOnly={!isDraft} />
            <div className="screen-only flex items-center gap-2 sm:justify-end"><span className="font-bold">تاریخ:</span><JalaliDatePicker value={invoice.date} onChange={(value) => patch('date', value)} disabled={isVoid} /></div>
            <div className="print-only"><b>تاریخ:</b> {formatPersianDate(invoice.date)}</div>
            <div className="flex gap-1 text-[10px] text-slate-500 sm:justify-end"><span>{customer?.code ? `کد شخص: ${customer.code}` : ''}</span></div>
          </div>
        </div>}
      </div>
      </div>

      {isOfficialTemplate && <div className="invoice-official-table-title">مشخصات کالا و خدمات مورد معامله</div>}
      {isStorefrontTemplate && <div className="invoice-table-scroll mt-2"><DataTable className="invoice-grid-table invoice-storefront-grid">
        <colgroup><col style={{ width: '42%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /></colgroup>
        <thead><tr><th>شرح کالا</th><th>مقدار</th><th>واحد</th><th>قیمت واحد</th><th>مبلغ کل</th></tr></thead>
        <tbody>{invoice.items.map((item) => <tr key={item.id}>
          <td>
            <div className="screen-only"><SearchableSelect value={item.productId || ''} options={productOptions} onChange={(value) => chooseProduct(item.id, value)} placeholder="انتخاب کالا / خدمت..." searchPlaceholder="جستجوی نام یا کد..." inputClassName="h-8 border-transparent bg-transparent font-bold hover:border-sky-200" /></div>
            <span className="print-only desc">{item.description || '—'}</span>
            {!item.productId && <input className="screen-editor invoice-inline-input desc" placeholder="شرح کالا یا خدمت" value={item.description} onChange={(e) => patchItem(item.id, { description: e.target.value })} />}
            <textarea className="screen-editor invoice-inline-textarea detail" placeholder="توضیحات ردیف..." value={item.details || ''} onChange={(e) => patchItem(item.id, { details: e.target.value })} />
            {!!item.details && <div className="print-only print-block detail">{item.details}</div>}
            <div className="screen-only invoice-storefront-line-discount"><span>تخفیف ردیف:</span><NumberEdit value={Number(item.discount || 0)} onChange={(v) => patchItem(item.id, { discount: Math.min(invoiceLineGross(item), v) })} formatted /></div>
            <button aria-label="حذف ردیف" className="screen-only invoice-storefront-remove-row rounded-lg p-1 text-rose-500 hover:bg-rose-50" onClick={() => patch('items', invoice.items.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4" /></button>
          </td>
          <td><NumberEdit value={item.qty} onChange={(v) => patchItem(item.id, { qty: v })} /></td>
          <td><EditableText value={item.unit} onChange={(v) => patchItem(item.id, { unit: v })} className="text-center" /></td>
          <td><NumberEdit value={item.unitPrice} onChange={(v) => patchItem(item.id, { unitPrice: v })} formatted /></td>
          <td className="text-left font-bold" dir="ltr">{money(invoiceLineGross(item))}</td>
        </tr>)}</tbody>
      </DataTable></div>}
      {!isStorefrontTemplate && <div className="invoice-table-scroll mt-2"><DataTable className={'invoice-grid-table' + (isGreenBrandTemplate ? ' invoice-green-grid' : '')}>
        <colgroup><col style={{ width: '6%' }} /><col style={{ width: '30%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '14%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} /><col style={{ width: '4%' }} /></colgroup>
        <thead><tr>
          <th>{invoice.templateId === 'blue-ledger' ? 'R' : 'ردیف'}</th>
          <th>{invoice.templateId === 'violet-ledger' ? <><span>شرح کالا</span><small>description</small></> : invoice.templateId === 'blue-ledger' ? 'نام کالا' : 'شرح کالا / خدمت'}</th>
          <th>{invoice.templateId === 'violet-ledger' ? <><span>تعداد</span><small>QTY</small></> : 'تعداد'}</th>
          <th>واحد</th>
          <th>{invoice.templateId === 'violet-ledger' ? <><span>فی ({settings.currency})</span><small>unit price</small></> : 'قیمت واحد'}</th>
          <th>{invoice.templateId === 'violet-ledger' ? <><span>تخفیف</span><small>Discount</small></> : 'تخفیف'}</th>
          <th>{invoice.templateId === 'violet-ledger' ? <><span>مبلغ کل ({settings.currency})</span><small>final price</small></> : invoice.templateId === 'blue-ledger' ? 'قیمت کل' : isOfficialTemplate ? 'مبلغ کل' : 'مبلغ خالص'}</th>
          <th className="screen-only !w-8"></th>
        </tr></thead>
        <tbody>{invoice.items.map((item, index) => <tr key={item.id}>
          <td className="text-center font-bold">{index + 1}</td>
          <td>
            <div className="screen-only"><SearchableSelect value={item.productId || ''} options={productOptions} onChange={(value) => chooseProduct(item.id, value)} placeholder="انتخاب کالا / خدمت..." searchPlaceholder="جستجوی نام یا کد..." inputClassName="h-8 border-transparent bg-transparent font-bold hover:border-sky-200" /></div>
            <span className="print-only desc">{item.description || (isOfficialTemplate ? '' : '—')}</span>
            {!item.productId && <input className="screen-editor invoice-inline-input desc" placeholder="شرح کالا یا خدمت" value={item.description} onChange={(e) => patchItem(item.id, { description: e.target.value })} />}
            <textarea className="screen-editor invoice-inline-textarea detail" placeholder="توضیحات ردیف..." value={item.details || ''} onChange={(e) => patchItem(item.id, { details: e.target.value })} />
            {!!item.details && <div className="print-only print-block detail">{item.details}</div>}
          </td>
          <td><NumberEdit value={item.qty} onChange={(v) => patchItem(item.id, { qty: v })} />{invoice.templateId === 'blue-ledger' && <span className="print-only invoice-reference-unit"> {item.unit}</span>}</td>
          <td><EditableText value={item.unit} onChange={(v) => patchItem(item.id, { unit: v })} className="text-center" /></td>
          <td><NumberEdit value={item.unitPrice} onChange={(v) => patchItem(item.id, { unitPrice: v })} formatted /></td>
          <td>{invoice.templateId === 'violet-ledger'
            ? <><span className="screen-only"><NumberEdit value={Number(item.discount || 0)} onChange={(v) => patchItem(item.id, { discount: Math.min(invoiceLineGross(item), v) })} formatted /></span><span className="print-only">{item.discountPercent ? `${money(item.discountPercent)}%` : invoiceLineDiscount(item) > 0 ? money(invoiceLineDiscount(item)) : '—'}</span></>
            : <><NumberEdit value={Number(item.discount || 0)} onChange={(v) => patchItem(item.id, { discount: Math.min(invoiceLineGross(item), v) })} formatted />{!!item.discountPercent && <div className="print-only text-[9px] text-slate-400">{item.discountPercent}%</div>}</>}
          </td>
          <td className="text-left font-bold" dir="ltr">
            {invoice.templateId === 'violet-ledger' ? <InvoiceAmount value={invoiceLineNet(item)} /> : <span>{money(invoiceLineNet(item))}</span>}
            {invoiceLineDiscount(item) > 0 && <div className="print-only text-[9px] font-normal text-slate-400">ناخالص {money(invoiceLineGross(item))}</div>}
          </td>
          <td className="screen-only"><button aria-label="حذف ردیف" className="rounded-lg p-1 text-rose-500 hover:bg-rose-50" onClick={() => patch('items', invoice.items.filter((x) => x.id !== item.id))}><Trash2 className="h-4 w-4" /></button></td>
        </tr>)}
        {invoice.templateId === 'violet-ledger' && Array.from({ length: Math.max(0, (paperSize === 'A5' ? 7 : 15) - invoice.items.length) }, (_, index) => <tr className="invoice-violet-blank-row" key={`blank-${index}`}>
          <td className="text-center">{invoice.items.length + index + 1}</td><td></td><td></td><td></td><td></td><td></td><td><InvoiceAmount value={0} empty /></td><td className="screen-only"></td>
        </tr>)}
        </tbody>
      </DataTable></div>}
      <div className="screen-only mt-2"><Button variant="outline" size="sm" onClick={addRow} title="Ctrl/Cmd + Enter"><Plus className="h-4 w-4" /> افزودن ردیف <kbd className="mr-1 hidden rounded bg-slate-100 px-1 text-[9px] text-slate-500 sm:inline">Ctrl↵</kbd></Button></div>

      <div className={'invoice-summary-block mt-4 grid grid-cols-1 gap-6 border-t border-blue-200 pt-3' + (invoice.templateId === 'blue-ledger' ? ' invoice-reference-summary' : isOfficialTemplate ? ' invoice-official-summary' : isStorefrontTemplate ? ' invoice-storefront-summary' : isGreenBrandTemplate ? ' invoice-green-summary' : ' sm:grid-cols-2')}>
        {invoice.templateId === 'blue-ledger' ? <div className="invoice-reference-totals">
          <div className="invoice-reference-total-row"><span>جمع کل قبل از مالیات:</span><span dir="ltr">{money(total - invoice.tax)} {settings.currency}</span></div>
          <div className="invoice-reference-total-row"><span>مالیات / عوارض:</span><NumberEdit value={invoice.tax} onChange={(v) => patch('tax', v)} formatted /></div>
          <div className="invoice-reference-grand-total invoice-type-total"><strong>جمع کل</strong><strong dir="ltr">{money(total)} {settings.currency}</strong></div>
        </div> : isGreenBrandTemplate ? <div className="invoice-green-totals">
          <div className="invoice-green-total-row invoice-green-total-highlight invoice-type-total"><b>مبلغ فاکتور:</b><strong dir="ltr">{money(total)} {settings.currency}</strong></div>
          <div className="invoice-green-total-row"><span>مبلغ پرداختی:</span><strong dir="ltr">{money(settledAmount)} {settings.currency}</strong></div>
          <div className="invoice-green-total-row"><span>مانده از قبل:</span><strong dir="ltr">{money(Math.abs(previousCustomerBalance))} {settings.currency} <small>({previousCustomerBalance < 0 ? 'بستانکار' : 'بدهکار'})</small></strong></div>
          <div className="invoice-green-total-row invoice-green-total-highlight invoice-type-total"><b>مانده تا این تاریخ:</b><strong dir="ltr">{money(Math.abs(greenBalanceToDate))} {settings.currency} <small>{greenBalanceToDate < 0 ? 'بستانکار' : 'بدهکار'}</small></strong></div>
        </div> : isOfficialTemplate ? <div className="invoice-official-total invoice-type-total"><b>مبلغ فاکتور:</b><strong dir="ltr">{money(total)} {settings.currency}</strong></div> : isStorefrontTemplate ? <div className="invoice-storefront-totals">
          <AmountLine label="جمع" value={grossSubtotal} fixed />
          {lineDiscountTotal > 0 && <AmountLine label="تخفیف کالاها" value={lineDiscountTotal} fixed />}
          <AmountLine label="تخفیفات" value={invoice.discount} onChange={(v) => patch('discount', v)} />
          <AmountLine label="هزینه پست" value={invoice.shipping} onChange={(v) => patch('shipping', v)} />
          <AmountLine label="مالیات بر ارزش افزوده" value={invoice.tax} onChange={(v) => patch('tax', v)} />
          <div className="invoice-storefront-grand-total invoice-type-total"><b>مبلغ فاکتور:</b><strong dir="ltr">{money(total)} {settings.currency}</strong></div>
        </div> : <>
          <div className="order-2 text-[12px] sm:order-1">
            {isPartial
              ? <div className="min-h-12 whitespace-pre-wrap leading-6">{invoice.notes || '—'}</div>
              : <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="توضیحات فاکتور..." />}
          </div>
          <div className="order-1 space-y-1 text-[12px] sm:order-2">
            <AmountLine label="جمع ناخالص ردیف‌ها" value={grossSubtotal} fixed />
            {lineDiscountTotal > 0 && <AmountLine label="تخفیف ردیف‌ها" value={lineDiscountTotal} fixed />}
            <AmountLine label="جمع خالص ردیف‌ها" value={subtotal} fixed />
            <AmountLine label="تخفیف کل فاکتور" value={invoice.discount} onChange={(v) => patch('discount', v)} />
            <AmountLine label="مالیات / عوارض" value={invoice.tax} onChange={(v) => patch('tax', v)} />
            <AmountLine label="هزینه حمل" value={invoice.shipping} onChange={(v) => patch('shipping', v)} />
            <div className="invoice-type-total mt-2 flex items-center justify-between border-t border-sky-200 pt-3 text-sky-700"><span className="text-[14px] font-black">مبلغ فاکتور:</span><span className="text-[16px] font-black" dir="ltr">{money(total)} <small className="text-[11px]">{settings.currency}</small></span></div>
          </div>
        </>}
      </div>

      {isGreenBrandTemplate && !!invoice.notes && <div className="invoice-green-notes"><b>توضیحات:</b><span className="whitespace-pre-wrap">{invoice.notes}</span></div>}

      {isOfficialTemplate && <div className="invoice-official-notes" data-print-empty={!hasText(invoice.notes) ? 'true' : undefined}>
        <div className="invoice-official-notes-heading">توضیحات:</div>
        {isPartial
          ? <div className="invoice-official-notes-value whitespace-pre-wrap">{invoice.notes}</div>
          : <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="توضیحات فاکتور..." />}
      </div>}

      {isStorefrontTemplate && (canEdit || invoice.notes) && <div className="invoice-storefront-notes">
        <b>توضیحات:</b>
        {isPartial
          ? <div className="invoice-storefront-notes-value whitespace-pre-wrap">{invoice.notes || '—'}</div>
          : <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="توضیحات فاکتور..." />}
      </div>}

      {invoice.templateId === 'violet-ledger' && <div className="invoice-violet-footer">
        <div className="invoice-violet-summary">
          <div className="invoice-violet-summary-row invoice-type-total"><b>قیمت کل</b><InvoiceAmount value={total} /></div>
          <div className="invoice-violet-summary-row invoice-type-total"><b>بیعانه</b><InvoiceAmount value={settledAmount} /></div>
          <div className="invoice-violet-summary-row invoice-type-total"><b>مانده</b><InvoiceAmount value={existing ? outstanding : total} /></div>
          <div className="invoice-violet-signature">مهر و امضاء فروشنده</div>
          <div className="invoice-violet-signature">مهر و امضاء خریدار</div>
        </div>
        <div className="invoice-violet-notes">
          <div className="invoice-violet-amount-words"><b>کل مبلغ به حروف:</b><span>{numberToPersianWords(total)} {settings.currency}</span></div>
          <div className="invoice-violet-notes-heading">توضیحات:</div>
          {isPartial
            ? <div className="invoice-violet-notes-value whitespace-pre-wrap">{invoice.notes || '—'}</div>
            : <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="توضیحات فاکتور..." />}
        </div>
      </div>}
      {invoice.templateId === 'violet-ledger' && <div className="invoice-violet-edge invoice-violet-edge-bottom" aria-hidden="true" />}

      {invoice.templateId === 'blue-ledger' && <div className="invoice-reference-notes">
        <div className="invoice-reference-notes-heading">نحوه پرداخت و سایر توضیحات:</div>
        {isPartial
          ? <div className="invoice-reference-notes-body whitespace-pre-wrap">{invoice.notes || '—'}</div>
          : <EditableArea value={invoice.notes} onChange={(v) => patch('notes', v)} placeholder="نحوه پرداخت و توضیحات فاکتور..." />}
      </div>}

      <div className={'invoice-payment-block mt-8 grid grid-cols-2 gap-8 text-[12px]' + (isStorefrontTemplate ? ' invoice-storefront-footer' : isGreenBrandTemplate ? ' invoice-green-footer' : '')}>
        <div className="leading-7" data-print-empty={isOfficialTemplate && !hasText(businessProfile?.cardNumber) && !hasText(businessProfile?.iban) && !hasText(businessProfile?.ownerName) ? 'true' : undefined}>
          <div className="font-bold">اطلاعات پرداخت:</div>
          <CardNumberLine value={businessProfile?.cardNumber || ''} onChange={(cardNumber) => updateBusinessProfile({ cardNumber })} hideWhenEmptyForPrint={isOfficialTemplate} />
          <InfoLine label="شبا" value={businessProfile?.iban || ''} onChange={(v) => updateBusinessProfile({ iban: v })} format="iban" hideWhenEmptyForPrint={isOfficialTemplate} />
          <InfoLine label="به نام" value={businessProfile?.ownerName || ''} onChange={(v) => updateBusinessProfile({ ownerName: v })} hideWhenEmptyForPrint={isOfficialTemplate} />
        </div>
        <div className="text-slate-500">{isStorefrontTemplate || isGreenBrandTemplate ? <>
          <textarea className="screen-editor invoice-inline-textarea" value={businessProfile?.footer || ''} onChange={(event) => updateBusinessProfile({ footer: event.target.value })} placeholder="اجناس دریافتی را با فاکتور کنترل کنید. در قسمت تنظیمات فاکتور قابل تغییر" />
          <div className="print-only print-block whitespace-pre-wrap leading-6">{businessProfile?.footer || 'اجناس دریافتی را با فاکتور کنترل کنید. در قسمت تنظیمات فاکتور قابل تغییر'}</div>
        </> : <EditableArea value={businessProfile?.footer || ''} onChange={(v) => updateBusinessProfile({ footer: v })} placeholder="پاورقی فاکتور..." />}</div>
      </div>

      <div className="invoice-signatures mt-16 grid grid-cols-2 text-center text-[12px]">
        <div className="flex min-h-24 flex-col items-center justify-end">
          {businessProfile?.signatureImage && businessProfile.showSignature !== false
            ? <img src={businessProfile.signatureImage} alt="امضای فروشنده" className="mb-2 max-h-16 max-w-40 object-contain" />
            : <div className="mb-12" />}
          <div className="mx-auto mb-2 h-px w-24 border-t border-dashed border-slate-300"></div>امضاء فروشنده
        </div>
        <div className="flex min-h-24 flex-col items-center justify-end"><div className="mb-12" /><div className="mx-auto mb-2 h-px w-24 border-t border-dashed border-slate-300"></div>امضاء خریدار</div>
      </div>
      </fieldset>
    </div>

    {isPartial && mode === 'edit' && <Panel padding="sm" className="screen-only">
      <label className="grid gap-2 text-sm font-bold text-slate-700">ویرایش مجاز: توضیحات فاکتور
        <textarea className="min-h-24 rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal" value={invoice.notes} onChange={(event) => patch('notes', event.target.value)} placeholder="توضیحات فاکتور..." />
      </label>
    </Panel>}

    {!!invoice.auditTrail?.length && <Panel padding="sm" className="screen-only">
      <div className="mb-3 flex items-center gap-2 font-black text-slate-800"><History className="h-4 w-4 text-sky-600" /> تاریخچه سند</div>
      <div className="space-y-2">
        {[...invoice.auditTrail].reverse().map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
          <div><span className="font-bold">{auditActionLabel(entry.action)}</span>{entry.note ? <span className="mr-2 text-slate-500">— {entry.note}</span> : null}</div>
          <div className="text-slate-400">{entry.action === 'template_changed' ? 'تغییر ظاهری' : `Revision ${entry.revision}`} · {new Date(entry.at).toLocaleString('fa-IR')}</div>
        </div>)}
      </div>
    </Panel>}
    <InvoicePaymentDialog invoiceId={existing?.id} documentNumber={paymentAction?.documentNumber} open={!!paymentAction} onOpenChange={(open) => { if (!open) setPaymentAction(null); }} />
  </div>;
}

type IdentifierFormat = Exclude<TextInputFormat, 'card'>;

function formatIdentifierForPrint(value: string, format?: IdentifierFormat) {
  if (!value) return '—';
  if (format === 'postalCode') return formatPostalCode(value);
  if (format === 'iban') return formatIranIban(value);
  return value;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function EditableText({ value, onChange, className = '', readOnly = false, valueDirection, format }: { value: string; onChange: (v: string) => void; className?: string; readOnly?: boolean; valueDirection?: 'rtl'; format?: IdentifierFormat }) {
  return <>{format
    ? <FormattedInput format={format} dir="ltr" readOnly={readOnly} unstyled className={`screen-editor invoice-inline-input ${className}`} value={value} onValueChange={onChange} />
    : <input dir={valueDirection} readOnly={readOnly} className={`screen-editor invoice-inline-input ${className}`} value={value} onChange={(e) => onChange(e.target.value)} />}
    <span className={`print-only ${className}`} dir={format ? 'ltr' : valueDirection}>{formatIdentifierForPrint(value, format)}</span></>;
}
function EditableArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <><textarea className="screen-editor invoice-inline-textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /><div className="print-only print-block whitespace-pre-wrap leading-6">{value}</div></>;
}
function MiniEdit({ value, onChange, placeholder, format }: { value: string; onChange: (v: string) => void; placeholder: string; format?: IdentifierFormat }) {
  return format
    ? <FormattedInput format={format} dir="ltr" unstyled className="invoice-inline-input !border-slate-200 text-[10px]" value={value} onValueChange={onChange} placeholder={placeholder} />
    : <input className="invoice-inline-input !border-slate-200 text-[10px]" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}
function NumberEdit({ value, onChange, formatted = false }: { value: number; onChange: (v: number) => void; formatted?: boolean }) {
  return <><FormattedInput dir="ltr" min={0} unstyled className="screen-editor invoice-inline-input text-center" value={value} onValueChange={onChange} /><span className="print-only" dir="ltr">{formatted ? money(value) : value}</span></>;
}
function InfoLine({ label, value, onChange, readOnly = false, valueDirection, format, hideWhenEmptyForPrint = false }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; valueDirection?: 'rtl'; format?: IdentifierFormat; hideWhenEmptyForPrint?: boolean }) {
  return <div className="invoice-info-line flex min-h-7 items-center gap-1" data-print-empty={hideWhenEmptyForPrint && !hasText(value) ? 'true' : undefined}>
    <span className="invoice-info-line-label shrink-0 font-bold">{label}:</span>
    <EditableText value={value} onChange={onChange} readOnly={readOnly} valueDirection={valueDirection} format={format} />
  </div>;
}
function CardNumberLine({ value, onChange, hideWhenEmptyForPrint = false }: { value: string; onChange: (value: string) => void; hideWhenEmptyForPrint?: boolean }) {
  return <div className="invoice-info-line flex min-h-7 items-center gap-1" data-print-empty={hideWhenEmptyForPrint && !hasText(value) ? 'true' : undefined}>
    <span className="shrink-0 font-bold">شماره کارت:</span>
    <FormattedInput format="card" value={value} onValueChange={onChange} unstyled className="screen-editor invoice-inline-input" />
    <span className="print-only" dir="ltr">{formatCardNumber(value) || '—'}</span>
  </div>;
}
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
    template_changed: 'تغییر قالب چاپ',
    paper_size_changed: 'تغییر اندازه کاغذ',
  };
  return labels[action] || action;
}

function InvoicePaperSizeSelect({ value, onChange }: { value: InvoicePaperSize; onChange: (paperSize: InvoicePaperSize) => void }) {
  return <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
    <span>کاغذ</span>
    <select className="h-9 min-w-[145px] rounded-xl border border-slate-200 bg-white px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value as InvoicePaperSize)} aria-label="اندازه کاغذ این فاکتور">
      {INVOICE_PAPER_SIZES.map((paper) => <option key={paper.id} value={paper.id}>{paper.label}</option>)}
    </select>
  </label>;
}
