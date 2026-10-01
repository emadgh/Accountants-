import type { AccountingData } from './types';

export const ACCOUNTING_COLLECTIONS = [
  'customers', 'products', 'invoices', 'returns', 'payments', 'checks', 'adjustments',
  'stockMovements', 'accounts', 'journalEntries', 'moneyTransactions', 'quotes', 'projects', 'attachments',
] as const;

export type AccountingCollection = typeof ACCOUNTING_COLLECTIONS[number];
type CollectionItem<K extends AccountingCollection> = AccountingData[K][number];

export type AccountingMutation = {
  [K in AccountingCollection]:
    | { type: `${K}.upsert`; value: CollectionItem<K> }
    | { type: `${K}.delete`; id: string }
}[AccountingCollection] | { type: 'settings.update'; value: AccountingData['settings'] };

export interface AccountingCommandRequest {
  commandId: string;
  expectedRevision: number | null;
  commands: AccountingMutation[];
}

export function buildAccountingMutations(previous: AccountingData, next: AccountingData): AccountingMutation[] {
  const mutations: AccountingMutation[] = [];
  if (JSON.stringify(previous.settings) !== JSON.stringify(next.settings)) {
    mutations.push({ type: 'settings.update', value: next.settings });
  }

  for (const collection of ACCOUNTING_COLLECTIONS) {
    const before = previous[collection] as Array<{ id: string }>;
    const after = next[collection] as Array<{ id: string }>;
    const beforeById = new Map(before.map((item) => [item.id, item]));
    const afterById = new Map(after.map((item) => [item.id, item]));
    for (const item of before) {
      if (!afterById.has(item.id)) {
        mutations.push({ type: `${collection}.delete`, id: item.id } as AccountingMutation);
      }
    }
    for (const item of after) {
      if (JSON.stringify(beforeById.get(item.id)) !== JSON.stringify(item)) {
        mutations.push({ type: `${collection}.upsert`, value: item } as AccountingMutation);
      }
    }
  }
  return mutations;
}

export function applyAccountingMutations(data: AccountingData, commands: AccountingMutation[]): AccountingData {
  let next = data;
  for (const command of commands) {
    if (command.type === 'settings.update') {
      next = { ...next, settings: command.value };
      continue;
    }
    const record = command as AccountingMutation & { type: string; id?: string; value?: unknown };
    const separator = record.type.lastIndexOf('.');
    const collection = record.type.slice(0, separator) as AccountingCollection;
    const operation = record.type.slice(separator + 1);
    if (!ACCOUNTING_COLLECTIONS.includes(collection)) throw new Error('فرمان حسابداری شناخته‌شده نیست.');
    const rows = next[collection] as Array<{ id: string }>;
    if (operation === 'delete') {
      next = { ...next, [collection]: rows.filter((item) => item.id !== record.id) };
    } else if (operation === 'upsert') {
      const value = record.value as { id: string };
      const existing = rows.some((item) => item.id === value.id);
      next = { ...next, [collection]: existing
        ? rows.map((item) => item.id === value.id ? value : item)
        : [value, ...rows] };
    } else {
      throw new Error('نوع فرمان حسابداری معتبر نیست.');
    }
  }
  return next;
}
