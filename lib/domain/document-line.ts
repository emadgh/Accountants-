import type { InvoiceItem, InvoiceKind, Product } from '../types';
export function productLinePatch(product: Product | undefined, kind: InvoiceKind = 'sale'): Partial<InvoiceItem> {
  return product ? { productId: product.id, description: product.name, unit: product.unit, unitPrice: kind === 'sale' ? product.salePrice : product.buyPrice } : { productId: undefined };
}
export function patchDocumentLine<T extends { id: string }>(items: readonly T[], id: string, values: Partial<T>): T[] {
  return items.map(item => item.id === id ? {...item,...values} : item);
}
