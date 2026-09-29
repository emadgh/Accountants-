import 'server-only';

import { mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLITE_SCHEMA_SQL } from './schema';

export const DATABASE_DIRECTORY = join(process.cwd(), 'data');
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
    database = opened;
  }
  return database;
}
