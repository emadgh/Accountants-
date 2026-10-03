import { buildAccountingMutations,type AccountingMutation } from './accounting-commands';
import { createEmptyAccountingData } from './data';
import type { DomainCommand } from './domain/commands';
import type { AccountingData } from './types';

export const ACCOUNTING_PERSIST_KEY = 'accountants-web-v1';
export const ACCOUNTING_SCHEMA_VERSION = 9;

export type SnapshotReason = 'auto' | 'manual' | 'before-import' | 'before-restore' | 'before-clear' | 'migration';

export interface AccountingSnapshotMeta {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  size: number;
  format?: 'full' | 'data-only';
}

export interface YasImportHistory {
  fingerprint: string;
  importedAt: string;
  report: unknown;
}

type AccountingEnvelope = { state: AccountingData; version: number };

let writeQueue: Promise<void> = Promise.resolve();
let persistedRevision: number | null = null;
let persistedData: AccountingData | null = null;
let lastPersistenceError: unknown = null;
let activeCommands: Array<DomainCommand | AccountingMutation> | null = null;
let applyingServerState = false;
let queuedWrites = 0;
let serverStateListener: ((data: AccountingData) => void) | undefined;

export function withDomainCommand<T>(command: DomainCommand, commit: () => T): T {
  return withAccountingCommands([command], commit);
}

export function withAccountingCommands<T>(commands: Array<DomainCommand | AccountingMutation>, commit: () => T): T {
  activeCommands = commands;
  try { return commit(); } finally { activeCommands = null; }
}

export function onAccountingServerState(listener: (data: AccountingData) => void) {
  serverStateListener = listener;
}

function publishServerState(data: AccountingData) {
  applyingServerState = true;
  try { serverStateListener?.(data); } finally { applyingServerState = false; }
}

export function isAccountingPersistencePending() { return queuedWrites > 0; }
export function accountingRevision() { return persistedRevision ?? undefined; }
export function accountingPersistenceErrorMessage() { return lastPersistenceError instanceof Error ? lastPersistenceError.message : lastPersistenceError ? String(lastPersistenceError) : ''; }

export class AccountingApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'AccountingApiError';
  }
}

function emitPersistenceError(error: unknown) {
  if (typeof window === 'undefined') return;
  const message = error instanceof Error ? error.message : String(error);
  const detail = error instanceof AccountingApiError
    ? { message, code: error.code, status: error.status }
    : { message };
  window.dispatchEvent(new CustomEvent('accounting:persistence-error', { detail }));
}

export function flushAccountingPersistence() {
  return writeQueue.then(() => {
    if (!lastPersistenceError) return;
    const error = lastPersistenceError;
    throw error;
  });
}

export function alignAccountingPersistedBaseline(data: AccountingData) {
  // Zustand normalizes legacy records on hydration. Compare later edits with
  // that same view so a profile save does not resend old invoices or products.
  persistedData = data;
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.headers || {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  }).catch(() => { throw new AccountingApiError('ارتباط با سرور برقرار نشد؛ اطلاعات فرم حفظ شده است.', 0, 'NETWORK_UNAVAILABLE'); });
  const payload = await response.json().catch(() => ({})) as T & { error?: string; code?: string; fieldErrors?: Record<string, string> };
  if (!response.ok) throw new AccountingApiError(payload.error || `ذخیره‌سازی داده انجام نشد (HTTP ${response.status}).`, response.status, payload.code, payload.fieldErrors);
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
  const result = await requestApi<{ revision: number }>('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'database.clear', expectedRevision: persistedRevision ?? 0, commandId: crypto.randomUUID().replace(/-/g, '') }) });
  persistedRevision = result.revision;
  persistedData = null;
}

