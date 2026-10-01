import { NextRequest, NextResponse } from 'next/server';
import type { AccountingData } from '@/lib/types';
import { authenticateRequest, isSameOriginRequest } from '@/lib/persistence/server-auth';
import { getServerDatabase } from '@/lib/persistence/server-database';
import { loadAccountingData, replaceAccountingData, syncAccountingData } from '@/lib/persistence/repositories/accounting';
import { ACCOUNTING_SCHEMA_VERSION } from '@/lib/storage';
import { ACCOUNTING_COLLECTIONS, applyAccountingMutations, type AccountingMutation } from '@/lib/accounting-commands';
import { validateAccountingData, validateAccountingSettingsUpdate, validateAccountingTransition } from '@/lib/accounting-validation';
import { createEmptyAccountingData } from '@/lib/data';
import { revisionAdvanceStatement } from '@/lib/persistence/revision';
import { createFullAccountingSnapshot } from '@/lib/persistence/snapshots';
import { attachmentFileStore } from '@/lib/persistence/attachment-files';

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
  return createFullAccountingSnapshot(data, reason);
}

async function maybeSnapshotBeforeWrite(current: AccountingData | null) {
  if (!current) return;
  const db = getServerDatabase();
  const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'last-auto-snapshot-at' LIMIT 1").get() as { value?: string } | undefined;
  const now = Date.now();
  if (now - Number(meta?.value || 0) < AUTO_SNAPSHOT_INTERVAL_MS) return;
  await saveSnapshot(current, 'auto');
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

  let body: { state?: unknown; version?: unknown; replace?: unknown; expectedRevision?: unknown; commandId?: unknown };
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
  if (body.replace !== true) {
    return NextResponse.json({
      error: 'این نسخهٔ صفحه با سرور سازگار نیست. صفحه را تازه‌سازی کنید؛ هیچ تغییری ثبت نشده است.',
      code: 'CLIENT_UPDATE_REQUIRED',
    }, { status: 405 });
  }
  if (typeof body.commandId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(body.commandId)) {
    return NextResponse.json({ error: 'شناسه فرمان import معتبر نیست.' }, { status: 400 });
  }

  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const db = getServerDatabase();
      const prior = db.prepare('SELECT user_id AS userId, response_json AS responseJson FROM accounting_commands WHERE command_id = ? LIMIT 1')
        .get(body.commandId as string) as { userId: string; responseJson: string } | undefined;
      if (prior) {
        if (prior.userId !== user.id) return NextResponse.json({ error: 'شناسه فرمان قبلاً استفاده شده است.' }, { status: 409 });
        return NextResponse.json(JSON.parse(prior.responseJson) as { ok: true; revision: number });
      }
      const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0);
      if ((body.expectedRevision === null && revision !== 0) || (body.expectedRevision !== null && Number(body.expectedRevision) !== revision)) {
        return NextResponse.json({ error: 'داده در تب دیگری تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.' }, { status: 409 });
      }
      try {
        const previous = await loadAccountingData();
        const validation = validateAccountingData(body.state as AccountingData);
        if (!validation.ok) return NextResponse.json({ error: validation.message }, { status: 400 });
        if (!hasStoredAttachmentFiles(body.state as AccountingData)) {
          return NextResponse.json({ error: 'این داده به فایل پیوستی نیاز دارد که روی سرور موجود نیست؛ برای بازیابی از بسته ZIP کامل استفاده کنید.' }, { status: 400 });
        }
        if (body.replace === true && previous) await saveSnapshot(previous, 'before-import');
        else if (body.replace !== true) await maybeSnapshotBeforeWrite(previous);
        const nextRevision = revision + 1;
        const response = { ok: true as const, revision: nextRevision };
        const transactionStatements = [
          revisionAdvanceStatement(revision, nextRevision),
          {
            sql: 'INSERT INTO accounting_commands(command_id, user_id, revision, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
            bind: [body.commandId as string, user.id, nextRevision, JSON.stringify(response), new Date().toISOString()],
          },
        ];
        await replaceAccountingData(body.state as AccountingData, { transactionStatements });
        return NextResponse.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ذخیره داده انجام نشد.';
        return NextResponse.json({ error: message }, { status: 409 });
      }
    });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function isAdmin(user: { role: string; permissions: string[] }) {
  return user.role === 'admin' || user.permissions.includes('*');
}

function hasStoredAttachmentFiles(data: AccountingData) {
  for (const attachment of data.attachments || []) {
    for (const key of [attachment.storageKey, attachment.thumbnailKey].filter((item): item is string => !!item)) {
      const bytes = attachmentFileStore.read(key);
      if (!bytes) return false;
      const validSignature = key.endsWith('.pdf')
        ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
        : bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!validSignature) return false;
    }
  }
  return true;
}

