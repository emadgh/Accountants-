import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { createEmptyAccountingData } from '../lib/data';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { inspectZipArchive } from '../lib/zip-limits';
import { buildAccountingMutations } from '../lib/accounting-commands';

const previousDataDirectory = process.env.ACCOUNTING_DATA_DIR;
const dataDirectory = mkdtempSync(join(tmpdir(), 'accountants-api-'));
let authRoute: typeof import('../app/api/auth/route');
let accountingRoute: typeof import('../app/api/accounting-data/route');
let accountingCommandsRoute: typeof import('../app/api/accounting-data/commands/route');
let storageRoute: typeof import('../app/api/storage/route');
let attachmentsRoute: typeof import('../app/api/attachments/route');
let legacyMigrationRoute: typeof import('../app/api/sqlite/migrate/route');
let closeDatabase: typeof import('../lib/persistence/server-database').closeServerDatabase;

beforeAll(async () => {
  process.env.ACCOUNTING_DATA_DIR = dataDirectory;
  [authRoute, accountingRoute, accountingCommandsRoute, storageRoute, attachmentsRoute, legacyMigrationRoute] = await Promise.all([
    import('../app/api/auth/route'),
    import('../app/api/accounting-data/route'),
    import('../app/api/accounting-data/commands/route'),
    import('../app/api/storage/route'),
    import('../app/api/attachments/route'),
    import('../app/api/sqlite/migrate/route'),
  ]);
  ({ closeServerDatabase: closeDatabase } = await import('../lib/persistence/server-database'));
});

afterAll(() => {
  closeDatabase?.();
  rmSync(dataDirectory, { recursive: true, force: true });
  if (previousDataDirectory === undefined) delete process.env.ACCOUNTING_DATA_DIR;
  else process.env.ACCOUNTING_DATA_DIR = previousDataDirectory;
});

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const headers = new Headers(init?.headers);
  if (!headers.has('host')) headers.set('host', 'localhost');
  return new NextRequest(`http://localhost${path}`, { ...init, headers });
}

