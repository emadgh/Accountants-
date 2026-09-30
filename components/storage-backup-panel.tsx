'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { AccountingData } from '@/lib/types';
import { parseAccountingBackupFile, type AccountingBackupPreview } from '@/lib/backup';
import {
  createAccountingSnapshot,
  deleteAccountingSnapshot,
  getAccountingStorageInfo,
  importAccountingData,
  listAccountingSnapshots,
  restoreAccountingSnapshot,
  downloadAccountingArchive,
  importAccountingArchive,
  type AccountingSnapshotMeta,
} from '@/lib/storage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmDialog, notify } from '@/lib/feedback';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ImportCandidate = {
  data: AccountingData;
  preview: AccountingBackupPreview;
  filename: string;
  file: File;
  packaged: boolean;
};

function formatBytes(value: number) {
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function reasonLabel(reason: AccountingSnapshotMeta['reason']) {
  if (reason === 'auto') return 'خودکار';
  if (reason === 'manual') return 'دستی';
  if (reason === 'before-import') return 'قبل از Import';
  if (reason === 'before-restore') return 'قبل از Restore';
  return 'مهاجرت';
}

export function StorageBackupPanel() {
  const store = useAccountingStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [snapshots, setSnapshots] = useState<AccountingSnapshotMeta[]>([]);
  const [storageInfo, setStorageInfo] = useState<{ backend: string; payloadSize: number; snapshotCount: number; schemaVersion: number } | null>(null);
  const [candidate, setCandidate] = useState<ImportCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [items, info] = await Promise.all([
      listAccountingSnapshots(),
      getAccountingStorageInfo(),
    ]);
    setSnapshots(items);
    setStorageInfo(info);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const exportData = async () => {
    setBusy(true);
    try {
      const blob = await downloadAccountingArchive();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'accountants-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const selectImportFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseAccountingBackupFile(file);
      setCandidate({ ...parsed, filename: file.name, file });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'فایل پشتیبان معتبر نیست.', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      if (candidate.packaged) await importAccountingArchive(candidate.file);
      else await importAccountingData(candidate.data);
      store.replaceAll(candidate.data);
      setCandidate(null);
      notify('پشتیبان بازیابی شد. نسخه قبل از Import در Snapshotهای محلی نگهداری شد.', 'success');
      window.setTimeout(() => void refresh(), 200);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'بازیابی پشتیبان انجام نشد.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createSnapshot = async () => {
    setBusy(true);
    try {
      const id = await createAccountingSnapshot('manual');
      if (!id) {
        notify('Snapshot در فایل دیتابیس در دسترس نیست.', 'warning');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const restoreSnapshot = async (snapshot: AccountingSnapshotMeta) => {
    if (!(await confirmDialog('Snapshot انتخاب‌شده جایگزین داده فعلی شود؟ قبل از Restore یک Snapshot از وضعیت فعلی ساخته می‌شود.', { title: 'Restore Snapshot', confirmLabel: 'Restore', danger: true }))) return;
    setBusy(true);
    try {
      await restoreAccountingSnapshot(snapshot.id);
      window.location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Restore انجام نشد.', 'error');
      setBusy(false);
    }
  };

  const removeSnapshot = async (snapshot: AccountingSnapshotMeta) => {
    if (!(await confirmDialog('این Snapshot محلی حذف شود؟', { title: 'حذف Snapshot', confirmLabel: 'حذف', danger: true }))) return;
    setBusy(true);
    try {
      await deleteAccountingSnapshot(snapshot.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-sky-600" /> ذخیره‌سازی و پشتیبان</CardTitle>
          <div className="mt-1 text-xs text-slate-500">داده اصلی و Snapshotها در فایل data/accountants.sqlite3 روی دیسک پروژه نگهداری می‌شوند.</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard size="sm" title="Backend" value={storageInfo?.backend || '...'} rolling={false} tone="info" />
          <MetricCard size="sm" title="Schema" value={storageInfo ? `v${storageInfo.schemaVersion}` : '—'} rolling={false} />
          <MetricCard size="sm" title="حجم داده Persist" value={formatBytes(storageInfo?.payloadSize || 0)} rolling={false} tone="purple" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={busy} onClick={() => void exportData()}><ArrowDownToLine className="h-4 w-4" /> دانلود Backup نسخه‌دار</Button>
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><ArrowUpFromLine className="h-4 w-4" /> Import و Preview</Button>
          <input ref={fileRef} type="file" className="hidden" accept="application/json,.json,application/zip,.zip" onChange={(event) => void selectImportFile(event.target.files?.[0])} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <div className="text-sm font-black">Snapshotهای محلی</div>
              <div className="mt-1 text-xs text-slate-500">Snapshot خودکار حداکثر هر ۶ ساعت قبل از تغییر بعدی داخل فایل دیتابیس ساخته می‌شود؛ حداکثر ۱۵ نسخه نگهداری می‌شود.</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" disabled={busy} onClick={() => void refresh()} title="بروزرسانی"><RefreshCw className="h-4 w-4" /></Button>
            <Button size="sm" disabled={busy} onClick={() => void createSnapshot()}><HardDriveDownload className="h-4 w-4" /> Snapshot الآن</Button>
          </div>
        </div>

        <div className="max-h-72 space-y-2 overflow-auto">
          {snapshots.map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <div className="flex items-center gap-2"><span className="text-sm font-bold">{new Date(snapshot.createdAt).toLocaleString('fa-IR')}</span><Badge>{reasonLabel(snapshot.reason)}</Badge></div>
              <div className="mt-1 text-[11px] text-slate-400">{formatBytes(snapshot.size)}</div>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void restoreSnapshot(snapshot)}><RotateCcw className="h-4 w-4" /> Restore</Button>
              <Button variant="ghost" size="icon" className="text-rose-600" disabled={busy} onClick={() => void removeSnapshot(snapshot)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>)}
          {!snapshots.length && <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">هنوز Snapshot محلی ایجاد نشده است.</div>}
        </div>
      </CardContent>
    </Card>

    <Dialog open={!!candidate} onOpenChange={(open) => !open && !busy && setCandidate(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Preview بازیابی Backup</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">قبل از جایگزینی داده‌ها، محتوا و نسخه فایل بررسی شده است. وضعیت فعلی نیز Snapshot می‌شود.</DialogDescription>
        </DialogHeader>
        {candidate && <div className="space-y-4">
          <Panel variant="subtle" padding="sm">
            <div className="font-black">{candidate.filename}</div>
            <div className="mt-1 text-xs text-slate-500">{candidate.preview.source === 'legacy' ? 'Backup قدیمی' : 'Backup نسخه‌دار'} · Schema v{candidate.preview.schemaVersion || 0}{candidate.preview.checksumVerified === true ? ' · Checksum تایید شد' : ''}</div>
          </Panel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['مشتری', candidate.preview.customers], ['کالا/خدمت', candidate.preview.products], ['فاکتور', candidate.preview.invoices], ['پیش‌فاکتور', candidate.preview.quotes], ['پروژه', candidate.preview.projects], ['پیوست', candidate.preview.attachments], ['پرداخت', candidate.preview.payments], ['پروفایل', candidate.preview.businessProfiles]].map(([label, value]) => <MetricCard key={String(label)} size="sm" title={String(label)} value={Number(value)} align="center" />)}
          </div>
          {!!candidate.preview.warnings.length && <Alert className="rounded-xl border-amber-200 bg-amber-50 text-xs leading-6 text-amber-800 [&>svg]:text-amber-700"><AlertDescription className="text-xs leading-6">{candidate.preview.warnings.map((warning) => <div key={warning}>• {warning}</div>)}</AlertDescription></Alert>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCandidate(null)}>انصراف</Button><Button disabled={busy} onClick={() => void confirmImport()}><RotateCcw className="h-4 w-4" /> تایید و بازیابی</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
