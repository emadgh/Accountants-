import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAccountingData } from '../lib/data';
import { ACCOUNTING_PERSIST_KEY, ACCOUNTING_SCHEMA_VERSION, accountingStateStorage, flushAccountingPersistence, withAccountingCommands } from '../lib/storage';

afterEach(() => vi.unstubAllGlobals());

describe('accounting persistence recovery', () => {
  it('reloads the last server state after a rejected write', async () => {
    const committedData = createEmptyAccountingData();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/accounting-data' && !init?.method) {
        return Response.json({ data: committedData, revision: 4 });
      }
      if (path === '/api/accounting-data/commands') {
        return Response.json({ error: 'فرمان ذخیره نشد.' }, { status: 409 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await accountingStateStorage.getItem(ACCOUNTING_PERSIST_KEY);
    const attemptedData = createEmptyAccountingData();
    attemptedData.settings.businessName = 'تغییر ذخیره‌نشده';
    const attemptedEnvelope = JSON.stringify({ state: attemptedData, version: ACCOUNTING_SCHEMA_VERSION });
    await accountingStateStorage.setItem(ACCOUNTING_PERSIST_KEY, attemptedEnvelope);
    await expect(flushAccountingPersistence()).rejects.toThrow('فرمان ذخیره نشد.');

    const recoveredEnvelope = await accountingStateStorage.getItem(ACCOUNTING_PERSIST_KEY);
    expect(recoveredEnvelope).not.toBeNull();
    expect(JSON.parse(recoveredEnvelope!).state.settings.businessName).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('sends only a settings command when editing a profile after legacy hydration', async () => {
    const raw = createEmptyAccountingData();
    raw.customers.push({
      id: 'customer_legacy', code: 'C-1', name: 'مشتری', kind: 'customer', status: 'active',
      phone: '', address: '', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    });
    raw.invoices.push({
      id: 'invoice_legacy', number: '300043', kind: 'sale', status: 'settled', date: '2026-01-01',
      customerId: 'customer_legacy', customerName: 'مشتری', customerPhone: '', customerAddress: '',
      businessProfileId: 'business_default', templateId: 'classic', paperSize: 'A4',
      items: [{ id: 'line_legacy', description: 'خدمت قدیمی', unit: 'عدد', qty: 0, unitPrice: 1_500_000 }],
      discount: 0, tax: 0, shipping: 0, notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const postedCommands: Array<{ type: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/accounting-data') return Response.json({ data: raw, revision: 7 });
      if (path === '/api/accounting-data/commands') {
        const body = JSON.parse(String(init?.body)) as { commands: Array<{ type: string }> };
        postedCommands.push(...body.commands);
        return Response.json({ ok: true, revision: 8 });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { useAccountingStore } = await import('../lib/store');
    await useAccountingStore.persist.rehydrate();
    const store = useAccountingStore.getState();
    const profile = store.settings.businessProfiles[0];
    expect(store.upsertBusinessProfile({ ...profile, businessName: 'کسب‌وکار جدید' }).ok).toBe(true);
    await flushAccountingPersistence();
    expect(postedCommands.map((command) => command.type)).toEqual(['settings.update']);
  });
  it('keeps the form value and withholds its success callback when a write fails', async () => {
    const { persistOperation } = await import('../lib/operation-result');
    const committed = createEmptyAccountingData();
    let offline = false;
    vi.stubGlobal('fetch', vi.fn(async (_path: unknown, init?: RequestInit) => {
      if (offline) throw new TypeError('Failed to fetch');
      return Response.json(init?.method ? { revision: 2, data: committed } : { revision: 1, data: committed });
    }));
    await accountingStateStorage.getItem(ACCOUNTING_PERSIST_KEY);
    const form = { businessName: 'نام ذخیره‌نشده' };
    const success = vi.fn(); offline = true;
    const result = await persistOperation(() => {
      const next = structuredClone(committed); next.settings.businessName = form.businessName;
      void accountingStateStorage.setItem(ACCOUNTING_PERSIST_KEY, JSON.stringify({state: next}));
      return {ok: true};
    });
    if (result.ok) success();
    expect(result).toMatchObject({ok: false, code: 'NETWORK_UNAVAILABLE'});
    expect(success).not.toHaveBeenCalled(); expect(form.businessName).toBe('نام ذخیره‌نشده');
    offline = false; await accountingStateStorage.getItem(ACCOUNTING_PERSIST_KEY);
    await expect(flushAccountingPersistence()).resolves.toBeUndefined();
  });

  it('loads canonical data when the response is lost after commit, without applying twice', async () => {
    const committed = createEmptyAccountingData(); let posts = 0; let applied = 0;
    const fetchMock = vi.fn(async (_path: unknown, init?: RequestInit) => {
      if (!init?.method) return Response.json({data: committed, revision: applied ? 2 : 1});
      posts++;
      if (posts === 1) { applied++; committed.settings.businessName = 'تأیید سرور'; throw new TypeError('Lost response'); }
      return Response.json({revision: 2});
    });
    vi.stubGlobal('fetch', fetchMock);
    await accountingStateStorage.getItem(ACCOUNTING_PERSIST_KEY);
    const next = structuredClone(committed); next.settings.businessName = 'تأیید سرور';
    withAccountingCommands([{type:'settings.update',value:next.settings}], () => {
      void accountingStateStorage.setItem(ACCOUNTING_PERSIST_KEY, JSON.stringify({state:next}));
    });
    await flushAccountingPersistence();
    expect(applied).toBe(1); expect(posts).toBe(2);
    const bodies = fetchMock.mock.calls.filter(call => call[1]?.method).map(call => JSON.parse(String(call[1]?.body)));
    expect(bodies[0].commandId).toBe(bodies[1].commandId);
    expect(fetchMock.mock.calls.filter(call=>!call[1]?.method)).toHaveLength(2);
  });

});
