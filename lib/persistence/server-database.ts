import 'server-only';

import { mkdirSync, existsSync, statSync, readFileSync, copyFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLITE_MIGRATIONS, SQLITE_SCHEMA_SQL, SQLITE_SCHEMA_VERSION } from './schema';
import { configureServerSqlExecutor, type SqlBind } from './database';

export const DATABASE_DIRECTORY = resolve(process.env.ACCOUNTING_DATA_DIR || join(process.cwd(), 'data'));
const PUBLIC_DIRECTORY = resolve(process.cwd(), 'public');
const directoryRelativeToPublic = relative(PUBLIC_DIRECTORY, DATABASE_DIRECTORY);
if (directoryRelativeToPublic === '' || (!directoryRelativeToPublic.startsWith('..') && !isAbsolute(directoryRelativeToPublic))) {
  throw new Error('ACCOUNTING_DATA_DIR must be outside the public web directory.');
}
export const DATABASE_PATH = join(DATABASE_DIRECTORY, 'accountants.sqlite3');
export const LEGACY_MIGRATION_MARKER = join(DATABASE_DIRECTORY, 'legacy-migration.json');

let database: DatabaseSync | undefined;

export function databaseFileExists() {
  return existsSync(DATABASE_PATH) && statSync(DATABASE_PATH).size > 0;
}

export function legacyMigrationHash() {
  if (!existsSync(LEGACY_MIGRATION_MARKER)) return null;
  try {
    const marker = JSON.parse(readFileSync(LEGACY_MIGRATION_MARKER, 'utf8')) as { sha256?: string };
    return /^[0-9a-f]{64}$/.test(marker.sha256 || '') ? marker.sha256 : null;
  } catch {
    return null;
  }
}

export function getServerDatabase() {
  if (!database) {
    mkdirSync(DATABASE_DIRECTORY, { recursive: true });
    const opened = new DatabaseSync(DATABASE_PATH);
    opened.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    opened.exec(SQLITE_SCHEMA_SQL);
    const versionRow = opened.prepare("SELECT value FROM app_meta WHERE key = 'sqlite_schema_version' LIMIT 1").get() as { value?: string } | undefined;
    let currentVersion = Number(versionRow?.value || 0);
    if (!currentVersion) {
      currentVersion = 1;
      opened.prepare("INSERT INTO app_meta(key, value) VALUES ('sqlite_schema_version', '1') ON CONFLICT(key) DO NOTHING").run();
    }
    if (currentVersion > SQLITE_SCHEMA_VERSION) {
      opened.close();
      throw new Error(`Database schema v${currentVersion} is newer than this app supports (v${SQLITE_SCHEMA_VERSION}).`);
    }
    for (const migration of SQLITE_MIGRATIONS.filter((item) => item.version > currentVersion).sort((a, b) => a.version - b.version)) {
      const backupDirectory = join(DATABASE_DIRECTORY, 'migration-snapshots');
      mkdirSync(backupDirectory, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(DATABASE_PATH, join(backupDirectory, `before-v${migration.version}-${timestamp}.sqlite3`));
      opened.exec('BEGIN IMMEDIATE;');
      try {
        opened.exec(migration.sql);
        opened.prepare("INSERT INTO app_meta(key, value) VALUES ('sqlite_schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(String(migration.version));
        opened.exec('COMMIT;');
        currentVersion = migration.version;
      } catch (error) {
        opened.exec('ROLLBACK;');
        opened.close();
        throw error;
      }
    }
    database = opened;
    configureServerSqlExecutor({
      query: <T extends Record<string, unknown>>(sql: string, bind: SqlBind = []) => opened.prepare(sql).all(...bind) as T[],
      exec: (sql, bind = []) => { opened.prepare(sql).run(...bind); },
      transaction: (statements) => {
        opened.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;');
        try {
          for (const statement of statements) opened.prepare(statement.sql).run(...(statement.bind || []));
          opened.exec('COMMIT;');
        } catch (error) {
          opened.exec('ROLLBACK;');
          throw error;
        }
      },
    });
  }
  return database;
}

export function closeServerDatabase() {
  database?.close();
  database = undefined;
}
