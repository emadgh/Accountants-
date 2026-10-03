import {
  journalForStockAdjustment
} from '../accounting';
import type {
  Product,
  StockMovement
} from '../types';
import {
  uid as randomUid,
  todayFa
} from '../utils';

import type { DomainContext } from './engine';
import { MAIN_WAREHOUSE_ID } from './shared';
import { productKindForInvoice } from './product-kind';

export function inventoryActions({ set, get, uid = randomUid }: DomainContext): Pick<import('./shared').AccountingState, 'upsertProduct' | 'deleteProduct' | 'addStockAdjustment'> {
  return {
    upsertProduct: (product) => {
      const state = get();
      const duplicateSku = product.sku?.trim() && state.products.some((item) => item.id !== product.id && item.sku?.trim().toLowerCase() === product.sku!.trim().toLowerCase());
      const duplicateBarcode = product.barcode?.trim() && state.products.some((item) => item.id !== product.id && item.barcode?.trim().toLowerCase() === product.barcode!.trim().toLowerCase());
      if (duplicateSku) return { ok: false, message: 'SKU تکراری است.' };
      if (duplicateBarcode) return { ok: false, message: 'بارکد تکراری است.' };
      const previous = state.products.find((item) => item.id === product.id);
      if (previous) {
        // Accept catalogue edits only. The client cannot alter historical classification.
        const invoiceKinds: NonNullable<Product['invoiceKinds']> = Object.assign(Object.create(null), previous.invoiceKinds);
        if (previous.kind !== product.kind) {
          for (const invoice of state.invoices) {
            if (invoice.status !== 'draft' && invoice.items.some((item) => item.productId === previous.id)) {
              invoiceKinds[invoice.id] = productKindForInvoice(previous, invoice)!;
            }
          }
        }
        const normalized: Product = { ...product, invoiceKinds: Object.keys(invoiceKinds).length ? invoiceKinds : undefined, stock: previous.stock, averageCost: Number(previous.averageCost ?? previous.buyPrice ?? product.buyPrice ?? 0) };
        set({ products: state.products.map((item) => item.id === product.id ? normalized : item) });
        return { ok: true };
      }
      const normalized: Product = { ...product, invoiceKinds: undefined, averageCost: Number(product.averageCost ?? product.buyPrice ?? 0) };
      let stockMovements = state.stockMovements;
      if (normalized.kind === 'product' && Math.abs(Number(normalized.stock || 0)) > 0.0001) {
        const averageCost = Number(normalized.averageCost || 0);
        stockMovements = [...stockMovements, {
          id: uid('stock'), productId: normalized.id, warehouseId: MAIN_WAREHOUSE_ID, date: todayFa(), createdAt: new Date().toISOString(),
          quantity: Number(normalized.stock || 0), balanceAfter: Number(normalized.stock || 0), averageCostAfter: averageCost, unitCost: averageCost,
          type: 'opening', action: 'product-opening', sourceType: 'system', sourceId: normalized.id, sourceReference: 'موجودی اولیه کالا',
        }];
      }
      const newMovements = stockMovements.slice(state.stockMovements.length);
      set({ products: [normalized, ...state.products], stockMovements, journalEntries: [...state.journalEntries, ...newMovements.flatMap((movement) => journalForStockAdjustment(movement, state.accounts))] });
      return { ok: true };
    },

    deleteProduct: (id) => {
      const state = get();
      const used =
        state.invoices.some((invoice) => invoice.items.some((item) => item.productId === id)) ||
        state.returns.some((document) => document.items.some((item) => item.productId === id)) ||
        state.stockMovements.some((movement) => movement.productId === id);
      if (used) {
        return { ok: false, message: 'این کالا/خدمت دارای سابقه سند یا کاردکس است و برای حفظ یکپارچگی سوابق قابل حذف نیست.' };
      }
      set({ products: state.products.filter((product) => product.id !== id) });
      return { ok: true };
    },

    addStockAdjustment: (input) => {
      const state = get();
      const index = state.products.findIndex((product) => product.id === input.productId);
      if (index < 0) return { ok: false, message: 'کالا پیدا نشد.' };
      const current = state.products[index];
      if (current.kind !== 'product') return { ok: false, message: 'برای خدمات موجودی انبار ثبت نمی‌شود.' };
      if (!input.note.trim()) return { ok: false, message: 'دلیل اصلاح/شمارش موجودی الزامی است.' };

      const currentStock = Number(current.stock || 0);
      const quantity = input.mode === 'count' ? Number(input.quantity) - currentStock : Number(input.quantity);
      if (!Number.isFinite(quantity) || Math.abs(quantity) < 0.0001) {
        return { ok: false, message: 'تغییری در موجودی ایجاد نشده است.' };
      }
      const newStock = currentStock + quantity;
      if (newStock < -0.0001) {
        return { ok: false, message: 'اصلاح موجودی نمی‌تواند موجودی را منفی کند.' };
      }

      const averageCost = Number(current.averageCost ?? current.buyPrice ?? 0);
      const product: Product = { ...current, stock: Math.abs(newStock) < 0.0001 ? 0 : newStock, averageCost };
      const products = state.products.map((item, productIndex) => productIndex === index ? product : item);
      const sourceId = uid('stockadj');
      const movement: StockMovement = {
        id: uid('stock'),
        productId: product.id,
        warehouseId: MAIN_WAREHOUSE_ID,
        date: input.date,
        createdAt: new Date().toISOString(),
        quantity,
        balanceAfter: product.stock,
        averageCostAfter: averageCost,
        unitCost: averageCost,
        type: 'adjustment',
        action: input.mode === 'count' ? 'count' : 'manual-adjustment',
        sourceType: 'adjustment',
        sourceId,
        sourceReference: input.mode === 'count' ? 'شمارش انبار' : 'اصلاح موجودی',
        note: input.note.trim(),
      };
      set({
        products,
        stockMovements: [...state.stockMovements, movement],
        journalEntries: [...state.journalEntries, ...journalForStockAdjustment(movement, state.accounts)],
      });
      return { ok: true };
    },

  };
}
