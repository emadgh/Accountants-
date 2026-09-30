import 'server-only';

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { AccountingData } from '@/lib/types';
import { createAccountingBackup, parseAccountingBackup } from '@/lib/backup';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { SnapshotReason } from '@/lib/storage';
import { authenticateRequest, isSameOriginRequest } from '@/lib/persistence/server-auth';
import { getServerDatabase } from '@/lib/persistence/server-database';
import { attachmentFileStore } from '@/lib/persistence/attachment-files';
import { clearAccountingData, loadAccountingData, replaceAccountingData } from '@/lib/persistence/repositories/accounting';
import { inspectZipArchive } from '@/lib/zip-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SNAPSHOTS = 15;
const MAX_BACKUP_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_BACKUP_EXPANDED_BYTES = 300 * 1024 * 1024;

function validStorageKey(key: string) {
  return /^[0-9a-f-]{36}(?:-thumb)?\.(?:webp|pdf)$/.test(key);
}

function keyIsSafeForMetadata(key: string) {
  return typeof key === 'string' && validStorageKey(key);
}

function hasBackupToken(request: NextRequest) {
  const expected = process.env.ACCOUNTING_BACKUP_TOKEN || '';
  const authorization = request.headers.get('authorization') || '';
  const actual = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function isAdmin(user: { role: string; permissions: string[] }) {
  return user.role === 'admin' || user.permissions.includes('*');
}

function createSnapshot(data: AccountingData, reason: SnapshotReason) {
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

function hasDataShape(value: unknown): value is AccountingData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AccountingData>;
  return Array.isArray(data.customers) && Array.isArray(data.products) && Array.isArray(data.invoices) && !!data.settings;
}

export async function GET(request: NextRequest) {
  getServerDatabase();
  const action = request.nextUrl.searchParams.get('action');
  const backupTokenValid = action === 'backup.export' && hasBackupToken(request);
  const user = await authenticateRequest(request);
  if (!user && !backupTokenValid) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (user && !isAdmin(user) && !backupTokenValid) return NextResponse.json({ error: 'دسترسی مدیر لازم است.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const db = getServerDatabase();
  try {
    if (action === 'backup.export') {
      const data = await loadAccountingData();
      if (!data) return NextResponse.json({ error: 'داده‌ای برای پشتیبان‌گیری وجود ندارد.' }, { status: 404 });
      const files: Record<string, Uint8Array> = { 'backup.json': strToU8(await createAccountingBackup(data)) };
      for (const attachment of data.attachments || []) {
        for (const key of [attachment.storageKey, attachment.thumbnailKey].filter((item): item is string => !!item)) {
          if (!keyIsSafeForMetadata(key)) return NextResponse.json({ error: 'شناسه فایل پیوست نامعتبر است.' }, { status: 409 });
          const bytes = attachmentFileStore.read(key);
          if (!bytes) return NextResponse.json({ error: `فایل پیوست ${attachment.filename} پیدا نشد؛ بسته پشتیبان ساخته نشد.` }, { status: 409 });
          files[`attachments/${key}`] = new Uint8Array(bytes);
        }
      }
      const archive = zipSync(files, { level: 6 });
      return new NextResponse(new Blob([archive], { type: 'application/zip' }), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="accountants-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (action === 'snapshot.list') {
      const snapshots = db.prepare('SELECT id, created_at AS createdAt, reason, size FROM snapshots ORDER BY created_at DESC')
        .all() as Array<{ id: string; createdAt: string; reason: SnapshotReason; size: number }>;
      return NextResponse.json({ snapshots });
    }
    if (action === 'info') {
      const pageCount = Number((db.prepare('PRAGMA page_count').get() as { page_count?: number }).page_count || 0);
      const pageSize = Number((db.prepare('PRAGMA page_size').get() as { page_size?: number }).page_size || 0);
      const snapshotCount = Number((db.prepare('SELECT COUNT(*) AS count FROM snapshots').get() as { count: number }).count);
      const version = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'sqlite_schema_version'").get() as { value?: string } | undefined)?.value || 1);
      return NextResponse.json({ backend: `SQLite file / ${process.env.ACCOUNTING_DATA_DIR || 'data'}/accountants.sqlite3`, payloadSize: pageCount * pageSize, snapshotCount, schemaVersion: version });
    }
    if (action === 'yas.history') {
      const row = db.prepare("SELECT value FROM app_meta WHERE key = 'yas-import:last' LIMIT 1").get() as { value?: string } | undefined;
      let history = null;
      try { history = row?.value ? JSON.parse(row.value) : null; } catch { history = null; }
      return NextResponse.json({ history });
    }
    return NextResponse.json({ error: 'عملیات شناخته‌شده نیست.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'خواندن اطلاعات ذخیره‌سازی انجام نشد.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'درخواست از مبدا معتبر ارسال نشده است.' }, { status: 403 });
  const db = getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'دسترسی مدیر لازم است.' }, { status: 403 });

  if (request.nextUrl.searchParams.get('action') === 'backup.import') {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BACKUP_ARCHIVE_BYTES) return NextResponse.json({ error: 'حجم بسته پشتیبان از ۲۰۰ مگابایت بیشتر است.' }, { status: 413 });
    const createdFiles: string[] = [];
    try {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size > MAX_BACKUP_ARCHIVE_BYTES) return NextResponse.json({ error: 'فایل ZIP معتبر نیست یا بیش از حد بزرگ است.' }, { status: 400 });
      const archiveBytes = new Uint8Array(await file.arrayBuffer());
      const zipInspection = inspectZipArchive(archiveBytes, MAX_BACKUP_EXPANDED_BYTES);
      if (!zipInspection.ok) {
        const tooLarge = zipInspection.reason === 'too-large' || zipInspection.reason === 'too-many-entries';
        return NextResponse.json({ error: tooLarge ? 'حجم یا تعداد فایل‌های بازشده بسته بیش از حد مجاز است.' : 'ساختار فایل ZIP معتبر نیست.' }, { status: tooLarge ? 413 : 400 });
      }
      const archive = unzipSync(archiveBytes);
      const expandedBytes = Object.values(archive).reduce((sum, item) => sum + item.byteLength, 0);
      if (expandedBytes > MAX_BACKUP_EXPANDED_BYTES) return NextResponse.json({ error: 'محتوای بازشده بسته از ۳۰۰ مگابایت بیشتر است.' }, { status: 413 });
      const manifest = archive['backup.json'];
      if (!manifest) return NextResponse.json({ error: 'فایل backup.json در بسته پیدا نشد.' }, { status: 400 });
      const { data } = await parseAccountingBackup(strFromU8(manifest));
      const expectedKeys = new Set<string>();
      for (const attachment of data.attachments || []) {
        if (!keyIsSafeForMetadata(attachment.storageKey) || (attachment.thumbnailKey && !keyIsSafeForMetadata(attachment.thumbnailKey))) {
          return NextResponse.json({ error: 'شناسه پیوست در فهرست پشتیبان نامعتبر است.' }, { status: 400 });
        }
        expectedKeys.add(attachment.storageKey);
        if (attachment.thumbnailKey) expectedKeys.add(attachment.thumbnailKey);
      }
      const archiveKeys = Object.keys(archive).filter((key) => key !== 'backup.json');
      if (archiveKeys.some((key) => !key.startsWith('attachments/') || !keyIsSafeForMetadata(key.slice('attachments/'.length)))) {
        return NextResponse.json({ error: 'نام فایل در بسته پشتیبان معتبر نیست.' }, { status: 400 });
      }
      if (archiveKeys.length !== expectedKeys.size || archiveKeys.some((key) => !expectedKeys.has(key.slice('attachments/'.length)))) {
        return NextResponse.json({ error: 'فهرست پیوست‌ها با فایل‌های بسته پشتیبان سازگار نیست.' }, { status: 400 });
      }

      for (const key of expectedKeys) {
        const entry = archive[`attachments/${key}`];
        if (!entry) return NextResponse.json({ error: `فایل ${key} در بسته پیدا نشد.` }, { status: 400 });
        const isPdf = key.endsWith('.pdf');
        const validSignature = isPdf
          ? strFromU8(entry.subarray(0, Math.min(entry.length, 5))) === '%PDF-'
          : entry.length >= 12 && strFromU8(entry.subarray(0, 4)) === 'RIFF' && strFromU8(entry.subarray(8, 12)) === 'WEBP';
        if (!validSignature) return NextResponse.json({ error: `محتوای فایل ${key} با نوع آن همخوانی ندارد.` }, { status: 400 });
      }
      // Check every collision before writing any file so a conflict cannot leave
      // a partially installed set of attachments behind.
      const existingFiles = new Map<string, Buffer>();
      for (const key of expectedKeys) {
        const existing = attachmentFileStore.read(key);
        if (!existing) continue;
        const entry = archive[`attachments/${key}`]!;
        if (!existing.equals(Buffer.from(entry))) {
          return NextResponse.json({ error: `فایل پیوست ${key} از قبل با محتوای دیگری وجود دارد.` }, { status: 409 });
        }
        existingFiles.set(key, existing);
      }
      for (const key of expectedKeys) {
        const entry = archive[`attachments/${key}`]!;
        if (!existingFiles.has(key)) {
          attachmentFileStore.writeNew(key, entry);
          createdFiles.push(key);
        }
      }

      const current = await loadAccountingData();
      if (current) createSnapshot(current, 'before-import');
      await replaceAccountingData(data);
      const nextRevision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0) + 1;
      db.prepare("INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(nextRevision));
      return NextResponse.json({ ok: true, revision: nextRevision });
    } catch (error) {
      for (const key of createdFiles) { try { attachmentFileStore.remove(key); } catch { /* best effort cleanup */ } }
      const message = error instanceof Error ? error.message : 'بازیابی بسته پشتیبان انجام نشد.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'ساختار درخواست معتبر نیست.' }, { status: 400 }); }

  try {
    if (body.action === 'snapshot.create') {
      const data = await loadAccountingData();
      if (!data) return NextResponse.json({ id: null });
      const reason: SnapshotReason = body.reason === 'migration' ? 'migration' : 'manual';
      return NextResponse.json({ id: createSnapshot(data, reason) });
    }
    if (body.action === 'snapshot.delete') {
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'شناسه Snapshot معتبر نیست.' }, { status: 400 });
      db.prepare('DELETE FROM snapshots WHERE id = ?').run(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'snapshot.restore') {
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'شناسه Snapshot معتبر نیست.' }, { status: 400 });
      const row = db.prepare('SELECT payload FROM snapshots WHERE id = ? LIMIT 1').get(body.id) as { payload?: string } | undefined;
      if (!row?.payload) return NextResponse.json({ error: 'Snapshot پیدا نشد.' }, { status: 404 });
      const data = JSON.parse(row.payload) as unknown;
      if (!hasDataShape(data)) return NextResponse.json({ error: 'ساختار Snapshot معتبر نیست.' }, { status: 400 });
      const current = await loadAccountingData();
      if (current) createSnapshot(current, 'before-restore');
      await replaceAccountingData(data);
      const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0) + 1;
      db.prepare("INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(revision));
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'database.clear') {
      await clearAccountingData();
      const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0) + 1;
      db.prepare("INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(revision));
      return NextResponse.json({ ok: true, revision });
    }
    if (body.action === 'yas.history') {
      if (typeof body.fingerprint !== 'string') return NextResponse.json({ error: 'Fingerprint معتبر نیست.' }, { status: 400 });
      const history = { fingerprint: body.fingerprint, importedAt: new Date().toISOString(), report: body.report ?? null };
      db.prepare("INSERT INTO app_meta(key, value) VALUES ('yas-import:last', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(JSON.stringify(history));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'عملیات شناخته‌شده نیست.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'عملیات ذخیره‌سازی انجام نشد.' }, { status: 409 });
  }
}
