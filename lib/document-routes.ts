export function documentsAliasHref(kind: 'sale' | 'purchase', query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  params.set('kind', kind);
  return `/documents?${params}`;
}