function parseMutations(value: unknown): AccountingMutation[] | null {
  if (!Array.isArray(value) || value.length > 10_000) return null;
  const mutations: AccountingMutation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const mutation = item as Record<string, unknown>;
    if (mutation.type === 'settings.update') {
      if (!mutation.value || typeof mutation.value !== 'object') return null;
      mutations.push(mutation as AccountingMutation);
      continue;
    }
    if (typeof mutation.type !== 'string') return null;
    const [collection, operation, extra] = mutation.type.split('.');
    if (extra || !ACCOUNTING_COLLECTIONS.includes(collection as (typeof ACCOUNTING_COLLECTIONS)[number])) return null;
    // Attachment metadata is created together with verified file bytes by
    // /api/attachments. A generic data command must never create phantom files.
    if (collection === 'attachments') return null;
    if (operation === 'delete') {
      if (typeof mutation.id !== 'string' || !mutation.id) return null;
      mutations.push(mutation as AccountingMutation);
    } else if (operation === 'upsert') {
      if (!mutation.value || typeof mutation.value !== 'object' || typeof (mutation.value as { id?: unknown }).id !== 'string' || !(mutation.value as { id: string }).id) return null;
      mutations.push(mutation as AccountingMutation);
    } else return null;
  }
  return mutations;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'درخواست از مبدا معتبر ارسال نشده است.' }, { status: 403 });
  getServerDatabase();
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'ورود لازم است.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'ثبت داده مالی فقط برای مدیر مجاز است.' }, { status: 403 });

  let body: { commandId?: unknown; expectedRevision?: unknown; commands?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'ساختار فرمان معتبر نیست.' }, { status: 400 }); }
  if (typeof body.commandId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(body.commandId)) {
    return NextResponse.json({ error: 'شناسه یکتای فرمان معتبر نیست.' }, { status: 400 });
  }
  const commandId = body.commandId;
  if (body.expectedRevision !== null && !Number.isInteger(body.expectedRevision)) {
    return NextResponse.json({ error: 'شماره بازنگری فرمان معتبر نیست.' }, { status: 400 });
  }
  const commands = parseMutations(body.commands);
  if (!commands?.length) return NextResponse.json({ error: 'فرمان خالی یا نامعتبر است.' }, { status: 400 });

  const operation = writeQueue.catch(() => undefined).then(async () => {
    const db = getServerDatabase();
    const prior = db.prepare('SELECT user_id AS userId, response_json AS responseJson FROM accounting_commands WHERE command_id = ? LIMIT 1')
      .get(commandId) as { userId: string; responseJson: string } | undefined;
    if (prior) {
      if (prior.userId !== user.id) return NextResponse.json({ error: 'شناسه فرمان قبلاً استفاده شده است.' }, { status: 409 });
      return NextResponse.json(JSON.parse(prior.responseJson) as { ok: true; revision: number });
    }
    const revision = Number((db.prepare("SELECT value FROM app_meta WHERE key = 'accounting-state-revision'").get() as { value?: string } | undefined)?.value || 0);
    if ((body.expectedRevision === null && revision !== 0) || (body.expectedRevision !== null && Number(body.expectedRevision) !== revision)) {
      return NextResponse.json({ error: 'داده در تب دیگری تغییر کرده است؛ داده تازه را بارگذاری کنید.' }, { status: 409 });
    }
    try {
      const previous = await loadAccountingData();
      const baseline = previous || createEmptyAccountingData();
      const next = applyAccountingMutations(baseline, commands);
      // A settings command changes no historical document. Validate the settings
      // and their links without rejecting unrelated legacy invoices or stock.
      const validation = previous && commands.every((command) => command.type === 'settings.update')
        ? validateAccountingSettingsUpdate(previous, next.settings)
        : validateAccountingData(next, previous || undefined);
      if (!validation.ok) return NextResponse.json({ error: validation.message }, { status: 400 });
      if (previous) {
        const transition = validateAccountingTransition(previous, next);
        if (!transition.ok) return NextResponse.json({ error: transition.message }, { status: 400 });
      }
      if (!previous) await maybeSnapshotBeforeWrite(null);
      else await maybeSnapshotBeforeWrite(previous);

      const nextRevision = revision + 1;
      const response = { ok: true as const, revision: nextRevision };
      const transactionStatements = [
        revisionAdvanceStatement(body.expectedRevision === null ? 0 : Number(body.expectedRevision), nextRevision),
        {
          sql: 'INSERT INTO accounting_commands(command_id, user_id, revision, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
          bind: [commandId, user.id, nextRevision, JSON.stringify(response), new Date().toISOString()],
        },
      ];
      if (previous) await syncAccountingData(previous, next, transactionStatements);
      else await replaceAccountingData(next, { transactionStatements });
      return NextResponse.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'اجرای فرمان حسابداری انجام نشد.';
      return NextResponse.json({ error: message }, { status: 409 });
    }
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
