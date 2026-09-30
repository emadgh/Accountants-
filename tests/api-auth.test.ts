import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { createEmptyAccountingData } from '../lib/data';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { inspectZipArchive } from '../lib/zip-limits';

const previousDataDirectory = process.env.ACCOUNTING_DATA_DIR;
const dataDirectory = mkdtempSync(join(tmpdir(), 'accountants-api-'));
let authRoute: typeof import('../app/api/auth/route');
let accountingRoute: typeof import('../app/api/accounting-data/route');
let storageRoute: typeof import('../app/api/storage/route');
let attachmentsRoute: typeof import('../app/api/attachments/route');
let legacyMigrationRoute: typeof import('../app/api/sqlite/migrate/route');
let closeDatabase: typeof import('../lib/persistence/server-database').closeServerDatabase;

beforeAll(async () => {
  process.env.ACCOUNTING_DATA_DIR = dataDirectory;
  [authRoute, accountingRoute, storageRoute, attachmentsRoute, legacyMigrationRoute] = await Promise.all([
    import('../app/api/auth/route'),
    import('../app/api/accounting-data/route'),
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
    data.projects.push({ id: 'project_api', customerId: 'customer_api', title: 'API project', status: 'in-progress', agreedAmount: 100, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const write = await accountingRoute.PUT(request('/api/accounting-data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ state: data, version: 9, expectedRevision: 0 }),
    }));
    expect(write.status).toBe(200);

    const read = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    const saved = await read.json();
    expect(saved.data.customers[0].id).toBe('customer_api');
    expect(saved.revision).toBe(1);

    const badUpload = new FormData();
    badUpload.set('projectId', 'project_api');
    badUpload.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'fake.png', { type: 'image/png' }));
    const rejectedFile = await attachmentsRoute.POST(request('/api/attachments', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: badUpload,
    }));
    expect(rejectedFile.status).toBe(415);

    const pdfUpload = new FormData();
    pdfUpload.set('projectId', 'project_api');
    pdfUpload.set('file', new File(['%PDF-1.7\nsmall test document'], 'design.pdf', { type: 'application/pdf' }));
    const uploaded = await attachmentsRoute.POST(request('/api/attachments', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: pdfUpload,
    }));
    expect(uploaded.status).toBe(200);
    const uploadResult = await uploaded.json();
    expect(uploadResult.attachment.mimeType).toBe('application/pdf');

    const staleWrite = await accountingRoute.PUT(request('/api/accounting-data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ state: data, version: 9, expectedRevision: 0 }),
    }));
    expect(staleWrite.status).toBe(409);

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
    const failedRestore = await storageRoute.POST(request('/api/storage?action=backup.import', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: brokenForm,
    }));
    expect(failedRestore.status).toBe(400);
    expect(existsSync(join(dataDirectory, 'attachments', rollbackKey))).toBe(false);
    const unchangedData = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await unchangedData.json()).data.projects[0].id).toBe('project_api');

    const importForm = new FormData();
    importForm.set('file', new File([zipSync(archive)], 'backup.zip', { type: 'application/zip' }));
    const restored = await storageRoute.POST(request('/api/storage?action=backup.import', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader }, body: importForm,
    }));
    expect(restored.status).toBe(200);
    const restoredData = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect((await restoredData.json()).data.projects[0].id).toBe('project_api');

    const logout = await authRoute.POST(request('/api/auth', {
      method: 'POST', headers: { origin: 'http://localhost', cookie: cookieHeader },
      body: JSON.stringify({ action: 'logout' }),
    }));
    expect(logout.status).toBe(200);
    const deniedAgain = await accountingRoute.GET(request('/api/accounting-data', { headers: { cookie: cookieHeader } }));
    expect(deniedAgain.status).toBe(401);
  });
});
