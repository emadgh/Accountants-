import { createEmptyAccountingData } from '../data';
import type { AccountingData } from '../types';
import { businessActions } from './business';
import { documentsActions } from './documents';
import { financeActions } from './finance';
import { inventoryActions } from './inventory';
import { paymentsActions } from './payments';
import { normalizeAccountingData, type AccountingState } from './shared';

export type DomainContext = {
  set: (update: Partial<AccountingState> | ((state: AccountingState) => Partial<AccountingState>)) => void;
  get: () => AccountingState;
  uid?: (prefix?: string) => string;
};

export function createAccountingState(set: DomainContext['set'], get: DomainContext['get'], idFactory?: DomainContext['uid']): AccountingState {
  const context = { set, get, uid: idFactory };
  return {
    ...normalizeAccountingData(createEmptyAccountingData()), hydrated: false,
    setHydrated: (hydrated) => set({ hydrated }),
    ...documentsActions(context),
    ...paymentsActions(context),
    ...inventoryActions(context),
    ...financeActions(context),
    ...businessActions(context),
  };
}

/** Runs an operation without React, browser storage or database side effects. */
export function executeDomainOperation(data: AccountingData, action: string, args: unknown[], seed?: string) {
  let state: AccountingState;
  let counter = 0;
  const set: DomainContext['set'] = (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  const values = Object.fromEntries(Object.entries(data).filter(([key, value]) => key !== 'hydrated' && typeof value !== 'function'));
  state = { ...createAccountingState(set, () => state, seed ? (prefix = 'id') => `${prefix}_${seed}_${counter++}` : undefined), ...values } as AccountingState;
  const operation = state[action as keyof AccountingState];
  if (typeof operation !== 'function') throw new Error('فرمان حسابداری شناخته‌شده نیست.');
  const result = (operation as (...values: unknown[]) => unknown)(...args);
  const next = Object.fromEntries(Object.entries(state).filter(([key, value]) => key !== 'hydrated' && typeof value !== 'function'));
  return { data: next as unknown as AccountingData, result };
}
