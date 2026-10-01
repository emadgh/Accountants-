import 'server-only';

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { AccountingData } from '../types';
import { createAccountingBackup, parseAccountingBackup } from '../backup';
import type { SnapshotReason } from '../storage';
import { attachmentFileStore } from './attachment-files';
import { DATABASE_DIRECTORY, getServerDatabase } from './server-database';
import { inspectZipArchive } from '../zip-limits';

const FULL_SNAPSHOT_FORMAT = 'accountants-web-full-snapshot-v1';
const MAX_SNAPSHOTS = 15;
const MAX_SNAPSHOT_EXPANDED_BYTES = 300 * 1024 * 1024;
const archiveDirectory = join(DATABASE_DIRECTORY, 'snapshot-archives');

function safeSnapshotArchiveName(key: string) {
  if (!/^[0-9a-f-]{36}\.zip$/.test(key)) throw new Error('شناسه بسته Snapshot نامعتبر است.');
  return join(archiveDirectory, key);
}

function validAttachmentKey(key: string) {
  return /^[0-9a-f-]{36}(?:-thumb)?\.(?:webp|pdf)$/.test(key);
}

function signatureMatches(key: string, bytes: Uint8Array) {
  return key.endsWith('.pdf')
    ? strFromU8(bytes.subarray(0, Math.min(bytes.length, 5))) === '%PDF-'
    : bytes.length >= 12 && strFromU8(bytes.subarray(0, 4)) === 'RIFF' && strFromU8(bytes.subarray(8, 12)) === 'WEBP';
}

export async function createFullAccountingSnapshot(data: AccountingData, reason: SnapshotReason) {
  const archiveKey = `${randomUUID()}.zip`;
  const files: Record<string, Uint8Array> = { 'backup.json': strToU8(await createAccountingBackup(data)) };
  for (const attachment of data.attachments || []) {
    for (const key of [attachment.storageKey, attachment.thumbnailKey].filter((value): value is string => !!value)) {
      if (!validAttachmentKey(key)) throw new Error('شناسه فایل پیوست در Snapshot معتبر نیست.');
      const bytes = attachmentFileStore.read(key);
      if (!bytes) throw new Error(`فایل پیوست ${attachment.filename} پیدا نشد؛ Snapshot کامل ساخته نشد.`);
      files[`attachments/${key}`] = new Uint8Array(bytes);
    }
  }
  const archive = zipSync(files, { level: 6 });
  mkdirSync(archiveDirectory, { recursive: true });
  const path = safeSnapshotArchiveName(archiveKey);
  writeFileSync(path, archive, { flag: 'wx' });
  const db = getServerDatabase();
  const createdAt = new Date().toISOString();
  const id = `${reason}-${createdAt}-${randomUUID()}`;
  const payload = JSON.stringify({ format: FULL_SNAPSHOT_FORMAT, archiveKey });
  try {
    db.prepare('INSERT INTO snapshots(id, created_at, reason, size, payload) VALUES (?, ?, ?, ?, ?)')
      .run(id, createdAt, reason, archive.byteLength, payload);
    const existing = db.prepare('SELECT id, payload FROM snapshots ORDER BY created_at DESC').all() as Array<{ id: string; payload: string }>;
    const removed = existing.slice(MAX_SNAPSHOTS);
    db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC LIMIT ?)')
      .run(MAX_SNAPSHOTS);
    for (const row of removed) removeSnapshotArchive(row.payload);
    return id;
  } catch (error) {
    try { unlinkSync(path); } catch { /* best effort cleanup */ }
    throw error;
  }
}

function removeSnapshotArchive(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { format?: string; archiveKey?: string };
    if (parsed.format === FULL_SNAPSHOT_FORMAT && typeof parsed.archiveKey === 'string') {
      const path = safeSnapshotArchiveName(parsed.archiveKey);
      if (existsSync(path)) unlinkSync(path);
    }
  } catch { /* old data-only snapshots have no separate archive */ }
}

export async function listAccountingSnapshotMetadata() {
  const db = getServerDatabase();
  const rows = db.prepare('SELECT id, created_at AS createdAt, reason, size, payload FROM snapshots ORDER BY created_at DESC')
    .all() as Array<{ id: string; createdAt: string; reason: SnapshotReason; size: number; payload: string }>;
  return rows.map(({ payload, ...meta }) => {
    let format: 'full' | 'data-only' = 'data-only';
    try { if ((JSON.parse(payload) as { format?: string }).format === FULL_SNAPSHOT_FORMAT) format = 'full'; } catch { /* legacy rows are JSON-only */ }
    return { ...meta, format };
  });
}

