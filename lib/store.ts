'use client';
import { create } from 'zustand';
import { createJSONStorage,persist } from 'zustand/middleware';
import { buildAccountingMutations } from './accounting-commands';
import { createEmptyAccountingData } from './data';
import { DOMAIN_ACTIONS } from './domain/commands';
import { createAccountingState,executeDomainOperation } from './domain/engine';
import { buildOpeningMovements,legacyBusinessProfile,normalizeAccountingData,normalizeProducts,type AccountingState } from './domain/shared';
import { ACCOUNTING_SCHEMA_VERSION,accountingStateStorage,alignAccountingPersistedBaseline,onAccountingServerState,withAccountingCommands,withDomainCommand } from './storage';
import type { AccountingData,BusinessSettings } from './types';
export { normalizeAccountingData } from './domain/shared';

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set, get) => {
      const state = createAccountingState(set, get);
      for (const action of DOMAIN_ACTIONS) {
        Object.assign(state, { [action]: (...args: unknown[]) => {
          const command = { type: 'domain.execute' as const, action, args, seed: crypto.randomUUID().replace(/-/g, '') };
          const execution = executeDomainOperation(get(), action, args, command.seed);
          const result = execution.result as { ok?: boolean } | undefined;
          if (result?.ok !== false) withDomainCommand(command, () => set(execution.data));
          return execution.result;
        } });
      }
      for (const action of ['upsertQuote', 'setQuoteStatus', 'upsertProject', 'createBusinessProfile', 'upsertBusinessProfile', 'deleteBusinessProfile', 'setDefaultBusinessProfile', 'setSettings'] as const) {
        Object.assign(state, { [action]: (...args: unknown[]) => {
          const before = get();
          const execution = executeDomainOperation(before, action, args);
          const result = execution.result as { ok?: boolean } | undefined;
          if (result?.ok !== false) withAccountingCommands(buildAccountingMutations(before, execution.data), () => set(execution.data));
          return execution.result;
        } });
      }
      return state;
    },
    {
      name: 'accountants-web-v1',
      storage: createJSONStorage(() => accountingStateStorage),
      version: ACCOUNTING_SCHEMA_VERSION,
      skipHydration: true,
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as Partial<AccountingData>;
        const defaults = createEmptyAccountingData();
        const products = normalizeProducts(state.products ?? defaults.products);
        const mergedSettings: BusinessSettings = {
          ...defaults.settings,
          ...(state.settings || {}),
          numbering: {
            ...defaults.settings.numbering,
            ...(state.settings?.numbering || {}),
          },
          businessProfiles: state.settings?.businessProfiles || [],
          defaultBusinessProfileId: state.settings?.defaultBusinessProfileId || '',
        };
        const migratedSettings: BusinessSettings = mergedSettings.businessProfiles.length
          ? mergedSettings
          : {
              ...mergedSettings,
              businessProfiles: [legacyBusinessProfile(mergedSettings)],
              defaultBusinessProfileId: 'business_default',
            };
        return normalizeAccountingData({
          ...defaults,
          ...state,
          customers: (state.customers ?? defaults.customers).map((customer) => ({
            ...customer,
            openingBalance: Number(customer.openingBalance || 0),
          })),
          products,
          invoices: state.invoices ?? defaults.invoices,
          returns: state.returns || [],
          payments: state.payments ?? defaults.payments,
          checks: state.checks ?? defaults.checks,
          adjustments: state.adjustments || [],
          stockMovements: state.stockMovements?.length ? state.stockMovements : buildOpeningMovements(products),
          accounts: state.accounts || [],
          journalEntries: state.journalEntries || [],
          moneyTransactions: state.moneyTransactions || [],
          quotes: state.quotes || [],
          projects: state.projects || [],
          attachments: state.attachments || [],
          settings: migratedSettings,
        });
      },
      merge: (persistedState, currentState) => {
        const defaults = createEmptyAccountingData();
        const persisted = (persistedState || {}) as Partial<AccountingData>;
        const data = {
          ...defaults,
          ...persisted,
          settings: {
            ...defaults.settings,
            ...(persisted.settings || {}),
            numbering: {
              ...defaults.settings.numbering,
              ...(persisted.settings?.numbering || {}),
            },
          },
        } as AccountingData;
        const normalized = normalizeAccountingData(data);
        alignAccountingPersistedBaseline(normalized);
        return { ...currentState, ...normalized };
      },
      partialize: (state) => ({
        customers: state.customers,
        products: state.products,
        invoices: state.invoices,
        returns: state.returns,
        payments: state.payments,
        checks: state.checks,
        adjustments: state.adjustments,
        stockMovements: state.stockMovements,
        accounts: state.accounts,
        journalEntries: state.journalEntries,
        moneyTransactions: state.moneyTransactions,
        quotes: state.quotes,
        projects: state.projects,
        attachments: state.attachments,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    }
  )
);

onAccountingServerState((data) => {
  const normalized = normalizeAccountingData(data);
  alignAccountingPersistedBaseline(normalized);
  useAccountingStore.setState(normalized);
});
