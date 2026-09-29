export const ACCOUNTING_PERSIST_KEY = 'accountants-web-v1';
export const ACCOUNTING_SCHEMA_VERSION = 8;

const DB_NAME = 'accountants-web';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const SNAPSHOT_STORE = 'snapshots';
const META_STORE = 'meta';
const EMERGENCY_KEY = 'accountants-web-emergency-v1';
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

interface AccountingSnapshot extends AccountingSnapshotMeta {
  payload: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function canUseIndexedDb() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function localStorageGet(key: string) {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    // LocalStorage is only an emergency mirror. IndexedDB remains authoritative.
  }
}

function localStorageRemove(key: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    // Ignore environments where LocalStorage is unavailable.
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function openDatabase() {
  if (!canUseIndexedDb()) return Promise.reject(new Error('IndexedDB is not available.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Unable to open IndexedDB.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('IndexedDB upgrade is blocked by another tab.'));
    };
  });

  return databasePromise;
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key)) as Promise<T | undefined>;
}

async function idbPut(storeName: string, value: unknown, key?: IDBValidKey) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  await requestResult(key === undefined ? store.put(value) : store.put(value, key));
}

async function idbDelete(storeName: string, key: IDBValidKey) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).delete(key));
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

async function pruneSnapshots() {
  if (!canUseIndexedDb()) return;
  const snapshots = await idbGetAll<AccountingSnapshot>(SNAPSHOT_STORE);
  snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const overflow = snapshots.slice(MAX_SNAPSHOTS);
  await Promise.all(overflow.map((snapshot) => idbDelete(SNAPSHOT_STORE, snapshot.id)));
}

async function saveSnapshotPayload(payload: string, reason: SnapshotReason) {
  if (!payload || !canUseIndexedDb()) return null;
  const createdAt = new Date().toISOString();
  const snapshot: AccountingSnapshot = {
    id: reason + '-' + createdAt + '-' + Math.random().toString(36).slice(2, 8),
    createdAt,
    reason,
    size: payload.length,
    payload,
  };
  await idbPut(SNAPSHOT_STORE, snapshot);
  await pruneSnapshots();
  return snapshot.id;
}

async function maybeCreateAutomaticSnapshot(previousPayload: string) {
  if (!previousPayload || !canUseIndexedDb()) return;
  const last = Number((await idbGet<number>(META_STORE, AUTO_SNAPSHOT_META_KEY)) || 0);
  const now = Date.now();
  if (now - last < AUTO_SNAPSHOT_INTERVAL_MS) return;
  await saveSnapshotPayload(previousPayload, 'auto');
  await idbPut(META_STORE, now, AUTO_SNAPSHOT_META_KEY);
}

async function readPrimaryPayload(name = ACCOUNTING_PERSIST_KEY) {
  if (canUseIndexedDb()) {
    try {
      const indexed = await idbGet<string>(STATE_STORE, name);
      if (indexed) return indexed;
    } catch {
      // Fall through to emergency/legacy copies.
    }
  }
  return localStorageGet(EMERGENCY_KEY) || localStorageGet(name);
}

async function writePrimaryPayload(name: string, value: string, withAutomaticSnapshot: boolean) {
  if (!canUseIndexedDb()) {
    localStorageSet(name, value);
    localStorageSet(EMERGENCY_KEY, value);
    return;
  }

  try {
    const previous = await idbGet<string>(STATE_STORE, name);
    if (withAutomaticSnapshot && previous && previous !== value) {
      await maybeCreateAutomaticSnapshot(previous);
    }
    await idbPut(STATE_STORE, value, name);
    localStorageSet(EMERGENCY_KEY, value);
  } catch {
    localStorageSet(name, value);
    localStorageSet(EMERGENCY_KEY, value);
  }
}

export const accountingStateStorage = {
  async getItem(name: string) {
    await writeQueue;
    if (!canUseIndexedDb()) return localStorageGet(name);

    try {
      const indexed = await idbGet<string>(STATE_STORE, name);
      if (indexed) return indexed;

      const legacy = localStorageGet(name) || localStorageGet(EMERGENCY_KEY);
      if (legacy) {
        await idbPut(STATE_STORE, legacy, name);
        await saveSnapshotPayload(legacy, 'migration');
        localStorageSet(EMERGENCY_KEY, legacy);
        return legacy;
      }
      return null;
    } catch {
      return localStorageGet(EMERGENCY_KEY) || localStorageGet(name);
    }
  },

  async setItem(name: string, value: string) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => writePrimaryPayload(name, value, true));
    return writeQueue;
  },

  async removeItem(name: string) {
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        if (canUseIndexedDb()) {
          try {
            await idbDelete(STATE_STORE, name);
          } catch {
            // Fall back to LocalStorage cleanup.
          }
        }
        localStorageRemove(name);
        localStorageRemove(EMERGENCY_KEY);
      });
    return writeQueue;
  },
};

export async function createAccountingSnapshot(reason: SnapshotReason = 'manual') {
  await writeQueue;
  const payload = await readPrimaryPayload();
  if (!payload) return null;
  if (!canUseIndexedDb()) return null;
  return saveSnapshotPayload(payload, reason);
}

export async function listAccountingSnapshots(): Promise<AccountingSnapshotMeta[]> {
  await writeQueue;
  if (!canUseIndexedDb()) return [];
  try {
    const snapshots = await idbGetAll<AccountingSnapshot>(SNAPSHOT_STORE);
    return snapshots
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, createdAt, reason, size }) => ({ id, createdAt, reason, size }));
  } catch {
    return [];
  }
}

export async function deleteAccountingSnapshot(id: string) {
  if (!canUseIndexedDb()) return;
  await idbDelete(SNAPSHOT_STORE, id);
}

export async function restoreAccountingSnapshot(id: string) {
  await writeQueue;
  if (!canUseIndexedDb()) throw new Error('IndexedDB is not available.');
  const snapshot = await idbGet<AccountingSnapshot>(SNAPSHOT_STORE, id);
  if (!snapshot?.payload) throw new Error('Snapshot not found.');

  const current = await readPrimaryPayload();
  if (current) await saveSnapshotPayload(current, 'before-restore');
  await writePrimaryPayload(ACCOUNTING_PERSIST_KEY, snapshot.payload, false);
}

export async function getAccountingStorageInfo() {
  const payload = await readPrimaryPayload();
  const snapshots = await listAccountingSnapshots();
  return {
    backend: canUseIndexedDb() ? 'IndexedDB' : 'LocalStorage fallback',
    payloadSize: payload?.length || 0,
    snapshotCount: snapshots.length,
    schemaVersion: ACCOUNTING_SCHEMA_VERSION,
  };
}