export async function readAccountingSnapshot(id: string): Promise<{ data: AccountingData; files: Record<string, Uint8Array>; format: 'full' | 'data-only' }> {
  const db = getServerDatabase();
  const row = db.prepare('SELECT payload FROM snapshots WHERE id = ? LIMIT 1').get(id) as { payload?: string } | undefined;
  if (!row?.payload) throw new Error('Snapshot پیدا نشد.');
  const parsed = JSON.parse(row.payload) as { format?: string; archiveKey?: string; data?: unknown };
  if (parsed.format !== FULL_SNAPSHOT_FORMAT) {
    const rawData = (parsed.data || parsed) as AccountingData;
    const legacyAttachments = Array.isArray(rawData.attachments) ? rawData.attachments : [];
    if (legacyAttachments.length) {
      throw new Error('این Snapshot قدیمی فقط داده دارد و فایل‌های پیوست آن موجود نیست؛ بازیابی متوقف شد.');
    }
    const { data } = await parseAccountingBackup(JSON.stringify({ ...rawData, attachments: [] }));
    return { data, files: {}, format: 'data-only' };
  }
  if (!parsed.archiveKey) throw new Error('نشانی بسته کامل Snapshot موجود نیست.');
  const archiveBytes = new Uint8Array(readFileSync(safeSnapshotArchiveName(parsed.archiveKey)));
  const inspection = inspectZipArchive(archiveBytes, MAX_SNAPSHOT_EXPANDED_BYTES);
  if (!inspection.ok) throw new Error('بسته Snapshot خراب یا بزرگ‌تر از حد مجاز است.');
  const archive = unzipSync(archiveBytes);
  const manifest = archive['backup.json'];
  if (!manifest) throw new Error('داده اصلی در بسته Snapshot پیدا نشد.');
  const { data } = await parseAccountingBackup(strFromU8(manifest));
  const expected = new Set<string>();
  for (const attachment of data.attachments || []) {
    for (const key of [attachment.storageKey, attachment.thumbnailKey].filter((value): value is string => !!value)) {
      if (!validAttachmentKey(key)) throw new Error('شناسه پیوست Snapshot نامعتبر است.');
      expected.add(key);
    }
  }
  const archived = Object.keys(archive).filter((key) => key !== 'backup.json');
  if (archived.length !== expected.size || archived.some((key) => !key.startsWith('attachments/') || !expected.has(key.slice('attachments/'.length)))) {
    throw new Error('فهرست فایل‌های بسته Snapshot با داده آن سازگار نیست.');
  }
  const files: Record<string, Uint8Array> = {};
  for (const key of expected) {
    const bytes = archive[`attachments/${key}`];
    if (!bytes || !signatureMatches(key, bytes)) throw new Error(`فایل پیوست Snapshot ناقص یا نامعتبر است: ${key}`);
    files[key] = bytes;
  }
  return { data, files, format: 'full' };
}

export function installSnapshotAttachments(data: AccountingData, files: Record<string, Uint8Array>) {
  const expected = new Set<string>();
  for (const attachment of data.attachments || []) {
    for (const key of [attachment.storageKey, attachment.thumbnailKey].filter((value): value is string => !!value)) expected.add(key);
  }
  if (expected.size !== Object.keys(files).length || Object.keys(files).some((key) => !expected.has(key))) {
    throw new Error('فهرست پیوست‌ها با فایل‌های بسته Snapshot سازگار نیست.');
  }
  const created: string[] = [];
  try {
    for (const key of expected) {
      if (!validAttachmentKey(key) || !signatureMatches(key, files[key])) throw new Error(`فایل Snapshot معتبر نیست: ${key}`);
      const existing = attachmentFileStore.read(key);
      if (existing) {
        if (!existing.equals(Buffer.from(files[key]))) throw new Error(`فایل پیوست ${key} از قبل با محتوای دیگری وجود دارد.`);
        continue;
      }
      attachmentFileStore.writeNew(key, files[key]);
      created.push(key);
    }
    return () => { for (const key of created) { try { attachmentFileStore.remove(key); } catch { /* best effort */ } } };
  } catch (error) {
    for (const key of created) { try { attachmentFileStore.remove(key); } catch { /* best effort */ } }
    throw error;
  }
}

export function deleteAccountingSnapshot(id: string) {
  const db = getServerDatabase();
  const row = db.prepare('SELECT payload FROM snapshots WHERE id = ? LIMIT 1').get(id) as { payload?: string } | undefined;
  if (!row) return;
  db.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
  removeSnapshotArchive(row.payload || '');
}
