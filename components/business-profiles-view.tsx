'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, Plus, Trash2, Upload } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { BusinessProfile } from '@/lib/types';
import { uid } from '@/lib/utils';
import { validateOfficialFields } from '@/lib/standards';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmDialog, notify } from '@/lib/feedback';

export function BusinessProfilesView() {
  const {
    settings,
    upsertBusinessProfile,
    deleteBusinessProfile,
    setDefaultBusinessProfile,
  } = useAccountingStore();
  const [selectedProfileId, setSelectedProfileId] = useState(settings.defaultBusinessProfileId);
  const selectedProfile = settings.businessProfiles.find((profile) => profile.id === selectedProfileId)
    || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
    || settings.businessProfiles[0];
  const [profileDraft, setProfileDraft] = useState<BusinessProfile>(() => structuredClone(selectedProfile));

  useEffect(() => {
    const profile = settings.businessProfiles.find((item) => item.id === selectedProfileId);
    // A new profile is intentionally kept as a local draft until the user saves it.
    if (profile) setProfileDraft(structuredClone(profile));
  }, [selectedProfileId, settings.businessProfiles]);

  const loadSignature = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('فایل امضا باید تصویر باشد.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify('حجم تصویر امضا حداکثر ۲ مگابایت باشد.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileDraft((current) => ({ ...current, signatureImage: reader.result as string, showSignature: current.showSignature !== false }));
      }
    };
    reader.onerror = () => notify('خواندن تصویر امضا انجام نشد.', 'error');
    reader.readAsDataURL(file);
  };

  const newProfile = () => {
    const base = selectedProfile || settings.businessProfiles[0];
    const profile: BusinessProfile = {
      ...(base || {
        businessName: '', ownerName: '', phone: '', address: '', nationalId: '', economicCode: '', postalCode: '',
        cardNumber: '', iban: '', bankName: '', invoiceTitle: 'فاکتور فروش', footer: '',
      }),
      id: uid('business'),
      label: 'پروفایل جدید',
    };
    setSelectedProfileId(profile.id);
    setProfileDraft(profile);
  };

  const saveProfile = () => {
    if (!profileDraft.label.trim() || !profileDraft.businessName.trim()) {
      notify('عنوان پروفایل و نام کسب‌وکار الزامی است.', 'warning');
      return;
    }
    const errors = validateOfficialFields(profileDraft);
    if (errors.length) {
      notify(errors.join('\n'), 'error');
      return;
    }
    const result = upsertBusinessProfile(profileDraft);
    if (!result.ok) {
      notify(result.message || 'ذخیره پروفایل انجام نشد.', 'error');
      return;
    }
    setSelectedProfileId(profileDraft.id);
  };

  const makeDefault = () => {
    const result = setDefaultBusinessProfile(profileDraft.id);
    if (!result.ok) notify(result.message || 'تغییر پروفایل پیش‌فرض انجام نشد.', 'error');
  };

  const removeProfile = async () => {
    if (!(await confirmDialog('این پروفایل حذف شود؟', { title: 'حذف پروفایل', confirmLabel: 'حذف', danger: true }))) return;
    const result = deleteBusinessProfile(profileDraft.id);
    if (!result.ok) {
      notify(result.message || 'حذف پروفایل انجام نشد.', 'error');
      return;
    }
    setSelectedProfileId(settings.defaultBusinessProfileId);
  };

  return <div className="space-y-5">
    <PageHead title="پروفایل‌های اطلاعات کسب‌وکار" subtitle="مدیریت هویت و اطلاعات چاپی صادرکنندهٔ فاکتور" />
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-600" /> پروفایل‌های صادرکننده</CardTitle>
          <div className="mt-1 text-xs text-slate-500">این پروفایل‌ها هویت، تماس و اطلاعات بانکی چاپ فاکتور را تعیین می‌کنند؛ مشتری، کالا، انبار و شماره‌گذاری مشترک می‌مانند.</div>
        </div>
        <Button onClick={newProfile}><Plus className="h-4 w-4" /> پروفایل جدید</Button>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {settings.businessProfiles.map((profile) => <button
            key={profile.id}
            type="button"
            onClick={() => setSelectedProfileId(profile.id)}
            className={'w-full rounded-xl border p-3 text-right transition ' + (selectedProfileId === profile.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50')}
          >
            <div className="flex items-center justify-between gap-2"><span className="font-black">{profile.label}</span>{profile.id === settings.defaultBusinessProfileId && <Badge className="bg-emerald-50 text-emerald-700">پیش‌فرض</Badge>}</div>
            <div className="mt-1 truncate text-xs text-slate-500">{profile.businessName || 'بدون نام کسب‌وکار'}</div>
          </button>)}
        </div>

        {profileDraft && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="عنوان پروفایل *"><Input value={profileDraft.label} onChange={(e) => setProfileDraft({ ...profileDraft, label: e.target.value })} /></Field>
          <Field label="نام کسب‌وکار *"><Input value={profileDraft.businessName} onChange={(e) => setProfileDraft({ ...profileDraft, businessName: e.target.value })} /></Field>
          <Field label="نام صاحب حساب"><Input value={profileDraft.ownerName} onChange={(e) => setProfileDraft({ ...profileDraft, ownerName: e.target.value })} /></Field>
          <Field label="تلفن"><Input dir="rtl" value={profileDraft.phone} onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })} /></Field>
          <Field label="شناسه ملی / کد ملی"><Input value={profileDraft.nationalId} onChange={(e) => setProfileDraft({ ...profileDraft, nationalId: e.target.value })} /></Field>
          <Field label="کد اقتصادی"><Input value={profileDraft.economicCode} onChange={(e) => setProfileDraft({ ...profileDraft, economicCode: e.target.value })} /></Field>
          <Field label="کد پستی"><Input value={profileDraft.postalCode} onChange={(e) => setProfileDraft({ ...profileDraft, postalCode: e.target.value })} /></Field>
          <Field label="نام بانک"><Input value={profileDraft.bankName} onChange={(e) => setProfileDraft({ ...profileDraft, bankName: e.target.value })} /></Field>
          <Field label="شماره کارت"><Input dir="rtl" value={profileDraft.cardNumber} onChange={(e) => setProfileDraft({ ...profileDraft, cardNumber: e.target.value })} /></Field>
          <Field label="شماره شبا"><Input dir="rtl" value={profileDraft.iban} onChange={(e) => setProfileDraft({ ...profileDraft, iban: e.target.value })} /></Field>
          <Field label="عنوان فاکتور فروش"><Input value={profileDraft.invoiceTitle} onChange={(e) => setProfileDraft({ ...profileDraft, invoiceTitle: e.target.value })} /></Field>
          <Field label="آدرس" className="sm:col-span-2"><Textarea value={profileDraft.address} onChange={(e) => setProfileDraft({ ...profileDraft, address: e.target.value })} /></Field>
          <Field label="پاورقی فاکتور" className="sm:col-span-2"><Textarea value={profileDraft.footer} onChange={(e) => setProfileDraft({ ...profileDraft, footer: e.target.value })} /></Field>
          <Field label="تصویر امضا" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
              <div className="grid h-24 w-40 place-items-center overflow-hidden rounded-lg bg-slate-50">
                {profileDraft.signatureImage ? <img src={profileDraft.signatureImage} alt="پیش‌نمایش امضا" className="max-h-20 max-w-36 object-contain" /> : <span className="text-xs text-slate-400">بدون امضا</span>}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> {profileDraft.signatureImage ? 'جایگزینی تصویر' : 'آپلود تصویر'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { loadSignature(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                </label>
                {profileDraft.signatureImage && <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => setProfileDraft({ ...profileDraft, signatureImage: undefined })}><Trash2 className="h-4 w-4" /> حذف امضا</Button>}
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={profileDraft.showSignature !== false} onChange={(e) => setProfileDraft({ ...profileDraft, showSignature: e.target.checked })} /> نمایش امضا روی فاکتور</label>
              </div>
            </div>
          </Field>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            {profileDraft.id !== settings.defaultBusinessProfileId && <Button variant="outline" onClick={makeDefault}>انتخاب به‌عنوان پیش‌فرض</Button>}
            {settings.businessProfiles.some((profile) => profile.id === profileDraft.id) && <Button variant="danger" onClick={removeProfile}><Trash2 className="h-4 w-4" /> حذف</Button>}
            <Button onClick={saveProfile}><Check className="h-4 w-4" /> ذخیره پروفایل</Button>
          </div>
        </div>}
      </CardContent>
    </Card>
  </div>;
}

function PageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h1 className="text-2xl font-black text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={'space-y-1.5 ' + className}><span className="block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}