describe('authenticated data API', () => {
  it('checks ZIP expanded sizes before files are inflated', () => {
    const compressed = zipSync({ 'large.txt': new Uint8Array(1024 * 1024) });
    expect(inspectZipArchive(compressed, 1024)).toEqual({ ok: false, reason: 'too-large' });
    expect(inspectZipArchive(compressed, 2 * 1024 * 1024)).toMatchObject({ ok: true, expandedBytes: 1024 * 1024 });
  });

  it('denies anonymous data access and rejects cross-origin setup', async () => {
    const anonymous = await accountingRoute.GET(request('/api/accounting-data'));
    expect(anonymous.status).toBe(401);
    const migrationBackups = readdirSync(join(dataDirectory, 'migration-snapshots'));
    expect(migrationBackups.some((name) => name.startsWith('before-v2-'))).toBe(true);
    expect(migrationBackups.some((name) => name.startsWith('before-v3-'))).toBe(true);
    expect(migrationBackups.some((name) => name.startsWith('before-v4-'))).toBe(true);

    const rejectedSetup = await authRoute.POST(request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ action: 'setup', username: 'admin', password: 'password-123' }),
    }));
    expect(rejectedSetup.status).toBe(403);

    vi.stubEnv('NODE_ENV', 'production');
    try {
      const disabledMigration = await legacyMigrationRoute.POST(request('/api/sqlite/migrate', {
        method: 'POST', headers: { origin: 'http://localhost' }, body: new Uint8Array(128),
      }));
      expect(disabledMigration.status).toBe(410);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('sets an HttpOnly session, allows typed accounting writes, and revokes access on logout', async () => {
    const setup = await authRoute.POST(request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ action: 'setup', username: 'admin', password: 'password-123' }),
    }));
    expect(setup.status, JSON.stringify(await setup.clone().json())).toBe(200);
    const sessionCookie = setup.cookies.get('accountants_session');
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.value).toContain('.');

    const repeatedSetup = await authRoute.POST(request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ action: 'setup', username: 'another-admin', password: 'password-123' }),
    }));
    expect(repeatedSetup.status).toBe(409);

    const cookieHeader = `accountants_session=${sessionCookie!.value}`;
    const snapshot = await authRoute.GET(request('/api/auth', { headers: { cookie: cookieHeader } }));
    expect((await snapshot.json()).user.username).toBe('admin');

    const data = createEmptyAccountingData();
    data.customers.push({
      id: 'customer_api', code: '1', name: 'API customer', kind: 'customer', status: 'active',
      phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    });
    data.settings.businessName = 'API business';
    data.settings.businessProfiles[0].businessName = 'API business';
    data.projects.push({ id: 'project_api', customerId: 'customer_api', title: 'API project', status: 'in-progress', agreedAmount: 100, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const writeBody = {
      commandId: 'command_api_000001', expectedRevision: 0,
      commands: buildAccountingMutations(createEmptyAccountingData(), data),
    };
    const write = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify(writeBody),
    }));
    expect(write.status).toBe(200);

    const replay = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify(writeBody),
    }));
    expect(replay.status).toBe(200);
    expect((await replay.json()).revision).toBe(1);

    const read = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    const saved = await read.json();
    expect(saved.data.customers[0].id).toBe('customer_api');
    expect(saved.data.settings.businessProfiles[0].businessName).toBe('API business');
    expect(saved.revision).toBe(1);

    const unbalanced = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({
        commandId: 'command_bad_journal_01', expectedRevision: 1,
        commands: [{ type: 'journalEntries.upsert', value: {
          id: 'journal_bad_api', date: '2026-01-01', description: 'unbalanced', sourceType: 'system', sourceId: 'bad', action: 'post', createdAt: '2026-01-01T00:00:00.000Z',
          lines: [{ id: 'line_bad_api', accountId: data.accounts[0].id, debit: 100, credit: 0 }],
        } }],
      }),
    }));
    expect(unbalanced.status).toBe(400);

    const badUpload = new FormData();
    badUpload.set('projectId', 'project_api');
    badUpload.set('expectedRevision', '1');
    badUpload.set('commandId', 'command_upload_bad_0001');
    badUpload.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'fake.png', { type: 'image/png' }));
    const rejectedFile = await attachmentsRoute.POST(request('/api/attachments', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: badUpload,
    }));
    expect(rejectedFile.status).toBe(415);

    const pdfUpload = new FormData();
    pdfUpload.set('projectId', 'project_api');
    pdfUpload.set('expectedRevision', '1');
    pdfUpload.set('commandId', 'command_upload_pdf_0001');
    pdfUpload.set('file', new File(['%PDF-1.7\nsmall test document'], 'design.pdf', { type: 'application/pdf' }));
    const uploaded = await attachmentsRoute.POST(request('/api/attachments', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: pdfUpload,
    }));
    expect(uploaded.status).toBe(200);
    const uploadResult = await uploaded.json();
    expect(uploadResult.attachment.mimeType).toBe('application/pdf');

    const afterUpload = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    const incompletePackageState = await afterUpload.json() as { data: ReturnType<typeof createEmptyAccountingData> };
    incompletePackageState.data.attachments[0].storageKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf';
    const directIncompleteRestore = await accountingRoute.PUT(request('/api/accounting-data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ state: incompletePackageState.data, version: 9, replace: true, expectedRevision: 2, commandId: 'command_missing_attachment_1' }),
    }));
    expect(directIncompleteRestore.status).toBe(400);
    expect((await directIncompleteRestore.json()).error).toContain('بسته ZIP کامل');

    const phantomAttachment = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({
        commandId: 'command_phantom_file_01', expectedRevision: 2,
        commands: [{ type: 'attachments.upsert', value: uploadResult.attachment }],
      }),
    }));
    expect(phantomAttachment.status).toBe(400);

    const staleWrite = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ commandId: 'command_stale_000001', expectedRevision: 0, commands: writeBody.commands }),
    }));
    expect(staleWrite.status).toBe(409);

    const rejectedNormalReplace = await accountingRoute.PUT(request('/api/accounting-data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ state: data, version: 9, expectedRevision: 2 }),
    }));
    expect(rejectedNormalReplace.status).toBe(405);
    expect(await rejectedNormalReplace.json()).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' });

    const archiveResponse = await storageRoute.GET(request('/api/storage?action=backup.export', { headers: { cookie: cookieHeader } }));
    expect(archiveResponse.status).toBe(200);
    const archive = unzipSync(new Uint8Array(await archiveResponse.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(archive['backup.json'])) as { checksum?: string; data: { projects: Array<{ id: string }>; attachments: Array<{ storageKey: string; projectId?: string }> } };
    expect(manifest.data.projects[0].id).toBe('project_api');
    expect(manifest.data.attachments).toHaveLength(1);
    expect(archive[`attachments/${manifest.data.attachments[0].storageKey}`]).toBeDefined();

    const brokenArchive = { ...archive };
    const oldAttachmentKey = manifest.data.attachments[0].storageKey;
    const rollbackKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf';
    const rollbackBytes = brokenArchive[`attachments/${oldAttachmentKey}`];
    delete brokenArchive[`attachments/${oldAttachmentKey}`];
    brokenArchive[`attachments/${rollbackKey}`] = rollbackBytes;
    const brokenManifest = {
      ...manifest,
      data: {
        ...manifest.data,
        projects: [],
        attachments: [{ ...manifest.data.attachments[0], storageKey: rollbackKey }],
      },
    };
    delete brokenManifest.checksum;
    brokenArchive['backup.json'] = strToU8(JSON.stringify(brokenManifest));
    const brokenForm = new FormData();
    brokenForm.set('file', new File([zipSync(brokenArchive)], 'broken-backup.zip', { type: 'application/zip' }));
    brokenForm.set('expectedRevision', '2');
    brokenForm.set('commandId', 'command_backup_bad_001');
    const failedRestore = await storageRoute.POST(request('/api/storage?action=backup.import', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: brokenForm,
    }));
    expect(failedRestore.status).toBe(400);
    expect(existsSync(join(dataDirectory, 'attachments', rollbackKey))).toBe(false);
    const unchangedData = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await unchangedData.json()).data.projects[0].id).toBe('project_api');

    const importForm = new FormData();
    importForm.set('file', new File([zipSync(archive)], 'backup.zip', { type: 'application/zip' }));
    importForm.set('expectedRevision', '2');
    importForm.set('commandId', 'command_backup_good_01');
    const restored = await storageRoute.POST(request('/api/storage?action=backup.import', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: importForm,
    }));
    expect(restored.status).toBe(200);
    const restoredData = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await restoredData.json()).data.projects[0].id).toBe('project_api');

    const createdSnapshot = await storageRoute.POST(request('/api/storage', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ action: 'snapshot.create', reason: 'manual' }),
    }));
    const snapshotResult = await createdSnapshot.json() as { id: string; format: string };
    expect(snapshotResult.format).toBe('full');
    const snapshotList = await storageRoute.GET(request('/api/storage?action=snapshot.list', { headers: { cookie: cookieHeader } }));
    expect((await snapshotList.json()).snapshots.find((item: { id: string }) => item.id === snapshotResult.id).format).toBe('full');

    const withoutAttachment = JSON.parse(JSON.stringify(manifest.data)) as typeof manifest.data;
    withoutAttachment.attachments = [];
    const detachedReplace = await accountingRoute.PUT(request('/api/accounting-data', {
      method: 'PUT', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ state: withoutAttachment, version: 9, replace: true, expectedRevision: 3, commandId: 'command_replace_detached_1' }),
    }));
    expect(detachedReplace.status).toBe(200);
    unlinkSync(join(dataDirectory, 'attachments', oldAttachmentKey));
    const snapshotRestored = await storageRoute.POST(request('/api/storage', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ action: 'snapshot.restore', id: snapshotResult.id, expectedRevision: 4, commandId: 'command_snapshot_restore_1' }),
    }));
    expect(snapshotRestored.status).toBe(200);
    expect(existsSync(join(dataDirectory, 'attachments', oldAttachmentKey))).toBe(true);
    const afterSnapshotRestore = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await afterSnapshotRestore.json()).data.attachments).toHaveLength(1);

    // Simulate a pre-validation Yas import with a historic negative service balance.
    const { getServerDatabase } = await import('../lib/persistence/server-database');
    const legacyProduct = {
      id: 'yas_product_1', code: 'S-1', name: 'طراحی تردی', kind: 'service', unit: 'عدد',
      salePrice: 100, buyPrice: 0, averageCost: 0, stock: -304, minStock: 0,
    };
    getServerDatabase().prepare('INSERT INTO products(id, code, name, kind, sku, barcode, category, archived, payload) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, ?)')
      .run(legacyProduct.id, legacyProduct.code, legacyProduct.name, legacyProduct.kind, JSON.stringify(legacyProduct));
    const legacyInvoice = {
      id: 'legacy_invoice_300043', number: '300043', kind: 'sale', status: 'settled', date: '2026-01-01',
      customerId: 'customer_api', customerName: 'API customer', businessProfileId: data.settings.defaultBusinessProfileId,
      templateId: 'classic', paperSize: 'A4', items: [], discount: 0, tax: 0, shipping: 0, notes: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const legacyItem = { id: 'legacy_item_300043', productId: legacyProduct.id, description: legacyProduct.name, unit: 'عدد', qty: 0, unitPrice: 1_500_000, discount: 0 };
    getServerDatabase().prepare('INSERT INTO invoices(id, number, kind, status, date, customer_id, business_profile_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(legacyInvoice.id, legacyInvoice.number, legacyInvoice.kind, legacyInvoice.status, legacyInvoice.date, legacyInvoice.customerId, legacyInvoice.businessProfileId, JSON.stringify(legacyInvoice));
    getServerDatabase().prepare('INSERT INTO invoice_items(id, invoice_id, product_id, position, payload) VALUES (?, ?, ?, 0, ?)')
      .run(legacyItem.id, legacyInvoice.id, legacyItem.productId, JSON.stringify(legacyItem));
    const beforeProfileUpdate = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    const profileState = await beforeProfileUpdate.json() as { data: ReturnType<typeof createEmptyAccountingData>; revision: number };
    const updatedProfileData = structuredClone(profileState.data);
    updatedProfileData.settings.businessName = 'Updated API business';
    updatedProfileData.settings.businessProfiles[0].businessName = 'Updated API business';
    const profileUpdate = await accountingCommandsRoute.POST(request('/api/accounting-data/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({
        commandId: 'command_profile_legacy_01',
        expectedRevision: profileState.revision,
        commands: buildAccountingMutations(profileState.data, updatedProfileData),
      }),
    }));
    expect(profileUpdate.status, JSON.stringify(await profileUpdate.clone().json())).toBe(200);
    const afterProfileUpdate = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    const updatedProfileState = await afterProfileUpdate.json();
    expect(updatedProfileState.data.settings.businessProfiles[0].businessName).toBe('Updated API business');
    expect(updatedProfileState.data.invoices.find((invoice: { number: string }) => invoice.number === '300043').items[0].qty).toBe(0);

    const clearCommand = { action: 'database.clear', expectedRevision: 6, commandId: 'command_clear_accounting_01' };
    const cleared = await storageRoute.POST(request('/api/storage', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify(clearCommand),
    }));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).revision).toBe(7);
    expect(existsSync(join(dataDirectory, 'attachments', oldAttachmentKey))).toBe(false);
    const replayedClear = await storageRoute.POST(request('/api/storage', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify(clearCommand),
    }));
    expect(replayedClear.status).toBe(200);
    expect((await replayedClear.json()).revision).toBe(7);
    const emptyAfterClear = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await emptyAfterClear.json()).data).toBeNull();

    const logout = await authRoute.POST(request('/api/auth', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ action: 'logout' }),
    }));
    expect(logout.status).toBe(200);
    const deniedAgain = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect(deniedAgain.status).toBe(401);
  });
});
