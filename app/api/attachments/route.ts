import 'server-only';

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import type { AttachmentMetadata } from '@/lib/types';
import { authenticateRequest, isSameOriginRequest } from '@/lib/persistence/server-auth';
import { getServerDatabase } from '@/lib/persistence/server-database';
import { attachmentFileStore } from '@/lib/persistence/attachment-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}(?:-thumb)?\.(?:webp|pdf)$/;

function safeFilename(value: string) {
  const clean = basename(value.replace(/[\\/]/g, '_')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'پیوست').slice(0, 120);
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
}

function isImage(bytes: Uint8Array) {
  return (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 8 && bytes[0] === 0x89 && new TextDecoder().decode(bytes.subarray(1, 4)) === 'PNG')
    || (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP');
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'درخواست از مبدا معتبر ارسال نشده است.' }, { status: 403 });
  const db = getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES + 256 * 1024) {
    return NextResponse.json({ error: 'حجم فایل از ۲۵ مگابایت بیشتر است.' }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  let projectId: string;
  try {
    const form = await request.formData();
    file = form.get('file');
    projectId = String(form.get('projectId') || '');
  } catch {
    return NextResponse.json({ error: 'فرم بارگذاری فایل معتبر نیست.' }, { status: 400 });
  }
  if (!(file instanceof File) || !projectId || file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'فایل یا پروژه معتبر نیست؛ حداکثر حجم فایل ۲۵ مگابایت است.' }, { status: 400 });
  }

  const input = new Uint8Array(await file.arrayBuffer());
  const pdf = isPdf(input);
  const image = isImage(input);
  if (!pdf && !image) return NextResponse.json({ error: 'فقط فایل PDF یا تصویر JPEG، PNG و WebP پذیرفته می‌شود.' }, { status: 415 });

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId) as { id?: string } | undefined;
  if (!project?.id) return NextResponse.json({ error: 'پروژه پیدا نشد.' }, { status: 404 });

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const filename = safeFilename(file.name);
  let storageKey: string;
  let thumbnailKey: string | undefined;
  let output: Buffer;
  let thumbnail: Buffer | undefined;
  let mimeType: AttachmentMetadata['mimeType'];
  try {
    if (pdf) {
      storageKey = `${id}.pdf`;
      output = Buffer.from(input);
      mimeType = 'application/pdf';
    } else {
      output = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      thumbnail = await sharp(output).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
      storageKey = `${id}.webp`;
      thumbnailKey = `${id}-thumb.webp`;
      mimeType = 'image/webp';
    }
  } catch {
    return NextResponse.json({ error: 'خواندن یا تبدیل فایل تصویر انجام نشد.' }, { status: 400 });
  }
  if (!STORAGE_KEY_PATTERN.test(storageKey) || (thumbnailKey && !STORAGE_KEY_PATTERN.test(thumbnailKey))) {
    return NextResponse.json({ error: 'شناسه فایل ساخته‌شده معتبر نیست.' }, { status: 500 });
  }

  const attachment: AttachmentMetadata = {
    id,
    projectId,
    filename,
    mimeType,
    size: output.byteLength,
    storageKey,
    ...(thumbnailKey ? { thumbnailKey } : {}),
    createdAt,
  };
  let storedKeys: string[] = [];
  try {
    attachmentFileStore.writeNew(storageKey, output);
    storedKeys.push(storageKey);
    if (thumbnailKey && thumbnail) { attachmentFileStore.writeNew(thumbnailKey, thumbnail); storedKeys.push(thumbnailKey); }
    db.exec('BEGIN IMMEDIATE;');
    db.prepare('INSERT INTO attachments(id, project_id, filename, mime_type, size, storage_key, thumbnail_key, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(attachment.id, attachment.projectId, attachment.filename, attachment.mimeType, attachment.size, attachment.storageKey, attachment.thumbnailKey || null, attachment.createdAt, JSON.stringify(attachment));
    const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0) + 1;
    db.prepare("INSERT INTO app_meta(key, value) VALUES ('accounting-state-revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(revision));
    db.exec('COMMIT;');
    return NextResponse.json({ attachment, revision });
  } catch {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may not have started */ }
    for (const key of storedKeys) { try { attachmentFileStore.remove(key); } catch { /* best effort cleanup */ } }
    return NextResponse.json({ error: 'ذخیره پیوست انجام نشد.' }, { status: 409 });
  }
}

export async function GET(request: NextRequest) {
  const db = getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id') || '';
  const row = db.prepare('SELECT payload FROM attachments WHERE id = ?').get(id) as { payload?: string } | undefined;
  if (!row?.payload) return NextResponse.json({ error: 'پیوست پیدا نشد.' }, { status: 404 });
  const attachment = JSON.parse(row.payload) as AttachmentMetadata;
  const thumbnail = request.nextUrl.searchParams.get('thumbnail') === '1';
  const key = thumbnail ? attachment.thumbnailKey : attachment.storageKey;
  if (!key || !STORAGE_KEY_PATTERN.test(key)) return NextResponse.json({ error: 'نسخه فایل پیدا نشد.' }, { status: 404 });
  const bytes = attachmentFileStore.read(key);
  if (!bytes) return NextResponse.json({ error: 'فایل پیوست روی دیسک پیدا نشد.' }, { status: 404 });
  const inlineName = encodeURIComponent(attachment.filename);
  return new NextResponse(new Blob([bytes], { type: thumbnail ? 'image/webp' : attachment.mimeType }), {
    headers: {
      'Content-Type': thumbnail ? 'image/webp' : attachment.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${inlineName}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
