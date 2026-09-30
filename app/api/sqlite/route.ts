import { NextRequest, NextResponse } from 'next/server';
import { databaseFileExists, legacyMigrationHash } from '@/lib/persistence/server-database';
import { isLocalRequest } from '@/lib/persistence/local-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only status endpoint retained for the one-time local browser-database migration. */
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local migration only.' }, { status: 403 });
  return NextResponse.json({ hasDatabase: databaseFileExists(), legacySha256: legacyMigrationHash() });
}

/** Arbitrary SQL execution has been removed. */
export async function POST() {
  return NextResponse.json({ error: 'Direct SQLite commands are no longer supported.' }, { status: 410 });
}
