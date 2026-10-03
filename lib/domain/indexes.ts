/** Arrays are immutable store snapshots; indexes are reused until that array changes. */
const groupedCache = new WeakMap<object, Map<PropertyKey, Map<string, object[]>>>();
const idCache = new WeakMap<object, Map<string, object>>();
export function recordsById<T extends { id: string }>(records: readonly T[]): ReadonlyMap<string, T> {
  let index = idCache.get(records);
  if (!index) { index = new Map(records.map(record => [record.id, record])); idCache.set(records, index); }
  return index as Map<string, T>;
}
export function recordsByField<T extends object>(records: readonly T[], field: keyof T): ReadonlyMap<string, readonly T[]> {
  let fields = groupedCache.get(records);
  if (!fields) { fields = new Map(); groupedCache.set(records, fields); }
  let index = fields.get(field);
  if (!index) {
    index = new Map();
    for (const record of records) { const key = String(record[field] ?? ''); const group = index.get(key) || []; group.push(record); index.set(key, group); }
    fields.set(field, index);
  }
  return index as Map<string, T[]>;
}
