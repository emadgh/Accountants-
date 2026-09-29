import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SQLITE_SCHEMA_SQL } from './schema';

type SqlPrimitive = string | number | null;
type SqlBind = SqlPrimitive[];
type SqlStatement = { sql: string; bind?: SqlBind };

type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'exec'; sql: string; bind?: SqlBind }
  | { id: number; type: 'query'; sql: string; bind?: SqlBind }
  | { id: number; type: 'transaction'; statements: SqlStatement[] }
  | { id: number; type: 'inspectExternal'; bytes: ArrayBuffer };

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

let sqlitePromise: Promise<any> | null = null;
let databasePromise: Promise<any> | null = null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function getSqlite() {
  if (!sqlitePromise) sqlitePromise = sqlite3InitModule();
  return sqlitePromise;
}

async function openDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const sqlite3: any = await getSqlite();

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

function queryOn(db: any, sql: string, bind?: SqlBind) {
  const rows: Record<string, unknown>[] = [];
  db.exec({
    sql,
    ...(bind?.length ? { bind } : {}),
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => rows.push(row),
  });
  return rows;
}

async function exec(sql: string, bind?: SqlBind) {
  const db = await openDatabase();
  if (bind?.length) db.exec({ sql, bind });
  else db.exec(sql);
}

async function query(sql: string, bind?: SqlBind) {
  const db = await openDatabase();
  return queryOn(db, sql, bind);
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

function isSqliteFile(bytes: Uint8Array) {
  const header = 'SQLite format 3\u0000';
  if (bytes.byteLength < header.length) return false;
  for (let index = 0; index < header.length; index++) {
    if (bytes[index] !== header.charCodeAt(index)) return false;
  }
  return true;
}

function bytesToBase64(bytes: Uint8Array) {
  let output = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(output);
}

function normalizeExternalValue(value: unknown): string | number | null | { __blobBase64: string } {
  if (value == null) return null;
  if (value instanceof Uint8Array) return { __blobBase64: bytesToBase64(value) };
  if (typeof value === 'bigint') {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value.toString();
  }
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

function quoteIdentifier(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}

async function inspectExternal(bytesBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(bytesBuffer);
  if (!isSqliteFile(bytes)) throw new Error('فایل انتخاب‌شده SQLite معتبر نیست.');

  const sqlite3: any = await getSqlite();
  const walHeader = bytes.byteLength > 19 && (bytes[18] === 2 || bytes[19] === 2);
  const warnings: string[] = [];
  if (walHeader) {
    warnings.push('هدر دیتابیس نشان می‌دهد فایل در حالت WAL بوده است. برای مهاجرت دقیق، فایل باید پس از checkpoint کامل از Yas کپی شده باشد.');
  }

  const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
  const db = new sqlite3.oo1.DB();
  try {
    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      0
    );
    db.checkRc(rc);
    db.exec('PRAGMA query_only = ON;');

    const quickRows = queryOn(db, 'PRAGMA quick_check');
    const quickCheck = String(Object.values(quickRows[0] || {})[0] || 'unknown');
    if (quickCheck.toLowerCase() !== 'ok') warnings.push('PRAGMA quick_check: ' + quickCheck);

    const tableRows = queryOn(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = [];
    const MAX_ROWS_PER_TABLE = 20000;

    for (const tableRow of tableRows) {
      const name = String(tableRow.name || '');
      if (!name) continue;
      const quoted = quoteIdentifier(name);
      const columns = queryOn(db, 'PRAGMA table_info(' + quoted + ')').map((row) => String(row.name || ''));
      const countRows = queryOn(db, 'SELECT COUNT(*) AS count FROM ' + quoted);
      const rowCount = Number(countRows[0]?.count || 0);
      if (rowCount > MAX_ROWS_PER_TABLE) {
        warnings.push('جدول ' + name + ' بیش از ' + MAX_ROWS_PER_TABLE + ' ردیف دارد؛ Analyze فقط اولین ردیف‌ها را بررسی می‌کند.');
      }
      let rawRows: Record<string, unknown>[];
      try {
        rawRows = queryOn(db, 'SELECT * FROM ' + quoted + ' ORDER BY rowid LIMIT ' + MAX_ROWS_PER_TABLE);
      } catch {
        rawRows = queryOn(db, 'SELECT * FROM ' + quoted + ' LIMIT ' + MAX_ROWS_PER_TABLE);
      }
      const rows = rawRows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeExternalValue(value)]))
      );
      tables.push({ name, columns, rowCount, rows });
    }

    return { quickCheck, walHeader, warnings, tables };
  } finally {
    try {
      db.close();
    } finally {
      sqlite3.wasm.dealloc(pointer);
    }
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
      if (message.type === 'inspectExternal') {
        const result = await inspectExternal(message.bytes);
        workerScope.postMessage({ id: message.id, ok: true, result });
        return;
      }
      await transaction(message.statements);
      workerScope.postMessage({ id: message.id, ok: true });
    } catch (error) {
      workerScope.postMessage({ id: message.id, ok: false, error: errorMessage(error) });
    }
  })();
};
