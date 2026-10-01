import { describe, expect, it } from 'vitest';
import { createEmptyAccountingData, createSeedData, SEED_PRESETS } from '../lib/data';
import { validateAccountingData, validateAccountingSettingsUpdate } from '../lib/accounting-validation';

describe('server accounting invariants', () => {
  it('accepts every supported starter preset', () => {
    for (const preset of SEED_PRESETS) {
      const result = validateAccountingData(createSeedData(preset.id));
      expect(result, `${preset.id}: ${result.message || ''}`).toMatchObject({ ok: true });
    }
  });

  it('preserves unchanged invalid legacy stock while rejecting newly changed invalid stock', () => {
    const previous = createEmptyAccountingData();
    previous.products.push({
      id: 'legacy-service', code: 'S-1', name: 'طراحی تردی', kind: 'service', unit: 'عدد',
      salePrice: 100, buyPrice: 0, averageCost: 0, stock: -304, minStock: 0,
    });
    expect(validateAccountingData(previous).ok).toBe(false);

    const settingsOnlyUpdate = structuredClone(previous);
    settingsOnlyUpdate.settings.businessName = 'کسب‌وکار آزمایشی';
    expect(validateAccountingData(settingsOnlyUpdate, previous)).toMatchObject({ ok: true });

    const worsenedStock = structuredClone(settingsOnlyUpdate);
    worsenedStock.products[0].stock = -305;
    expect(validateAccountingData(worsenedStock, previous)).toMatchObject({ ok: false });

    const correctedStock = structuredClone(settingsOnlyUpdate);
    correctedStock.products[0].stock = 0;
    expect(validateAccountingData(correctedStock, previous)).toMatchObject({ ok: true });
  });

  it('does not remove a business profile referenced by an existing quote', () => {
    const previous = createEmptyAccountingData();
    previous.settings.businessProfiles.push({ ...previous.settings.businessProfiles[0], id: 'business_quote', label: 'پروفایل پیش‌فاکتور' });
    previous.quotes.push({
      id: 'quote_legacy', number: 'Q-1', status: 'draft', customerId: 'customer_legacy', customerName: 'مشتری',
      customerPhone: '', customerAddress: '', businessProfileId: 'business_quote', date: '2026-01-01',
      items: [], discount: 0, tax: 0, shipping: 0, notes: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const nextSettings = structuredClone(previous.settings);
    nextSettings.businessProfiles = nextSettings.businessProfiles.filter((profile) => profile.id !== 'business_quote');
    expect(validateAccountingSettingsUpdate(previous, nextSettings)).toMatchObject({ ok: false });
  });
});
