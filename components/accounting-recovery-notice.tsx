'use client';
import { useEffect, useState } from 'react';
import { accountingPersistenceErrorMessage, flushAccountingPersistence } from '@/lib/storage';
import { useAccountingStore } from '@/lib/store';
export function AccountingRecoveryNotice() {
  const [error, setError] = useState(accountingPersistenceErrorMessage);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => setError(accountingPersistenceErrorMessage());
    window.addEventListener('accounting:persistence-error', refresh);
    window.addEventListener('accounting:persistence-recovered', refresh);
    return () => { window.removeEventListener('accounting:persistence-error', refresh); window.removeEventListener('accounting:persistence-recovered', refresh); };
  }, []);
  if (!error) return null;
  return <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p>تغییرات ذخیره نشد: {error}</p><button type="button" disabled={busy} className="mt-2 font-bold underline disabled:opacity-50" onClick={async () => {
    setBusy(true);
    try { await useAccountingStore.persist.rehydrate(); await flushAccountingPersistence(); setError(''); }
    catch { setError(accountingPersistenceErrorMessage() || 'بارگذاری داده انجام نشد؛ اتصال سرور را بررسی کنید.'); }
    finally { setBusy(false); }
  }}>{busy ? 'در حال بارگذاری…' : 'بارگذاری دادهٔ تازه و تلاش دوباره'}</button></div>;
}
