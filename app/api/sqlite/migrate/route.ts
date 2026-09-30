import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_DIRECTORY, DATABASE_PATH, LEGACY_MIGRATION_MARKER, databaseFileExists } from '@/lib/persistence/server-database';
import { isLocalRequest } from '@/lib/persistence/local-request';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request, true)) {
    return NextResponse.json({ error: 'Local access only.' }, { status: 403 });
  }
  if (databaseFileExists()) return NextResponse.json({ error: 'Destination database already exists.' }, { status: 409 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length < 100 || bytes.toString('ascii', 0, 16) !== 'SQLite format 3\0') {
    return NextResponse.json({ error: 'Invalid SQLite file.' }, { status: 400 });
  }
  mkdirSync(DATABASE_DIRECTORY, { recursive: true });
  const temporary = join(DATABASE_DIRECTORY, '.migration-' + crypto.randomUUID() + '.sqlite3');
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(temporary, bytes, { flag: 'wx' });
    const candidate = new DatabaseSync(temporary, { readOnly: true });
    try {
      const check = candidate.prepare('PRAGMA quick_check').get() as { quick_check?: string };
      if (check?.quick_check !== 'ok') throw new Error('SQLite quick_check failed.');
      const tables = candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
      const names = new Set(tables.map((table) => table.name));
      if (!['customers', 'invoices', 'payments', 'users', 'snapshots'].every((name) => names.has(name))) {
        throw new Error('The browser database schema is incomplete.');
      }
    } finally {
      candidate.close();
    }
    if (existsSync(DATABASE_PATH)) throw new Error('Destination database appeared during migration.');
    renameSync(temporary, DATABASE_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(LEGACY_MIGRATION_MARKER, JSON.stringify({ sha256, migratedAt: new Date().toISOString() }));
    return NextResponse.json({ ok: true, sha256, size: bytes.length });
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
