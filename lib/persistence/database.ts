type SqlPrimitive = string | number | null;
export type SqlBind = SqlPrimitive[];
export type SqlStatement = { sql: string; bind?: SqlBind };

export type ExternalSqliteBlob = { __blobBase64: string };
export type ExternalSqliteValue = string | number | null | ExternalSqliteBlob;
export type ExternalSqliteTable = {
  name: string;
  columns: string[];
  rowCount: number;
  rows: Record<string, ExternalSqliteValue>[];
};
export type ExternalSqliteSnapshot = {
  quickCheck: string;
  walHeader: boolean;
  warnings: string[];
  tables: ExternalSqliteTable[];
};

type WorkerCommand =
  | { type: 'init' }
  | { type: 'export' }
  | { type: 'remove' }
  | { type: 'exec'; sql: string; bind?: SqlBind }
  | { type: 'query'; sql: string; bind?: SqlBind }
  | { type: 'transaction'; statements: SqlStatement[] }
  | { type: 'inspectExternal'; bytes: ArrayBuffer };

type WorkerRequest = WorkerCommand & { id: number };

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

let legacyClientPromise: Promise<SQLiteClient> | null = null;
let inspectorClient: SQLiteClient | null = null;
let fileStoragePromise: Promise<void> | null = null;

export interface ServerSqlExecutor {
  query<T extends Record<string, unknown>>(sql: string, bind?: SqlBind): T[];
  exec(sql: string, bind?: SqlBind): void;
  transaction(statements: SqlStatement[]): void;
}

let serverSqlExecutor: ServerSqlExecutor | null = null;

export function configureServerSqlExecutor(executor: ServerSqlExecutor) {
  serverSqlExecutor = executor;
}

class SQLiteClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>();

  constructor() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      throw new Error('SQLite persistence requires a modern browser with Web Worker support.');
    }

    this.worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), {
      type: 'module',
      name: 'accountants-sqlite',
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || 'SQLite worker operation failed.'));
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'SQLite worker failed.');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  request<T>(request: WorkerCommand): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }
}

async function getLegacyClient() {
  if (!legacyClientPromise) {
    legacyClientPromise = (async () => {
      const client = new SQLiteClient();
      await client.request({ type: 'init' });
      return client;
    })().catch((error) => {
      legacyClientPromise = null;
      throw error;
    });
  }
  return legacyClientPromise;
}

async function legacyDatabaseExists() {
  if (!navigator.storage?.getDirectory) return false;
  const root = await navigator.storage.getDirectory();
  try {
    await root.getDirectoryHandle('accountants-sqlite-sahpool', { create: false });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
}

async function ensureFileStorage() {
  if (!fileStoragePromise) {
    fileStoragePromise = (async () => {
      const status = await fetch('/api/sqlite', { cache: 'no-store' });
      if (!status.ok) throw new Error('File database status could not be read.');
      const { hasDatabase, legacySha256 } = await status.json() as { hasDatabase: boolean; legacySha256?: string | null };
      if (hasDatabase && !legacySha256) return;
      if (!(await legacyDatabaseExists())) return;

      const client = await getLegacyClient();
      const bytes = await client.request<Uint8Array>({ type: 'export' });
      const checksum = await crypto.subtle.digest('SHA-256', bytes);
      const expectedHash = Array.from(new Uint8Array(checksum)).map((part) => part.toString(16).padStart(2, '0')).join('');
      if (hasDatabase) {
        if (expectedHash !== legacySha256) {
          console.warn('The legacy browser database differs from the file copy and was retained.');
          return;
        }
        try {
          await client.request({ type: 'remove' });
        } catch (error) {
          console.warn('The legacy browser database could not be removed.', error);
        }
        return;
      }
      const migration = await fetch('/api/sqlite/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const result = await migration.json() as { sha256?: string; error?: string };
      if (!migration.ok || result.sha256 !== expectedHash) throw new Error(result.error || 'Browser database migration failed verification.');
      try {
        await client.request({ type: 'remove' });
      } catch (error) {
        console.warn('The file database was saved, but the legacy browser copy could not be removed.', error);
      }
    })().catch((error) => {
      fileStoragePromise = null;
      throw error;
    });
  }
  return fileStoragePromise;
}

export async function migrateLegacyBrowserDatabaseIfNeeded() {
  if (typeof window === 'undefined') return;
  if (!/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
  await ensureFileStorage();
}

async function fileRequest<T>(command: { type: 'exec' | 'query' | 'transaction'; sql?: string; bind?: SqlBind; statements?: SqlStatement[] }) {
  await ensureFileStorage();
  const response = await fetch('/api/sqlite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const payload = await response.json() as { result?: T; error?: string };
  if (!response.ok) throw new Error(payload.error || 'File database operation failed.');
  return payload.result as T;
}

export async function sqliteExec(sql: string, bind?: SqlBind) {
  if (typeof window !== 'undefined' || !serverSqlExecutor) {
    throw new Error('Direct browser SQLite access is disabled. Use the authenticated data API.');
  }
  serverSqlExecutor.exec(sql, bind);
}

export async function sqliteQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  bind?: SqlBind
) {
  if (typeof window !== 'undefined' || !serverSqlExecutor) {
    throw new Error('Direct browser SQLite access is disabled. Use the authenticated data API.');
  }
  return serverSqlExecutor.query<T>(sql, bind);
}

export async function sqliteTransaction(statements: SqlStatement[]) {
  if (!statements.length) return;
  if (typeof window !== 'undefined' || !serverSqlExecutor) {
    throw new Error('Direct browser SQLite access is disabled. Use the authenticated data API.');
  }
  serverSqlExecutor.transaction(statements);
}


export async function inspectExternalSqlite(bytes: ArrayBuffer) {
  if (!inspectorClient) inspectorClient = new SQLiteClient();
  return inspectorClient.request<ExternalSqliteSnapshot>({ type: 'inspectExternal', bytes });
}
