import type {
  Invoice,
  OperationResult,
  Product,
  ReturnDocument,
  StockMovement,
  StockMovementAction
} from '../types';
import {
  uid
} from '../utils';
import { productKindForInvoice } from './product-kind';

export const MAIN_WAREHOUSE_ID = 'main';

export type InventoryApplyResult = OperationResult & {
  products: Product[];
  stockMovements: StockMovement[];
};

export function normalizeProducts(products: Product[]) {
  return products.map((product) => ({
    ...product,
    averageCost: Number(product.averageCost ?? product.buyPrice ?? 0),
    sku: product.sku?.trim() || undefined,
    barcode: product.barcode?.trim() || undefined,
    category: product.category?.trim() || undefined,
    archived: Boolean(product.archived),
  }));
}

export function buildOpeningMovements(products: Product[]): StockMovement[] {
  return products
    .filter((product) => product.kind === 'product' && Math.abs(Number(product.stock || 0)) > 0.0001)
    .map((product) => {
      const averageCost = Number(product.averageCost ?? product.buyPrice ?? 0);
      return {
        id: 'stock_open_' + product.id,
        productId: product.id,
        warehouseId: MAIN_WAREHOUSE_ID,
        date: 'ابتدای دوره',
        createdAt: '2000-01-01T00:00:00.000Z',
        quantity: Number(product.stock || 0),
        balanceAfter: Number(product.stock || 0),
        averageCostAfter: averageCost,
        unitCost: averageCost,
        type: 'opening' as const,
        action: 'migration-opening' as const,
        sourceType: 'system' as const,
        sourceId: 'migration-v3',
        sourceReference: 'موجودی انتقالی',
        note: 'مانده موجودی پیش از فعال شدن کاردکس انبار',
      };
    });
}

export function applyInvoiceInventory(
  products: Product[],
  stockMovements: StockMovement[],
  invoice: Invoice,
  direction: 1 | -1,
  action: StockMovementAction
): InventoryApplyResult {
  const nextProducts = normalizeProducts(products);
  const nextMovements = [...stockMovements];

  for (const item of invoice.items) {
    if (!item.productId) continue;
    const index = nextProducts.findIndex((product) => product.id === item.productId);
    if (index < 0) continue;
    const product = { ...nextProducts[index] };
    if (productKindForInvoice(product, invoice) !== 'product') continue;

    const baseQuantity = invoice.kind === 'sale' ? -Number(item.qty || 0) : Number(item.qty || 0);
    const quantity = baseQuantity * direction;
    const currentStock = Number(product.stock || 0);
    const currentAverage = Number(product.averageCost ?? product.buyPrice ?? 0);
    const newStock = currentStock + quantity;

    if (newStock < -0.0001) {
      return {
        ok: false,
        message: 'برگشت/ثبت سند باعث موجودی منفی برای «' + product.name + '» می‌شود. موجودی فعلی: ' + currentStock + ' ' + product.unit + '.',
        products,
        stockMovements,
      };
    }

    let unitCost = currentAverage;
    let newAverage = currentAverage;

    if (invoice.kind === 'purchase') {
      unitCost = Math.max(0, Number(item.unitPrice || 0));
      const newValue = currentStock * currentAverage + quantity * unitCost;
      newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
      if (direction === 1) product.buyPrice = unitCost;
    } else if (direction === -1) {
      const originalSale = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'invoice' &&
          movement.sourceId === invoice.id &&
          movement.productId === product.id &&
          movement.type === 'sale' &&
          movement.quantity < 0
      );
      unitCost = Number(originalSale?.unitCost ?? currentAverage);
      const newValue = currentStock * currentAverage + quantity * unitCost;
      newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
    }

    product.stock = Math.abs(newStock) < 0.0001 ? 0 : newStock;
    product.averageCost = newAverage;
    nextProducts[index] = product;

    nextMovements.push({
      id: uid('stock'),
      productId: product.id,
      warehouseId: MAIN_WAREHOUSE_ID,
      date: invoice.date,
      createdAt: new Date().toISOString(),
      quantity,
      balanceAfter: product.stock,
      averageCostAfter: newAverage,
      unitCost,
      type: direction === -1 ? 'reversal' : invoice.kind === 'sale' ? 'sale' : 'purchase',
      action,
      sourceType: 'invoice',
      sourceId: invoice.id,
      sourceReference: invoice.number,
      sourceKind: invoice.kind,
      note: action === 'revision-reversal'
        ? 'برگشت اثر نسخه قبلی فاکتور'
        : action === 'void-reversal'
          ? 'برگشت اثر فاکتور باطل‌شده'
          : action === 'revision'
            ? 'ثبت Revision جدید فاکتور'
            : undefined,
    });
  }

  return { ok: true, products: nextProducts, stockMovements: nextMovements };
}

