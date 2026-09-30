import type { AccountingData } from './types';

export const ACCOUNTING_PERSIST_KEY = 'accountants-web-v1';
export const ACCOUNTING_SCHEMA_VERSION = 9;

export type SnapshotReason = 'auto' | 'manual' | 'before-import' | 'before-restore' | 'migration';

export interface AccountingSnapshotMeta {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  size: number;
}

export interface YasImportHistory {
  fingerprint: string;
  importedAt: string;
  report: unknown;
}

type AccountingEnvelope = { state: AccountingData; version: number };

let writeQueue: Promise<void> = Promise.resolve();
let persistedRevision: number | null = null;

function emitPersistenceError(error: unknown) {
  if (typeof window === 'undefined') return;
  const message = error instanceof Error ? error.message : String(error);
  window.dispatchEvent(new CustomEvent('accounting:persistence-error', { detail: message }));
}

export function flushAccountingPersistence() {
  return writeQueue;
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.headers || {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'ذخیره‌سازی داده انجام نشد.');
  return payload;
}

function dataFromEnvelope(value: string): AccountingEnvelope {
  const parsed = JSON.parse(value) as Partial<AccountingEnvelope>;
  if (!parsed.state || !Array.isArray(parsed.state.customers) || !Array.isArray(parsed.state.products) || !Array.isArray(parsed.state.invoices)) {
    throw new Error('ساختار داده حسابداری معتبر نیست.');
  }
  return { state: parsed.state, version: ACCOUNTING_SCHEMA_VERSION };
}

export async function initializeFirstRunAccountingData(data: AccountingData) {
  await accountingStateStorage.setItem(ACCOUNTING_PERSIST_KEY, JSON.stringify({ state: data, version: ACCOUNTING_SCHEMA_VERSION }));
}

export async function clearApplicationDatabase() {
  const result = await requestApi<{ revision: number }>('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'database.clear' }) });
  persistedRevision = result.revision;
}

export const accountingStateStorage = {
  async getItem(_name: string) {
    await writeQueue;
    const result = await requestApi<{ data: AccountingData | null; revision: number }>('/api/accounting-data', { cache: 'no-store' });
    persistedRevision = result.revision;
    return result.data ? JSON.stringify({ state: result.data, version: ACCOUNTING_SCHEMA_VERSION }) : null;
  },

  async setItem(_name: string, value: string) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const envelope = dataFromEnvelope(value);
          const result = await requestApi<{ revision: number }>('/api/accounting-data', {
            method: 'PUT',
            body: JSON.stringify({ ...envelope, expectedRevision: persistedRevision }),
          });
          persistedRevision = result.revision;
        } catch (error) {
          emitPersistenceError(error);
          throw error;
        }
      });
    return writeQueue;
  },

  async removeItem(_name: string) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await clearApplicationDatabase();
        } catch (error) {
          emitPersistenceError(error);
          throw error;
        }
      });
    return writeQueue;
  },
};

export async function createAccountingSnapshot(reason: SnapshotReason = 'manual') {
  await writeQueue;
  const result = await requestApi<{ id: string | null }>('/api/storage', {
    method: 'POST',
    body: JSON.stringify({ action: 'snapshot.create', reason }),
  });
  return result.id;
}

export async function listAccountingSnapshots(): Promise<AccountingSnapshotMeta[]> {
  await writeQueue;
  const result = await requestApi<{ snapshots: AccountingSnapshotMeta[] }>('/api/storage?action=snapshot.list', { cache: 'no-store' });
  return result.snapshots;
}

export async function deleteAccountingSnapshot(id: string) {
  await requestApi('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'snapshot.delete', id }) });
}

export async function restoreAccountingSnapshot(id: string) {
  await requestApi('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'snapshot.restore', id }) });
}

export async function importAccountingData(data: AccountingData) {
  await writeQueue;
  const result = await requestApi<{ revision: number }>('/api/accounting-data', {
    method: 'PUT',
    body: JSON.stringify({ state: data, version: ACCOUNTING_SCHEMA_VERSION, replace: true, expectedRevision: persistedRevision }),
  });
  persistedRevision = result.revision;
}

export async function importAccountingArchive(file: File) {
  await writeQueue;
  const form = new FormData();
  form.set('file', file, file.name);
  const response = await fetch('/api/storage?action=backup.import', { method: 'POST', body: form, credentials: 'same-origin' });
  const result = await response.json() as { revision?: number; error?: string };
  if (!response.ok) throw new Error(result.error || 'بازیابی بسته پشتیبان انجام نشد.');
  persistedRevision = result.revision ?? persistedRevision;
}

export async function uploadProjectAttachment(projectId: string, file: File) {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', file, file.name);
  const response = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'same-origin' });
  const result = await response.json() as { attachment?: AccountingData['attachments'][number]; revision?: number; error?: string };
  if (!response.ok || !result.attachment) throw new Error(result.error || 'بارگذاری پیوست انجام نشد.');
  persistedRevision = result.revision ?? persistedRevision;
  return result.attachment;
}

export async function downloadAccountingArchive() {
  const response = await fetch('/api/storage?action=backup.export', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    const result = await response.json().catch(() => ({ error: '' })) as { error?: string };
    throw new Error(result.error || 'ساخت بسته پشتیبان انجام نشد.');
  }
  return response.blob();
}

export async function getAccountingStorageInfo() {
  return requestApi<{ backend: string; payloadSize: number; snapshotCount: number; schemaVersion: number }>(
    '/api/storage?action=info',
    { cache: 'no-store' }
  );
}

export async function getLastYasImportHistory(): Promise<YasImportHistory | null> {
  const result = await requestApi<{ history: YasImportHistory | null }>('/api/storage?action=yas.history', { cache: 'no-store' });
  return result.history;
}

export async function recordYasImportHistory(fingerprint: string, report: unknown) {
  await requestApi('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'yas.history', fingerprint, report }) });
}
