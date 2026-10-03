import { normalizeStoredDate } from '../standards';
import type { Invoice, Product, ReturnDocument, StockMovement } from '../types';
import { invoiceTotal } from '../utils';
export function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function normalizedDate(value: string) {
  if (!value || value === 'ابتدای دوره') return '';
  return normalizeStoredDate(value);
}

export function inRange(value: string, fromDate: string, toDate: string) {
  const date = normalizedDate(value);
  if (!date) return false;
  return date >= fromDate && date <= toDate;
}

export function before(value: string, dateLimit: string) {
  if (value === 'ابتدای دوره') return true;
  const date = normalizedDate(value);
  return !!date && date < dateLimit;
}

export function onOrBefore(value: string, dateLimit: string) {
  if (value === 'ابتدای دوره') return true;
  const date = normalizedDate(value);
  return !!date && date <= dateLimit;
}

export function invoiceRawSubtotal(invoice: Invoice) {
  return invoice.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
}

export function invoiceAmountForProduct(invoice: Invoice, productId: string) {
  if (!productId) return invoiceTotal(invoice);
  const subtotal = invoiceRawSubtotal(invoice);
  if (subtotal <= 0) return 0;
  const selected = invoice.items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  return invoiceTotal(invoice) * (selected / subtotal);
}

export function returnAmountForProduct(document: ReturnDocument, productId: string) {
  if (!productId) return Number(document.totalAmount || 0);
  const subtotal = document.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  if (subtotal <= 0) return 0;
  const selected = document.items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  return Number(document.totalAmount || 0) * (selected / subtotal);
}

export function productNames(invoice: Invoice, products: Product[], productId: string) {
  if (productId) return products.find((item) => item.id === productId)?.name || '—';
  const names = [...new Set(invoice.items.map((item) => products.find((p) => p.id === item.productId)?.name || item.description).filter(Boolean))];
  return names.slice(0, 3).join('، ') + (names.length > 3 ? '…' : '');
}

export function movementSortKey(movement: StockMovement) {
  const date = movement.date === 'ابتدای دوره' ? '0000-00-00' : normalizedDate(movement.date);
  return date + '|' + movement.createdAt + '|' + movement.id;
}

export function movementLabel(movement: StockMovement) {
  if (movement.type === 'opening') return 'موجودی اول دوره';
  if (movement.type === 'purchase') return 'خرید';
  if (movement.type === 'sale') return 'فروش';
  if (movement.type === 'sale-return') return 'مرجوعی فروش';
  if (movement.type === 'purchase-return') return 'مرجوعی خرید';
  if (movement.type === 'adjustment') return movement.action === 'count' ? 'شمارش انبار' : 'اصلاح موجودی';
  return 'برگشت / اصلاح سند';
}

export function asOfInventory(product: Product, movements: StockMovement[], toDate: string) {
  const rows = movements
    .filter((movement) => movement.productId === product.id && onOrBefore(movement.date, toDate))
    .sort((a, b) => movementSortKey(a).localeCompare(movementSortKey(b)));
  const last = rows.at(-1);
  return {
    stock: last ? Number(last.balanceAfter || 0) : 0,
    averageCost: last ? Number(last.averageCostAfter || 0) : Number(product.averageCost || product.buyPrice || 0),
  };
}