export const accountingStateStorage = {
  async getItem(_name: string) {
    // A failed write must not poison subsequent reads. Rehydrate should still
    // fetch the last committed state from the server after a rejected command.
    await writeQueue.catch(() => undefined);
    const result = await requestApi<{ data: AccountingData | null; revision: number }>('/api/accounting-data', { cache: 'no-store' });
    persistedRevision = result.revision;
    persistedData = result.data;
    lastPersistenceError = null;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('accounting:persistence-recovered'));
    return result.data ? JSON.stringify({ state: result.data, version: ACCOUNTING_SCHEMA_VERSION }) : null;
  },

  async setItem(_name: string, value: string) {
    if (applyingServerState) return;
    const capturedCommands = activeCommands;
    queuedWrites++;
    const operation = writeQueue.then(async () => {
      if (lastPersistenceError) throw lastPersistenceError;
      const envelope = dataFromEnvelope(value);
      const baseline = persistedData || createEmptyAccountingData();
      const commands = capturedCommands || buildAccountingMutations(baseline, envelope.state);
      if (!commands.length) {
        // An empty captured edit must not replace a newer canonical response.
        if (!persistedData) persistedData = envelope.state;
        return;
      }
      const body = JSON.stringify({
        commandId: crypto.randomUUID().replace(/-/g, ''),
        expectedRevision: persistedRevision,
        commands,
      });
      let result: { revision: number; data?: AccountingData };
      try {
        result = await requestApi('/api/accounting-data/commands', { method: 'POST', body });
      } catch (firstError) {
        // Reuse the same ID: if the first response was lost after commit,
        // the server returns the original result without applying it twice.
        try {
          result = await requestApi('/api/accounting-data/commands', { method: 'POST', body });
        } catch {
          throw firstError;
        }
      }
      persistedRevision = result.revision;
      if (capturedCommands?.length && !result.data) {
        const latest = await requestApi<{ data: AccountingData; revision: number }>('/api/accounting-data', { cache: 'no-store' });
        result = latest;
        persistedRevision = latest.revision;
      }
      persistedData = result.data || envelope.state;
      lastPersistenceError = null;
    });
    writeQueue = operation.catch((error) => {
      lastPersistenceError = error;
      emitPersistenceError(error);
    }).finally(() => {
      queuedWrites--;
      if (queuedWrites === 0 && persistedData && !lastPersistenceError) publishServerState(persistedData);
    });
    return writeQueue;
  },

  async removeItem(_name: string) {
    const operation = writeQueue.then(() => clearApplicationDatabase());
    writeQueue = operation.catch((error) => {
      lastPersistenceError = error;
      emitPersistenceError(error);
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
  await requestApi('/api/storage', { method: 'POST', body: JSON.stringify({ action: 'snapshot.restore', id, expectedRevision: persistedRevision ?? 0, commandId: crypto.randomUUID().replace(/-/g, '') }) });
  const latest = await requestApi<{ data: AccountingData | null; revision: number }>('/api/accounting-data', { cache: 'no-store' });
  persistedData = latest.data;
  persistedRevision = latest.revision;
}

export async function importAccountingData(data: AccountingData) {
  await writeQueue;
  const result = await requestApi<{ revision: number }>('/api/accounting-data', {
    method: 'PUT',
    body: JSON.stringify({ state: data, version: ACCOUNTING_SCHEMA_VERSION, replace: true, expectedRevision: persistedRevision, commandId: crypto.randomUUID().replace(/-/g, '') }),
  });
  persistedRevision = result.revision;
  persistedData = data;
}

export async function importAccountingArchive(file: File) {
  await writeQueue;
  const form = new FormData();
  form.set('file', file, file.name);
  form.set('expectedRevision', String(persistedRevision ?? 0));
  form.set('commandId', crypto.randomUUID().replace(/-/g, ''));
  const response = await fetch('/api/storage?action=backup.import', { method: 'POST', body: form, credentials: 'same-origin' });
  const result = await response.json() as { revision?: number; error?: string };
  if (!response.ok) throw new Error(result.error || 'بازیابی بسته پشتیبان انجام نشد.');
  persistedRevision = result.revision ?? persistedRevision;
  const latest = await requestApi<{ data: AccountingData | null; revision: number }>('/api/accounting-data', { cache: 'no-store' });
  persistedData = latest.data;
  persistedRevision = latest.revision;
}

export async function uploadProjectAttachment(projectId: string, file: File) {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', file, file.name);
  form.set('expectedRevision', String(persistedRevision ?? 0));
  form.set('commandId', crypto.randomUUID().replace(/-/g, ''));
  let response: Response;
  try {
    response = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'same-origin' });
  } catch (firstError) {
    // The server may have committed before a connection dropped. Reusing the
    // command ID lets it return the saved attachment without storing it twice.
    try {
      response = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'same-origin' });
    } catch {
      throw firstError;
    }
  }
  const result = await response.json() as { attachment?: AccountingData['attachments'][number]; revision?: number; error?: string };
  if (!response.ok || !result.attachment) throw new Error(result.error || 'بارگذاری پیوست انجام نشد.');
  persistedRevision = result.revision ?? persistedRevision;
  if (persistedData) {
    persistedData = { ...persistedData, attachments: [result.attachment, ...persistedData.attachments.filter((item) => item.id !== result.attachment!.id)] };
  }
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