export function applyReturnInventory(
  products: Product[],
  stockMovements: StockMovement[],
  document: ReturnDocument,
  originalInvoice: Invoice,
  direction: 1 | -1,
  action: StockMovementAction
): InventoryApplyResult {
  const nextProducts = normalizeProducts(products);
  const nextMovements = [...stockMovements];

  for (const item of document.items) {
    if (!item.productId) continue;
    const index = nextProducts.findIndex((product) => product.id === item.productId);
    if (index < 0) continue;
    const product = { ...nextProducts[index] };
    if (productKindForInvoice(product, originalInvoice) !== 'product') continue;

    const baseQuantity = document.kind === 'sale-return' ? Number(item.qty || 0) : -Number(item.qty || 0);
    const quantity = baseQuantity * direction;
    const currentStock = Number(product.stock || 0);
    const currentAverage = Number(product.averageCost ?? product.buyPrice ?? 0);
    const newStock = currentStock + quantity;

    if (newStock < -0.0001) {
      return {
        ok: false,
        message: 'مرجوعی باعث موجودی منفی برای «' + product.name + '» می‌شود. موجودی فعلی: ' + currentStock + ' ' + product.unit + '.',
        products,
        stockMovements,
      };
    }

    let unitCost = currentAverage;
    if (direction === -1) {
      const originalReturnMovement = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'return' &&
          movement.sourceId === document.id &&
          movement.productId === product.id &&
          (movement.type === 'sale-return' || movement.type === 'purchase-return')
      );
      unitCost = Number(originalReturnMovement?.unitCost ?? currentAverage);
    } else if (document.kind === 'sale-return') {
      const originalSaleMovement = [...nextMovements].reverse().find(
        (movement) =>
          movement.sourceType === 'invoice' &&
          movement.sourceId === originalInvoice.id &&
          movement.productId === product.id &&
          movement.type === 'sale'
      );
      unitCost = Number(originalSaleMovement?.unitCost ?? currentAverage);
    } else {
      const originalItem = originalInvoice.items.find((source) => source.id === item.originalItemId);
      unitCost = Number(originalItem?.unitPrice ?? item.unitPrice ?? currentAverage);
    }

    const newValue = currentStock * currentAverage + quantity * unitCost;
    const newAverage = newStock > 0.0001 ? Math.max(0, newValue / newStock) : 0;
    product.stock = Math.abs(newStock) < 0.0001 ? 0 : newStock;
    product.averageCost = newAverage;
    nextProducts[index] = product;

    nextMovements.push({
      id: uid('stock'),
      productId: product.id,
      warehouseId: MAIN_WAREHOUSE_ID,
      date: document.date,
      createdAt: new Date().toISOString(),
      quantity,
      balanceAfter: product.stock,
      averageCostAfter: newAverage,
      unitCost,
      type: direction === -1 ? 'reversal' : document.kind,
      action,
      sourceType: 'return',
      sourceId: document.id,
      sourceReference: document.number,
      sourceKind: document.kind,
      note: direction === -1 ? 'برگشت اثر سند مرجوعی باطل‌شده' : 'مرجوعی مرتبط با فاکتور ' + originalInvoice.number,
    });
  }

  return { ok: true, products: nextProducts, stockMovements: nextMovements };
}

