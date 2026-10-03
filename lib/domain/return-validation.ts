import type {
  Invoice,
  ReturnAuditAction,
  ReturnDocument,
  ReturnItem,
  ReturnOperationResult
} from '../types';
import {
  returnedQuantityForItem,
  uid
} from '../utils';

import { isPosted } from './document-validation';
export function appendReturnAudit(document: ReturnDocument, action: ReturnAuditAction, note?: string) {
  return [
    ...(document.auditTrail || []),
    {
      id: uid('audit'),
      action,
      at: new Date().toISOString(),
      ...(note?.trim() ? { note: note.trim() } : {}),
    },
  ];
}

export function normalizeReturnItems(document: ReturnDocument, originalInvoice: Invoice): ReturnItem[] {
  const items: ReturnItem[] = [];
  for (const item of document.items) {
    const source = originalInvoice.items.find((original) => original.id === item.originalItemId);
    const qty = Number(item.qty || 0);
    if (!source || qty <= 0) continue;
    items.push({
      id: item.id || uid('retrow'),
      originalItemId: source.id,
      productId: source.productId,
      description: source.description,
      unit: source.unit,
      qty,
      unitPrice: Number(source.unitPrice || 0),
    });
  }
  return items;
}

export function validateReturn(
  document: ReturnDocument,
  originalInvoice: Invoice | undefined,
  allReturns: ReturnDocument[]
): ReturnOperationResult {
  if (!originalInvoice || !isPosted(originalInvoice.status)) {
    return { ok: false, message: 'فاکتور اصلی باید قطعی و فعال باشد.' };
  }
  const expectedKind = originalInvoice.kind === 'sale' ? 'sale-return' : 'purchase-return';
  if (document.kind !== expectedKind) {
    return { ok: false, message: 'نوع مرجوعی با فاکتور اصلی سازگار نیست.' };
  }
  if (!document.number.trim()) return { ok: false, message: 'شماره سند مرجوعی الزامی است.' };
  const duplicate = allReturns.some(
    (item) => item.id !== document.id && item.kind === document.kind && item.number.trim() === document.number.trim()
  );
  if (duplicate) return { ok: false, message: 'شماره سند مرجوعی تکراری است.' };

  const items = normalizeReturnItems(document, originalInvoice);
  if (!items.length) return { ok: false, message: 'حداقل یک ردیف با مقدار مرجوعی بزرگ‌تر از صفر لازم است.' };

  for (const item of items) {
    const source = originalInvoice.items.find((original) => original.id === item.originalItemId);
    if (!source) return { ok: false, message: 'یکی از ردیف‌های مرجوعی در فاکتور اصلی پیدا نشد.' };
    const alreadyReturned = returnedQuantityForItem(source.id, allReturns, document.id);
    const remaining = Number(source.qty || 0) - alreadyReturned;
    if (item.qty > remaining + 0.0001) {
      return {
        ok: false,
        message: 'مقدار مرجوعی «' + source.description + '» بیشتر از مانده قابل مرجوعی است. مانده: ' + remaining + ' ' + source.unit + '.',
      };
    }
  }
  return { ok: true };
}

