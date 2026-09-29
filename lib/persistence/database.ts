type SqlPrimitive = string | number | null;
export type SqlBind = SqlPrimitive[];
export type SqlStatement = { sql: string; bind?: SqlBind };

type WorkerCommand =
  | { type: 'init' }
  | { type: 'exec'; sql: string; bind?: SqlBind }
  | { type: 'query'; sql: string; bind?: SqlBind }
  | { type: 'transaction'; statements: SqlStatement[] };

type WorkerRequest = WorkerCommand & { id: number };

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

let clientPromise: Promise<SQLiteClient> | null = null;

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

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new SQLiteClient();
      await client.request({ type: 'init' });
      return client;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function sqliteExec(sql: string, bind?: SqlBind) {
  const client = await getClient();
  return client.request<void>({ type: 'exec', sql, bind });
}

export async function sqliteQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  bind?: SqlBind
) {
  const client = await getClient();
  return client.request<T[]>({ type: 'query', sql, bind });
}

export async function sqliteTransaction(statements: SqlStatement[]) {
  if (!statements.length) return;
  const client = await getClient();
  return client.request<void>({ type: 'transaction', statements });
}
