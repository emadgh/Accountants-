import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { AccountingData } from '@/lib/types';
import { authenticateRequest, isSameOriginRequest } from '@/lib/persistence/server-auth';
import { getServerDatabase } from '@/lib/persistence/server-database';
import { loadAccountingData, replaceAccountingData, syncAccountingData } from '@/lib/persistence/repositories/accounting';
import { ACCOUNTING_SCHEMA_VERSION } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACCOUNTING_PAYLOAD_BYTES = 20 * 1024 * 1024;
const AUTO_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 15;
let writeQueue: Promise<void> = Promise.resolve();

function isAccountingData(value: unknown): value is AccountingData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AccountingData>;
  return Boolean(
    Array.isArray(data.customers) && Array.isArray(data.products) && Array.isArray(data.invoices) &&
    Array.isArray(data.returns) && Array.isArray(data.payments) && Array.isArray(data.checks) &&
    Array.isArray(data.adjustments) && Array.isArray(data.stockMovements) && Array.isArray(data.accounts) &&
    Array.isArray(data.journalEntries) && Array.isArray(data.moneyTransactions) && data.settings &&
    Array.isArray(data.settings.businessProfiles) && data.settings.numbering
  );
}

function saveSnapshot(data: AccountingData, reason: 'auto' | 'before-import') {
  const db = getServerDatabase();
  const createdAt = new Date().toISOString();
  const id = `${reason}-${createdAt}-${randomUUID()}`;
  const payload = JSON.stringify(data);
  db.prepare('INSERT INTO snapshots(id, created_at, reason, size, payload) VALUES (?, ?, ?, ?, ?)')
    .run(id, createdAt, reason, payload.length, payload);
  db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC LIMIT ?)')
    .run(MAX_SNAPSHOTS);
  return id;
}

function maybeSnapshotBeforeWrite(current: AccountingData | null) {
  if (!current) return;
  const db = getServerDatabase();
  const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'last-auto-snapshot-at' LIMIT 1").get() as { value?: string } | undefined;
  const now = Date.now();
  if (now - Number(meta?.value || 0) < AUTO_SNAPSHOT_INTERVAL_MS) return;
  saveSnapshot(current, 'auto');
  db.prepare("INSERT INTO app_meta(key, value) VALUES ('last-auto-snapshot-at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(String(now));
}

export async function GET(request: NextRequest) {
  getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });
  try {
    const db = getServerDatabase();
    const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0);
    return NextResponse.json({ data: await loadAccountingData(), revision }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch {
    return NextResponse.json({ error: 'خواندن اطلاعات حسابداری انجام نشد.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'درخواست از مبدا معتبر ارسال نشده است.' }, { status: 403 });
  getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_ACCOUNTING_PAYLOAD_BYTES) return NextResponse.json({ error: 'حجم داده از حد مجاز بیشتر است.' }, { status: 413 });

  let body: { state?: unknown; version?: unknown; replace?: unknown; expectedRevision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'ساختار درخواست معتبر نیست.' }, { status: 400 });
  }
  if (Number(body.version) > ACCOUNTING_SCHEMA_VERSION) return NextResponse.json({ error: 'نسخه داده از برنامه جدیدتر است.' }, { status: 409 });
  if (!isAccountingData(body.state)) return NextResponse.json({ error: 'ساختار داده حسابداری معتبر نیست.' }, { status: 400 });
  if (body.expectedRevision !== null && !Number.isInteger(body.expectedRevision)) return NextResponse.json({ error: 'نسخه داده ارسالی معتبر نیست؛ داده را دوباره بارگذاری کنید.' }, { status: 409 });
  if (body.replace === true && user.role !== 'admin' && !user.permissions.includes('*')) {
    return NextResponse.json({ error: 'برای جایگزینی دیتابیس دسترسی مدیر لازم است.' }, { status: 403 });
  }

  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const db = getServerDatabase();
      const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0);
      if ((body.expectedRevision === null && revision !== 0) || (body.expectedRevision !== null && Number(body.expectedRevision) !== revision)) {
        return NextResponse.json({ error: 'داده در تب دیگری تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.' }, { status: 409 });
      }
      try {
        const previous = await loadAccountingData();
        if (body.replace === true && previous) saveSnapshot(previous, 'before-import');
        else if (body.replace !== true) maybeSnapshotBeforeWrite(previous);

        if (body.replace === true || !previous) await replaceAccountingData(body.state as AccountingData);
        else await syncAccountingData(previous, body.state as AccountingData);
        const nextRevision = revision + 1;
        db.prepare("INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(String(nextRevision));
        return NextResponse.json({ ok: true, revision: nextRevision });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ذخیره داده انجام نشد.';
        return NextResponse.json({ error: message }, { status: 409 });
      }
    });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
