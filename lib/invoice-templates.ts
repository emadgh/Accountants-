import type { InvoicePaperSize, InvoiceTemplateId } from './types';

export const INVOICE_PAPER_SIZES: Array<{ id: InvoicePaperSize; label: string }> = [
  { id: 'A4', label: 'A4 · ۲۱۰ × ۲۹۷ میلی‌متر' },
  { id: 'A5', label: 'A5 · ۱۴۸ × ۲۱۰ میلی‌متر' },
];

export const INVOICE_TEMPLATES: Array<{
  id: InvoiceTemplateId;
  label: string;
  description: string;
}> = [
  { id: 'classic', label: 'کلاسیک', description: 'رسمی و نزدیک به قالب فعلی' },
  { id: 'modern', label: 'مدرن', description: 'سربرگ برجسته و بخش‌های تفکیک‌شده' },
  { id: 'compact', label: 'فشرده', description: 'فاصله‌های کمتر برای فاکتورهای بلند' },
  { id: 'blue-ledger', label: 'رسمی آبی', description: 'سربرگ آبی، جدول سبز و کادرهای طرفین' },
  { id: 'violet-ledger', label: 'جدول بنفش', description: 'جدول خط‌کشی‌شده با ردیف‌های ثابت و جمع به حروف' },
  { id: 'official', label: 'فاکتور رسمی', description: 'چیدمان سیاه‌وسفید با مشخصات کامل طرفین و جدول شبکه‌ای' },
  { id: 'storefront', label: 'فروشگاهی', description: 'سربرگ فروشگاه، جدول آبی و جمع هزینه‌های فاکتور' },
  { id: 'green-brand', label: 'برند سبز', description: 'سربرگ لوگودار، جدول سبز و خلاصه مانده حساب' },
];

export function isInvoiceTemplateId(value: unknown): value is InvoiceTemplateId {
  return INVOICE_TEMPLATES.some((template) => template.id === value);
}

export function isInvoicePaperSize(value: unknown): value is InvoicePaperSize {
  return value === 'A4' || value === 'A5';
}
