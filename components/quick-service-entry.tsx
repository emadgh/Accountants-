'use client';
import { useAsyncSubmission } from '@/hooks/use-persisted-action';
import { createGuestCustomer } from '@/lib/domain/customer';
import { useShallow } from 'zustand/react/shallow';

import { useAccountingNavigation } from '@/components/accounting-app';
import { AppNavbarContent } from '@/components/app-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { usePersistedAction } from '@/hooks/use-persisted-action';
import { notify } from '@/lib/feedback';
import { todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { Customer, Invoice, InvoiceItem } from '@/lib/types';
import { money, uid } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ServicePreset = { name: string; unit: string; unitPrice: number };
const PRESET_KEY = 'accounting-service-presets';

export function QuickServiceEntry() {
  const formSubmission = useAsyncSubmission();
  const submission = usePersistedAction();
  const store = useAccountingStore(useShallow((state) => ({ customers: state.customers, products: state.products, projects: state.projects, reserveDocumentNumber: state.reserveDocumentNumber, saveInvoiceDraft: state.saveInvoiceDraft, settings: state.settings, upsertCustomer: state.upsertCustomer })));
  const navigation = useAccountingNavigation();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('خدمت');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes] = useState('');
  const [presets, setPresets] = useState<ServicePreset[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'customer' | 'description' | 'quantity' | 'unitPrice', string>>>({});

  useEffect(() => {
    try { setPresets(JSON.parse(localStorage.getItem(PRESET_KEY) || '[]') as ServicePreset[]); }
    catch { setPresets([]); }
  }, []);

  const services = useMemo(() => store.products.filter((product) => product.kind === 'service' && !product.archived), [store.products]);
  const selectedCustomer = store.customers.find((customer) => customer.id === customerId);
  const projectChoices = store.projects.filter((project) => !customerId || project.customerId === customerId);
  const total = Number(quantity || 0) * Number(unitPrice || 0);

  const validateCustomer = () => {
    const error = newCustomer
      ? (!customerName.trim() ? 'نام مشتری را وارد کنید.' : '')
      : (!selectedCustomer ? 'یک مشتری انتخاب کنید.' : '');
    setFieldErrors((previous) => ({ ...previous, customer: error }));
    return !error;
  };

  const validateService = () => {
    const errors = {
      description: description.trim() ? '' : 'شرح خدمت را وارد کنید.',
      quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? '' : 'تعداد باید بزرگ‌تر از صفر باشد.',
      unitPrice: Number.isFinite(Number(unitPrice)) && Number(unitPrice) >= 0 ? '' : 'مبلغ واحد معتبر وارد کنید.',
    };
    setFieldErrors((previous) => ({ ...previous, ...errors }));
    return !Object.values(errors).some(Boolean);
  };

  const choosePreset = (value: string) => {
    setServiceId(value);
    const product = services.find((item) => item.id === value);
    if (product) { setDescription(product.name); setUnit(product.unit); setUnitPrice(String(product.salePrice)); return; }
    const preset = presets[Number(value.replace('preset:', ''))];
    if (preset) { setDescription(preset.name); setUnit(preset.unit); setUnitPrice(String(preset.unitPrice)); }
  };

  const savePreset = () => {
    if (!description.trim() || Number(unitPrice) <= 0) return notify('برای ذخیره ردیف آماده، شرح و مبلغ معتبر وارد کنید.', 'error');
    const next = [{ name: description.trim(), unit, unitPrice: Number(unitPrice) }, ...presets.filter((item) => item.name !== description.trim())].slice(0, 20);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    notify('ردیف خدمت برای دفعات بعد ذخیره شد.', 'success');
  };

  const resolveCustomer = (): Customer | null => {
    if (!newCustomer) return selectedCustomer || null;
    if (!customerName.trim()) return null;
    const customer = createGuestCustomer({ name: customerName, phone: customerPhone.trim(), kind: 'customer' });
    store.upsertCustomer(customer);
    setCustomerId(customer.id);
    setNewCustomer(false);
    return customer;
  };

  const createDraft = () => formSubmission.run(async () => {
    if (submission.busy) return;
    if (!validateCustomer() || !validateService()) return;
    const customer = resolveCustomer();
    if (!customer) return;
    const now = new Date().toISOString();
    const item: InvoiceItem = { id: uid('line'), ...(serviceId && services.some((product) => product.id === serviceId) ? { productId: serviceId } : {}), description: description.trim(), unit, qty: Number(quantity), unitPrice: Number(unitPrice), discount: 0 };
    const invoice: Invoice = {
      id: uid('invoice'), number: store.reserveDocumentNumber('sale'), businessProfileId: store.settings.defaultBusinessProfileId,
      templateId: store.settings.defaultInvoiceTemplateId, paperSize: store.settings.defaultInvoicePaperSize,
      kind: 'sale', status: 'draft', date, ...(dueDate ? { dueDate } : {}), customerId: customer.id,
      customerName: customer.name, customerPhone: customer.phone, customerAddress: customer.address,
      customerNationalId: customer.nationalId, customerEconomicCode: customer.economicCode, customerPostalCode: customer.postalCode,
      items: [item], discount: 0, tax: 0, shipping: 0, notes: notes.trim(), ...(projectId ? { projectId } : {}),
      createdAt: now, updatedAt: now,
    };
    const saved = await submission.run(() => store.saveInvoiceDraft(invoice));
    const result = saved.result;
    if (!saved.ok || !result) return notify(saved.message || 'ذخیره انجام نشد؛ اطلاعات حفظ شد.', 'error');
    if (!result.ok || !result.invoice) return notify(result.message || 'ساخت پیش‌نویس فاکتور انجام نشد.', 'error');
    notify('پیش‌نویس فاکتور آماده است؛ از صفحه بعد آن را قطعی و تسویه کنید.', 'success');
    navigation.viewInvoice(result.invoice.id, 'sale');
  });

  return <div className="space-y-5" dir="rtl">
    <AppNavbarContent title="ثبت سریع خدمت" subtitle="مشتری و شرح خدمت را وارد کنید؛ فاکتور همچنان از جریان عادی ثبت و دریافت استفاده می‌کند." />
    <div className="grid grid-cols-3 gap-2">{['مشتری', 'خدمت و مبلغ', 'سررسید و پیش‌نمایش'].map((label, index) => <button key={label} onClick={() => setStep(index)} className={`rounded-xl border px-3 py-3 text-xs font-bold ${step === index ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-500'}`}><span className="ml-1">{index + 1}.</span>{label}</button>)}</div>
    <Card><CardHeader><CardTitle>{['اطلاعات مشتری', 'ثبت خدمت', 'مرور و ادامه'][step]}</CardTitle></CardHeader><CardContent className="space-y-4">
      {step === 0 && <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2 flex gap-2"><Button variant={!newCustomer ? 'default' : 'outline'} onClick={() => { setNewCustomer(false); setFieldErrors((previous) => ({ ...previous, customer: '' })); }}>مشتری موجود</Button><Button variant={newCustomer ? 'default' : 'outline'} onClick={() => { setNewCustomer(true); setFieldErrors((previous) => ({ ...previous, customer: '' })); }}>مشتری جدید</Button></div>{newCustomer ? <><label className="space-y-1 text-xs font-bold">نام مشتری<Input value={customerName} onChange={(event) => { setCustomerName(event.target.value); setFieldErrors((previous) => ({ ...previous, customer: '' })); }} autoFocus />{fieldErrors.customer && <span role="alert" className="block text-rose-600">{fieldErrors.customer}</span>}</label><label className="space-y-1 text-xs font-bold">تلفن<Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label></> : <label className="space-y-1 text-xs font-bold sm:col-span-2">مشتری<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setFieldErrors((previous) => ({ ...previous, customer: '' })); }}><option value="">انتخاب مشتری</option>{store.customers.filter((customer) => customer.kind !== 'supplier').map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone && `· ${customer.phone}`}</option>)}</select>{fieldErrors.customer && <span role="alert" className="block text-rose-600">{fieldErrors.customer}</span>}</label>}</div>}
      {step === 1 && <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold sm:col-span-2">ردیف آماده یا خدمت فهرست<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={serviceId} onChange={(event) => choosePreset(event.target.value)}><option value="">شرح دستی</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {money(service.salePrice)}</option>)}{presets.map((preset, index) => <option key={`${preset.name}-${index}`} value={`preset:${index}`}>{preset.name} · {money(preset.unitPrice)} (ردیف آماده)</option>)}</select></label><label className="space-y-1 text-xs font-bold sm:col-span-2">شرح خدمت<Input value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((previous) => ({ ...previous, description: '' })); }} />{fieldErrors.description && <span role="alert" className="block text-rose-600">{fieldErrors.description}</span>}</label><label className="space-y-1 text-xs font-bold">واحد<Input value={unit} onChange={(event) => setUnit(event.target.value)} /></label><label className="space-y-1 text-xs font-bold">تعداد<Input type="number" min="0.01" step="any" value={quantity} onChange={(event) => { setQuantity(event.target.value); setFieldErrors((previous) => ({ ...previous, quantity: '' })); }} />{fieldErrors.quantity && <span role="alert" className="block text-rose-600">{fieldErrors.quantity}</span>}</label><label className="space-y-1 text-xs font-bold">مبلغ واحد<Input type="number" min="0" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setFieldErrors((previous) => ({ ...previous, unitPrice: '' })); }} />{fieldErrors.unitPrice && <span role="alert" className="block text-rose-600">{fieldErrors.unitPrice}</span>}</label><div className="flex items-end"><Button variant="outline" onClick={savePreset}><Sparkles className="h-4 w-4" /> ذخیره به‌عنوان ردیف آماده</Button></div></div>}
      {step === 2 && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold">تاریخ فاکتور<JalaliDatePicker value={date} onChange={setDate} /></label><label className="space-y-1 text-xs font-bold">موعد دریافت (اختیاری)<JalaliDatePicker value={dueDate} onChange={setDueDate} placeholder="بدون سررسید" /></label><label className="space-y-1 text-xs font-bold sm:col-span-2">پرونده پروژه (اختیاری)<select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">بدون اتصال به پروژه</option>{projectChoices.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label className="space-y-1 text-xs font-bold sm:col-span-2">یادداشت<Input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><div className="rounded-2xl bg-slate-50 p-4"><div className="flex justify-between text-sm"><span>{description || 'خدمت'} × {quantity}</span><b>{money(total)} {store.settings.currency}</b></div><div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">{newCustomer ? (customerName || 'مشتری جدید') : selectedCustomer?.name || 'مشتری انتخاب نشده'} · فاکتور پس از بررسی در صفحه بعد قطعی می‌شود و می‌توانید دریافت را ثبت کنید.</div></div></div>}
      <div className="flex justify-between border-t border-slate-100 pt-4"><Button variant="outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowRight className="h-4 w-4" /> قبلی</Button>{step < 2 ? <Button onClick={() => { if ((step === 0 && validateCustomer()) || (step === 1 && validateService())) setStep((value) => value + 1); }}>ادامه <ArrowLeft className="h-4 w-4" /></Button> : <Button disabled={submission.busy || formSubmission.busy} onClick={() => void createDraft()}><Check className="h-4 w-4" /> ساخت پیش‌نویس و ادامه</Button>}</div>
    </CardContent></Card>
  </div>;
}
