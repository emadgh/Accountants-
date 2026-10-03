import type { Invoice, Product, ProductKind } from '../types';

/** Changing the catalogue must not reinterpret a document already posted. */
export function productKindForInvoice(product: Product | undefined, invoice: Pick<Invoice, 'id' | 'status'>): ProductKind | undefined {
  const kinds = product?.invoiceKinds;
  return (invoice.status !== 'draft' && kinds && Object.hasOwn(kinds, invoice.id) ? kinds[invoice.id] : undefined) ?? product?.kind;
}
