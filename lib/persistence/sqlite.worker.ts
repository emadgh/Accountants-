import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SQLITE_SCHEMA_SQL } from './schema';

type SqlPrimitive = string | number | null;
type SqlBind = SqlPrimitive[];
type SqlStatement = { sql: string; bind?: SqlBind };

type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'exec'; sql: string; bind?: SqlBind }
  | { id: number; type: 'query'; sql: string; bind?: SqlBind }
  | { id: number; type: 'transaction'; statements: SqlStatement[] };

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

const workerScope = globalThis as unknown as {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

let databasePromise: Promise<any> | null = null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function openDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const sqlite3: any = await sqlite3InitModule({
        print: () => undefined,
        printErr: () => undefined,
      });

      if (typeof sqlite3.installOpfsSAHPoolVfs !== 'function') {
        throw new Error('This browser does not provide the OPFS APIs required for persistent SQLite.');
      }

      const pool = await sqlite3.installOpfsSAHPoolVfs({
        directory: '/accountants-sqlite-sahpool',
        initialCapacity: 8,
      });
      const db = new pool.OpfsSAHPoolDb('/accountants.sqlite3');

      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec('PRAGMA synchronous = FULL;');
      db.exec(SQLITE_SCHEMA_SQL);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function exec(sql: string, bind?: SqlBind) {
  const db = await openDatabase();
  if (bind?.length) db.exec({ sql, bind });
  else db.exec(sql);
}

async function query(sql: string, bind?: SqlBind) {
  const db = await openDatabase();
  const rows: Record<string, unknown>[] = [];
  db.exec({
    sql,
    ...(bind?.length ? { bind } : {}),
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => rows.push(row),
  });
  return rows;
}

async function transaction(statements: SqlStatement[]) {
  const db = await openDatabase();
  db.exec('BEGIN IMMEDIATE;');
  db.exec('PRAGMA defer_foreign_keys = ON;');
  try {
    for (const statement of statements) {
      if (statement.bind?.length) db.exec({ sql: statement.sql, bind: statement.bind });
      else db.exec(statement.sql);
    }
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}

workerScope.onmessage = (event) => {
  const message = event.data;
  void (async () => {
    try {
      if (message.type === 'init') {
        await openDatabase();
        workerScope.postMessage({ id: message.id, ok: true });
        return;
      }
      if (message.type === 'exec') {
        await exec(message.sql, message.bind);
        workerScope.postMessage({ id: message.id, ok: true });
        return;
      }
      if (message.type === 'query') {
        const rows = await query(message.sql, message.bind);
        workerScope.postMessage({ id: message.id, ok: true, result: rows });
        return;
      }
      await transaction(message.statements);
      workerScope.postMessage({ id: message.id, ok: true });
    } catch (error) {
      workerScope.postMessage({ id: message.id, ok: false, error: errorMessage(error) });
    }
  })();
};
