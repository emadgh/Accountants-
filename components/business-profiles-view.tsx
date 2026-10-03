'use client';
import { useShallow } from 'zustand/react/shallow';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Check, Plus, Trash2, Upload } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { BusinessProfile } from '@/lib/types';
import { uid } from '@/lib/utils';
import { validateOfficialFields } from '@/lib/standards';
import { persistOperation } from '@/lib/operation-result';
import { flushAccountingPersistence } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { confirmDialog, notify } from '@/lib/feedback';
import { AppNavbarContent } from '@/components/app-navbar';

export function BusinessProfilesView() {
  const { settings,
    createBusinessProfile,
    upsertBusinessProfile,
    deleteBusinessProfile,
    setDefaultBusinessProfile, } = useAccountingStore(useShallow((state) => ({ settings: state.settings, createBusinessProfile: state.createBusinessProfile, upsertBusinessProfile: state.upsertBusinessProfile, deleteBusinessProfile: state.deleteBusinessProfile, setDefaultBusinessProfile: state.setDefaultBusinessProfile })));
  const [selectedProfileId, setSelectedProfileId] = useState(settings.defaultBusinessProfileId);
  const [newProfileDraft, setNewProfileDraft] = useState<BusinessProfile | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const retainedDraftId = useRef<string | null>(null);
  const lastSelectedProfileId = useRef(selectedProfileId);
  const isCreatingProfile = newProfileDraft?.id === selectedProfileId;
  const profileTabListRef = useRef<HTMLDivElement>(null);
  const selectedProfile = settings.businessProfiles.find((profile) => profile.id === selectedProfileId)
    || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
    || settings.businessProfiles[0];
  const [profileDraft, setProfileDraft] = useState<BusinessProfile>(() => structuredClone(selectedProfile));

  useEffect(() => {
    if (lastSelectedProfileId.current !== selectedProfileId) {
      lastSelectedProfileId.current = selectedProfileId;
      retainedDraftId.current = null;
    }
    if (retainedDraftId.current === selectedProfileId) return;
    const profile = settings.businessProfiles.find((item) => item.id === selectedProfileId);
    // A new profile is intentionally kept as a local draft until the user saves it.
    if (profile) setProfileDraft(structuredClone(profile));
  }, [selectedProfileId, settings.businessProfiles]);

  const updateProfileDraft = (values: Partial<BusinessProfile>) => {
    setProfileSaveError(null);
    setProfileDraft((current) => ({ ...current, ...values }));
    if (isCreatingProfile) setNewProfileDraft((current) => current ? { ...current, ...values } : current);
  };

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
    const targetProfileId = profileDraft.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const values = { signatureImage: reader.result as string, showSignature: profileDraft.showSignature !== false };
        setProfileDraft((current) => current.id === targetProfileId ? { ...current, ...values } : current);
        setNewProfileDraft((current) => current?.id === targetProfileId ? { ...current, ...values } : current);
      }
    };
    reader.onerror = () => notify('خواندن تصویر امضا انجام نشد.', 'error');
    reader.readAsDataURL(file);
  };

  const loadLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('فایل لوگو باید تصویر باشد.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify('حجم لوگو حداکثر ۲ مگابایت باشد.', 'error');
      return;
    }
    const targetProfileId = profileDraft.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const values = { logoImage: reader.result as string };
        setProfileDraft((current) => current.id === targetProfileId ? { ...current, ...values } : current);
        setNewProfileDraft((current) => current?.id === targetProfileId ? { ...current, ...values } : current);
      }
    };
    reader.onerror = () => notify('خواندن تصویر لوگو انجام نشد.', 'error');
    reader.readAsDataURL(file);
  };

  const newProfile = () => {
    if (newProfileDraft) {
      setSelectedProfileId(newProfileDraft.id);
      setProfileDraft(newProfileDraft);
      return;
    }
    const baseProfileId = uid('business');
    const existingProfileIds = new Set(settings.businessProfiles.map((profile) => profile.id));
    let profileId = baseProfileId;
    let suffix = 2;
    while (existingProfileIds.has(profileId)) profileId = `${baseProfileId}_${suffix++}`;
    const profile: BusinessProfile = {
      id: profileId,
      label: 'پروفایل جدید',
      businessName: '',
      ownerName: '',
      phone: '',
      address: '',
      nationalId: '',
      economicCode: '',
      postalCode: '',
      cardNumber: '',
      iban: '',
      bankName: '',
      invoiceTitle: 'فاکتور فروش',
      footer: '',
    };
    setNewProfileDraft(profile);
    setSelectedProfileId(profile.id);
    setProfileDraft(profile);
  };

  const saveProfile = async () => {
    if (isSavingProfile) return;
    if (!profileDraft.label.trim() || !profileDraft.businessName.trim()) {
      notify('عنوان پروفایل و نام کسب‌وکار الزامی است.', 'warning');
      return;
    }
    const errors = validateOfficialFields(profileDraft, { cardNumberValidation: 'format' });
    if (errors.length) {
      notify(errors.join('\n'), 'error');
      return;
    }
    setProfileSaveError(null);
    setIsSavingProfile(true);
    let savedProfile = profileDraft;
    const creatingProfile = isCreatingProfile;
    try {
      if (creatingProfile) {
        const result = createBusinessProfile(profileDraft);
        if (!result.ok) {
          notify(result.message || 'ثبت کسب‌وکار جدید انجام نشد.', 'error');
          return;
        }
        savedProfile = result.profile || profileDraft;
      } else {
        const result = upsertBusinessProfile(profileDraft);
        if (!result.ok) {
          notify(result.message || 'ذخیره پروفایل انجام نشد.', 'error');
          return;
        }
      }

      await flushAccountingPersistence();
      retainedDraftId.current = null;
      if (creatingProfile) setNewProfileDraft(null);
      setSelectedProfileId(savedProfile.id);
      setProfileDraft(savedProfile);
      notify(creatingProfile ? 'کسب‌وکار جدید ثبت شد.' : 'پروفایل کسب‌وکار ذخیره شد.', 'success');
    } catch (error) {
      retainedDraftId.current = profileDraft.id;
      setProfileDraft(profileDraft);
      const detail = error instanceof Error ? ` ${error.message}` : '';
      setProfileSaveError(creatingProfile
        ? `ذخیره در پایگاه‌داده انجام نشد؛ پیش‌نویس کسب‌وکار حفظ شده است.${detail}`
        : `ذخیره در پایگاه‌داده انجام نشد.${detail}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const makeDefault = async () => {
    if (isCreatingProfile) return;
    const result = await persistOperation(() => setDefaultBusinessProfile(profileDraft.id));
    if (!result.ok) notify(result.message || 'تغییر پروفایل پیش‌فرض انجام نشد.', 'error');
  };

  const removeProfile = async () => {
    if (!(await confirmDialog('این پروفایل حذف شود؟', { title: 'حذف پروفایل', confirmLabel: 'حذف', danger: true }))) return;
    const result = await persistOperation(() => deleteBusinessProfile(profileDraft.id));
    if (!result.ok) {
      notify(result.message || 'حذف پروفایل انجام نشد.', 'error');
      return;
    }
    setSelectedProfileId(settings.defaultBusinessProfileId);
  };

  const discardNewProfile = () => {
    const isDraftActive = newProfileDraft?.id === selectedProfileId;
    const fallbackProfile = settings.businessProfiles.find((profile) => profile.id === selectedProfileId)
      || settings.businessProfiles.find((profile) => profile.id === settings.defaultBusinessProfileId)
      || settings.businessProfiles[0];
    setNewProfileDraft(null);
    if (isDraftActive && fallbackProfile) {
      setSelectedProfileId(fallbackProfile.id);
      setProfileDraft(structuredClone(fallbackProfile));
    }
  };

  const handleProfileTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const tabs = Array.from(profileTabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || []);
    if (!tabs.length) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return <div className="space-y-5">
    <PageHead
      title="پروفایل‌های اطلاعات کسب‌وکار"
      subtitle="مدیریت هویت و اطلاعات چاپی صادرکنندهٔ فاکتور"
      action={<>
        <Button onClick={newProfile} disabled={!!newProfileDraft || isSavingProfile}><Plus className="h-4 w-4" /> پروفایل جدید</Button>
        {newProfileDraft && <Button variant="outline" onClick={discardNewProfile} disabled={isSavingProfile}>لغو پیش‌نویس</Button>}
        {profileDraft && !isCreatingProfile && profileDraft.id !== settings.defaultBusinessProfileId && <Button variant="outline" onClick={makeDefault} disabled={isSavingProfile}>انتخاب به‌عنوان پیش‌فرض</Button>}
        {profileDraft && settings.businessProfiles.some((profile) => profile.id === profileDraft.id) && <Button variant="danger" onClick={removeProfile} disabled={isSavingProfile}><Trash2 className="h-4 w-4" /> حذف</Button>}
        {profileDraft && <Button onClick={saveProfile} disabled={isSavingProfile}><Check className="h-4 w-4" /> {isSavingProfile ? 'در حال ذخیره…' : isCreatingProfile ? 'ثبت کسب‌وکار جدید' : 'ذخیره پروفایل'}</Button>}
      </>}
    />
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-600" /> پروفایل‌های صادرکننده</CardTitle>
          <div className="mt-1 text-xs text-slate-500">این پروفایل‌ها هویت، تماس و اطلاعات بانکی چاپ فاکتور را تعیین می‌کنند؛ مشتری، کالا، انبار و شماره‌گذاری مشترک می‌مانند.</div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <div ref={profileTabListRef} role="tablist" aria-orientation="vertical" aria-label="انتخاب پروفایل کسب‌وکار" className="space-y-2">
          {newProfileDraft && <button
            id="business-profile-tab-new"
            type="button"
            role="tab"
            aria-selected={selectedProfileId === newProfileDraft.id}
            aria-controls="business-profile-panel"
            aria-label={`${newProfileDraft.label || 'پروفایل جدید'}، NEW، ذخیره نشده`}
            tabIndex={selectedProfileId === newProfileDraft.id ? 0 : -1}
            disabled={isSavingProfile}
            data-business-profile-tab
            onClick={() => { setSelectedProfileId(newProfileDraft.id); setProfileDraft(newProfileDraft); }}
            onKeyDown={(event) => handleProfileTabKeyDown(event, 0)}
            className={'w-full rounded-xl border border-r-4 p-3 text-right transition ' + (selectedProfileId === newProfileDraft.id ? 'border-amber-300 border-r-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-100' : 'border-amber-200 border-r-amber-400 bg-amber-50/60 hover:bg-amber-50')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-black">{newProfileDraft.label || 'پروفایل جدید'}</span>
              <span className="flex items-center gap-1"><Badge className="bg-sky-100 text-sky-700">NEW</Badge><span aria-hidden="true" className="text-lg font-black text-amber-600">*</span></span>
            </div>
            <div className="mt-1 truncate text-xs text-slate-600">{newProfileDraft.businessName || 'در حال تکمیل اطلاعات'}</div>
            <div className="mt-2 text-[10px] font-bold text-amber-700">* ذخیره‌نشده</div>
          </button>}
          {settings.businessProfiles.map((profile, index) => {
            const isSelected = selectedProfileId === profile.id;
            const tabIndex = index + (newProfileDraft ? 1 : 0);
            return <button
              key={profile.id}
              id={`business-profile-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="business-profile-panel"
              aria-label={`${profile.label}${profile.id === settings.defaultBusinessProfileId ? '، پیش‌فرض' : ''}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={isSavingProfile}
              data-business-profile-tab
              onClick={() => setSelectedProfileId(profile.id)}
              onKeyDown={(event) => handleProfileTabKeyDown(event, tabIndex)}
              className={'w-full rounded-xl border border-r-4 p-3 text-right transition ' + (isSelected ? 'border-sky-300 border-r-sky-600 bg-sky-50 shadow-sm ring-1 ring-sky-100' : 'border-slate-200 border-r-transparent bg-white hover:border-sky-200 hover:bg-slate-50')}
            >
              <div className="flex items-center justify-between gap-2"><span className="font-black">{profile.label}</span>{profile.id === settings.defaultBusinessProfileId && <Badge className="bg-emerald-50 text-emerald-700">پیش‌فرض</Badge>}</div>
              <div className="mt-1 truncate text-xs text-slate-500">{profile.businessName || 'بدون نام کسب‌وکار'}</div>
            </button>;
          })}
        </div>

        {profileDraft && <fieldset
          id="business-profile-panel"
          role="tabpanel"
          tabIndex={0}
          disabled={isSavingProfile}
          aria-busy={isSavingProfile}
          aria-labelledby={newProfileDraft?.id === selectedProfileId ? 'business-profile-tab-new' : `business-profile-tab-${Math.max(0, settings.businessProfiles.findIndex((profile) => profile.id === selectedProfileId))}`}
          className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 sm:grid-cols-2"
        >
          {isCreatingProfile && <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><span>پیش‌نویس کسب‌وکار جدید</span><span>ذخیره‌نشده *</span></div>}
          {profileSaveError && <div role="alert" className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{profileSaveError}</div>}
          <Field label="عنوان پروفایل *"><Input value={profileDraft.label} onChange={(e) => updateProfileDraft({ label: e.target.value })} /></Field>
          <Field label="نام کسب‌وکار *"><Input value={profileDraft.businessName} onChange={(e) => updateProfileDraft({ businessName: e.target.value })} /></Field>
          <Field label="نام صاحب حساب"><Input value={profileDraft.ownerName} onChange={(e) => updateProfileDraft({ ownerName: e.target.value })} /></Field>
          <Field label="تلفن"><Input dir="rtl" value={profileDraft.phone} onChange={(e) => updateProfileDraft({ phone: e.target.value })} /></Field>
          <Field label="شناسه ملی / کد ملی"><FormattedInput format="nationalId" value={profileDraft.nationalId} onValueChange={(nationalId) => updateProfileDraft({ nationalId })} /></Field>
          <Field label="کد اقتصادی"><FormattedInput format="economicCode" value={profileDraft.economicCode} onValueChange={(economicCode) => updateProfileDraft({ economicCode })} /></Field>
          <Field label="کد پستی"><FormattedInput format="postalCode" value={profileDraft.postalCode} onValueChange={(postalCode) => updateProfileDraft({ postalCode })} /></Field>
          <Field label="نام بانک"><Input value={profileDraft.bankName} onChange={(e) => updateProfileDraft({ bankName: e.target.value })} /></Field>
          <Field label="شماره کارت"><FormattedInput format="card" value={profileDraft.cardNumber} onValueChange={(cardNumber) => updateProfileDraft({ cardNumber })} /></Field>
          <Field label="شماره شبا"><FormattedInput format="iban" value={profileDraft.iban} onValueChange={(iban) => updateProfileDraft({ iban })} /></Field>
          <Field label="عنوان فاکتور فروش"><Input value={profileDraft.invoiceTitle} onChange={(e) => updateProfileDraft({ invoiceTitle: e.target.value })} /></Field>
          <Field label="آدرس" className="sm:col-span-2"><Textarea value={profileDraft.address} onChange={(e) => updateProfileDraft({ address: e.target.value })} /></Field>
          <Field label="پاورقی فاکتور" className="sm:col-span-2"><Textarea value={profileDraft.footer} onChange={(e) => updateProfileDraft({ footer: e.target.value })} /></Field>
          <Field label="لوگوی کسب‌وکار" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
              <div className="grid h-20 w-36 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                {profileDraft.logoImage ? <img src={profileDraft.logoImage} alt="پیش‌نمایش لوگوی کسب‌وکار" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">بدون لوگو</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> {profileDraft.logoImage ? 'جایگزینی لوگو' : 'آپلود لوگو'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => { loadLogo(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                </label>
                {profileDraft.logoImage && <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => updateProfileDraft({ logoImage: undefined })}><Trash2 className="h-4 w-4" /> حذف لوگو</Button>}
              </div>
            </div>
          </Field>
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
                {profileDraft.signatureImage && <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => updateProfileDraft({ signatureImage: undefined })}><Trash2 className="h-4 w-4" /> حذف امضا</Button>}
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={profileDraft.showSignature !== false} onChange={(e) => updateProfileDraft({ showSignature: e.target.checked })} /> نمایش امضا روی فاکتور</label>
              </div>
            </div>
          </Field>
        </fieldset>}
      </CardContent>
    </Card>
  </div>;
}

function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <AppNavbarContent title={title} subtitle={subtitle} actions={action} />;
}
