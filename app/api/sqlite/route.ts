import { NextRequest, NextResponse } from 'next/server';
import { databaseFileExists, getServerDatabase, legacyMigrationHash } from '@/lib/persistence/server-database';
import { isLocalRequest } from '@/lib/persistence/local-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Statement = { sql: string; bind?: Array<string | number | null> };
type Command = Statement & { type: 'exec' | 'query' | 'transaction'; statements?: Statement[] };

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403 });
  return NextResponse.json({ hasDatabase: databaseFileExists(), backend: 'SQLite file', legacySha256: legacyMigrationHash() });
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request, true)) return NextResponse.json({ error: 'Local access only.' }, { status: 403 });
  try {
    const command = await request.json() as Command;
    const db = getServerDatabase();
    if (command.type === 'query' && typeof command.sql === 'string') {
      return NextResponse.json({ result: db.prepare(command.sql).all(...(command.bind || [])) });
    }
    if (command.type === 'exec' && typeof command.sql === 'string') {
      db.prepare(command.sql).run(...(command.bind || []));
      return NextResponse.json({ result: null });
    }
    if (command.type === 'transaction' && Array.isArray(command.statements)) {
      db.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;');
      try {
        for (const statement of command.statements) db.prepare(statement.sql).run(...(statement.bind || []));
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      }
      return NextResponse.json({ result: null });
    }
    return NextResponse.json({ error: 'Invalid SQLite command.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
