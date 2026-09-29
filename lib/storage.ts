import type { AccountingData } from './types';
import { sqliteQuery, sqliteTransaction } from './persistence/database';
import {
  clearAccountingData,
  loadAccountingData,
  replaceAccountingData,
} from './persistence/repositories/accounting';

export const ACCOUNTING_PERSIST_KEY = 'accountants-web-v1';
export const ACCOUNTING_SCHEMA_VERSION = 9;

const AUTO_SNAPSHOT_META_KEY = 'last-auto-snapshot-at';
const AUTO_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 15;

export type SnapshotReason = 'auto' | 'manual' | 'before-import' | 'before-restore' | 'migration';

export interface AccountingSnapshotMeta {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  size: number;
}

type SnapshotRow = {
  id: string;
  created_at: string;
  reason: SnapshotReason;
  size: number;
  payload?: string;
};

type MetaRow = { value: string };
type PragmaRow = Record<string, number>;

let writeQueue: Promise<void> = Promise.resolve();

function emitPersistenceError(error: unknown) {
  if (typeof window === 'undefined') return;
  const message = error instanceof Error ? error.message : String(error);
  window.dispatchEvent(new CustomEvent('accounting:persistence-error', { detail: message }));
}

function extractAccountingData(value: string): AccountingData {
  const parsed = JSON.parse(value) as { state?: AccountingData };
  if (!parsed?.state) throw new Error('Persisted Zustand payload is missing its state.');
  return parsed.state;
}

function stateEnvelope(data: AccountingData) {
  return JSON.stringify({ state: data, version: ACCOUNTING_SCHEMA_VERSION });
}

function snapshotId(reason: SnapshotReason, createdAt: string) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return reason + '-' + createdAt + '-' + random;
}

async function pruneSnapshots() {
  const overflow = await sqliteQuery<{ id: string }>(
    'SELECT id FROM snapshots ORDER BY created_at DESC LIMIT -1 OFFSET ?',
    [MAX_SNAPSHOTS]
  );
  if (!overflow.length) return;
  await sqliteTransaction(
    overflow.map((snapshot) => ({
      sql: 'DELETE FROM snapshots WHERE id = ?',
      bind: [snapshot.id],
    }))
  );
}

async function saveSnapshotData(data: AccountingData, reason: SnapshotReason) {
  const payload = JSON.stringify(data);
  const createdAt = new Date().toISOString();
  const id = snapshotId(reason, createdAt);
  await sqliteTransaction([
    {
      sql: 'INSERT INTO snapshots(id, created_at, reason, size, payload) VALUES (?, ?, ?, ?, ?)',
      bind: [id, createdAt, reason, payload.length, payload],
    },
  ]);
  await pruneSnapshots();
  return id;
}

async function maybeCreateAutomaticSnapshot() {
  const meta = await sqliteQuery<MetaRow>('SELECT value FROM app_meta WHERE key = ? LIMIT 1', [
    AUTO_SNAPSHOT_META_KEY,
  ]);
  const last = Number(meta[0]?.value || 0);
  const now = Date.now();
  if (now - last < AUTO_SNAPSHOT_INTERVAL_MS) return;

  const current = await loadAccountingData();
  if (current) await saveSnapshotData(current, 'auto');
  await sqliteTransaction([
    {
      sql: "INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      bind: [AUTO_SNAPSHOT_META_KEY, String(now)],
    },
  ]);
}

export const accountingStateStorage = {
  async getItem(_name: string) {
    await writeQueue;
    const data = await loadAccountingData();
    return data ? stateEnvelope(data) : null;
  },

  async setItem(_name: string, value: string) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await maybeCreateAutomaticSnapshot();
          await replaceAccountingData(extractAccountingData(value));
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
          await clearAccountingData();
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
  const data = await loadAccountingData();
  return data ? saveSnapshotData(data, reason) : null;
}

export async function listAccountingSnapshots(): Promise<AccountingSnapshotMeta[]> {
  await writeQueue;
  const rows = await sqliteQuery<SnapshotRow>(
    'SELECT id, created_at, reason, size FROM snapshots ORDER BY created_at DESC'
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    reason: row.reason,
    size: Number(row.size),
  }));
}

export async function deleteAccountingSnapshot(id: string) {
  await sqliteTransaction([{ sql: 'DELETE FROM snapshots WHERE id = ?', bind: [id] }]);
}

export async function restoreAccountingSnapshot(id: string) {
  await writeQueue;
  const rows = await sqliteQuery<SnapshotRow>(
    'SELECT id, created_at, reason, size, payload FROM snapshots WHERE id = ? LIMIT 1',
    [id]
  );
  const snapshot = rows[0];
  if (!snapshot?.payload) throw new Error('Snapshot not found.');

  const current = await loadAccountingData();
  if (current) await saveSnapshotData(current, 'before-restore');

  const data = JSON.parse(snapshot.payload) as AccountingData;
  await replaceAccountingData(data);
}

export async function importAccountingData(data: AccountingData) {
  await writeQueue;
  const current = await loadAccountingData();
  if (current) await saveSnapshotData(current, 'before-import');
  await replaceAccountingData(data);
}

export async function getAccountingStorageInfo() {
  await writeQueue;
  const [pageCountRows, pageSizeRows, snapshotRows] = await Promise.all([
    sqliteQuery<PragmaRow>('PRAGMA page_count'),
    sqliteQuery<PragmaRow>('PRAGMA page_size'),
    sqliteQuery<{ count: number }>('SELECT COUNT(*) AS count FROM snapshots'),
  ]);
  const pageCount = Number(pageCountRows[0]?.page_count || 0);
  const pageSize = Number(pageSizeRows[0]?.page_size || 0);

  return {
    backend: 'SQLite WASM / OPFS',
    payloadSize: pageCount * pageSize,
    snapshotCount: Number(snapshotRows[0]?.count || 0),
    schemaVersion: ACCOUNTING_SCHEMA_VERSION,
  };
}
