'use client';
import { useShallow } from 'zustand/react/shallow';

import { usePersistedAction } from '@/hooks/use-persisted-action';
import { useWorkspacePreferences, type MenuPreset } from '@/hooks/use-workspace-preferences';

import { StorageBackupPanel } from '@/components/storage-backup-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';
import { YasImporterPanel } from '@/components/yas-importer-panel';
import { confirmDialog, notify } from '@/lib/feedback';
import { INVOICE_TEMPLATES } from '@/lib/invoice-templates';
import { clearApplicationDatabase } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
import type { BusinessSettings } from '@/lib/types';
import {
  Trash2
} from 'lucide-react';
import { useState } from 'react';

import { PageHead } from './shared';
export function SettingsView() {
  const submission = usePersistedAction();
  const { preferences, update: updatePreferences } = useWorkspacePreferences();
  const { settings, setSettings } = useAccountingStore(useShallow((state) => ({ settings: state.settings, setSettings: state.setSettings })));
  const [draft, setDraft] = useState(settings);


  const saveGlobalSettings = async () => {
    const result = await submission.run(() => setSettings({
      ...settings,
      currency: draft.currency,
      defaultTax: Number(draft.defaultTax || 0),
      numbering: draft.numbering,
      defaultInvoiceTemplateId: draft.defaultInvoiceTemplateId,
      defaultInvoicePaperSize: draft.defaultInvoicePaperSize || 'A4',
    }));
    if (result.ok) notify('تنظیمات ذخیره شد.', 'success');
  };

  const resetDatabase = async () => {
    const approved = await confirmDialog(
      'اسناد و تنظیمات حسابداری پاک می‌شوند. پیش از پاک‌سازی یک Snapshot کامل ساخته می‌شود؛ حساب مدیر و Snapshotها باقی می‌مانند. این عملیات را می‌توان با بازیابی Snapshot برگرداند.',
      { title: 'پاک‌کردن کل پایگاه داده', confirmLabel: 'پاک‌کردن و شروع دوباره', danger: true }
    );
    if (!approved) return;
    try {
      await clearApplicationDatabase();
      window.location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'پاک‌کردن پایگاه داده انجام نشد.', 'error');
    }
  };

  return <div className="space-y-5">
    <PageHead title="تنظیمات" subtitle="تنظیمات عمومی اسناد، شماره‌گذاری و نسخه پشتیبان" action={<Button disabled={submission.busy} onClick={() => void saveGlobalSettings()}>ذخیره تنظیمات عمومی</Button>} />
    <Card><CardHeader><CardTitle>تجربهٔ کاری این دستگاه</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Field label="چیدمان منو" description="فقط ترتیب میان‌برها تغییر می‌کند؛ همه امکانات در دسترس می‌مانند."><select className="h-10 rounded-xl border border-slate-200 bg-white px-3" value={preferences.menuPreset} onChange={(event) => updatePreferences({ menuPreset: event.target.value as MenuPreset })}><option value="services">خدمات و طراحی</option><option value="individual">فردی و فریلنسر</option><option value="retail">فروشگاهی</option></select></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preferences.reducedEffects} onChange={(event) => updatePreferences({ reducedEffects: event.target.checked })} />کاهش افکت‌های بصری و حرکت</label></CardContent></Card>
    {submission.error && <p role="alert" className="text-sm text-rose-600">{submission.error}</p>}
    <div className="grid gap-5 xl:grid-cols-[1fr_.72fr]">
      <Card>
        <CardHeader><CardTitle>تنظیمات عمومی اسناد</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="واحد پول"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'تومان' | 'ریال' })}><option value="تومان">تومان</option><option value="ریال">ریال</option></select></Field>
          <Field label="مالیات پیش‌فرض"><FormattedInput min={0} value={draft.defaultTax} onValueChange={(defaultTax) => setDraft({ ...draft, defaultTax })} /></Field>
          <Field label="اندازه پیش‌فرض کاغذ فاکتورهای جدید"><select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={draft.defaultInvoicePaperSize || 'A4'} onChange={(e) => setDraft({ ...draft, defaultInvoicePaperSize: e.target.value === 'A5' ? 'A5' : 'A4' })}><option value="A4">A4 · ۲۱۰ × ۲۹۷ میلی‌متر</option><option value="A5">A5 · ۱۴۸ × ۲۱۰ میلی‌متر</option></select></Field>
          <div className="sm:col-span-2">
            <div className="mb-2 text-sm font-bold text-slate-700">قالب پیش‌فرض فاکتورهای جدید</div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4" role="group" aria-label="انتخاب قالب پیش‌فرض فاکتور">
              {INVOICE_TEMPLATES.map((template) => <button
                key={template.id}
                type="button"
                aria-pressed={draft.defaultInvoiceTemplateId === template.id}
                onClick={() => setDraft({ ...draft, defaultInvoiceTemplateId: template.id })}
                className={'invoice-template-choice text-right ' + (draft.defaultInvoiceTemplateId === template.id ? 'invoice-template-choice-selected' : '')}
              >
                <InvoiceTemplateThumbnail templateId={template.id} />
                <span className="mt-2 block text-sm font-black">{template.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</span>
                {draft.defaultInvoiceTemplateId === template.id && <Badge className="mt-2 bg-sky-50 text-sky-700">پیش‌فرض</Badge>}
              </button>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">این انتخاب برای فاکتورهای تازه استفاده می‌شود. قالب فاکتورهای موجود جداگانه انتخاب می‌شود.</p>
          </div>
          <NumberingSettingsEditor draft={draft} onChange={setDraft} />
        </CardContent>
      </Card>

      <div className="space-y-5">
        <StorageBackupPanel />
        <YasImporterPanel />
        <Card><CardHeader><CardTitle className="text-rose-700">پاک‌کردن داده‌های حسابداری</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">پیش از پاک‌سازی یک Snapshot کامل ایجاد می‌شود. حساب مدیر و نسخه‌های پشتیبان حفظ می‌شوند.</p><Button variant="danger" onClick={resetDatabase}><Trash2 />پاک‌کردن و شروع دوباره</Button></CardContent></Card>
      </div>
    </div>
  </div>;
}
function InvoiceTemplateThumbnail({ templateId }: { templateId: (typeof INVOICE_TEMPLATES)[number]['id'] }) {
  return <span className={'invoice-template-thumbnail invoice-template-thumbnail-' + templateId} aria-hidden="true">
    <span className="invoice-template-thumbnail-heading" />
    <span className="invoice-template-thumbnail-meta"><i /><i /></span>
    <span className="invoice-template-thumbnail-row" />
    <span className="invoice-template-thumbnail-row short" />
    <span className="invoice-template-thumbnail-total" />
  </span>;
}
function NumberingSettingsEditor({ draft, onChange }: { draft: BusinessSettings; onChange: (settings: BusinessSettings) => void }) {
  const rows = [
    ['sale', 'فاکتور فروش'],
    ['purchase', 'فاکتور خرید'],
    ['receipt', 'دریافت'],
    ['payment', 'پرداخت'],
    ['check', 'چک'],
  ] as const;
  const update = (key: keyof BusinessSettings['numbering'], field: 'prefix' | 'next' | 'padding', value: string | number) => {
    onChange({
      ...draft,
      numbering: {
        ...draft.numbering,
        [key]: { ...draft.numbering[key], [field]: field === 'prefix' ? String(value) : Number(value) },
      },
    });
  };
  return <Panel variant="subtle" padding="sm" className="sm:col-span-2">
    <div className="mb-3 text-sm font-black">الگوی شماره‌گذاری اسناد</div>
    <div className="grid gap-2">
      {rows.map(([key, label]) => <div key={key} className="grid grid-cols-[1fr_.8fr_.7fr_.6fr] items-end gap-2">
        <div className="text-xs font-bold text-slate-600">{label}</div>
        <Field label="پیشوند"><Input value={draft.numbering[key].prefix} onChange={(e) => update(key, 'prefix', e.target.value)} /></Field>
        <Field label="شماره بعدی"><FormattedInput allowDecimal={false} min={1} value={draft.numbering[key].next} onValueChange={(value) => update(key, 'next', value)} /></Field>
        <Field label="تعداد رقم"><FormattedInput allowDecimal={false} min={1} max={12} value={draft.numbering[key].padding} onValueChange={(value) => update(key, 'padding', value)} /></Field>
      </div>)}
    </div>
  </Panel>;
}

