'use client';


import { AppNavbarContent } from '@/components/app-navbar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { CheckRecord, StockMovement } from '@/lib/types';
import {
  Search
} from 'lucide-react';

export function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <AppNavbarContent title={title} subtitle={subtitle} actions={action} />;
}

export function SearchBox({ value, onChange, placeholder = 'جستجو...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative w-full max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pr-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function InvoiceStatus({ status }: { status: string }) {
  const x: Record<string, [string, string]> = { draft: ['پیش‌نویس', 'bg-slate-100 text-slate-600'], final: ['قطعی', 'bg-sky-50 text-sky-700'], partial: ['بخشی تسویه', 'bg-amber-50 text-amber-700'], settled: ['تسویه‌شده', 'bg-emerald-50 text-emerald-700'], void: ['باطل', 'bg-rose-50 text-rose-700'] };
  const [label, cls] = x[status] || [status, '']; return <Badge className={cls}>{label}</Badge>;
}

export function ReturnProgressBadge({ returned, total }: { returned: number; total: number }) {
  if (returned <= 0) return null;
  if (returned >= total - 0.0001) return <Badge className="bg-violet-50 text-violet-700">مرجوع کامل</Badge>;
  return <Badge className="bg-orange-50 text-orange-700">مرجوع جزئی</Badge>;
}


export function LedgerStatus({ status, effective, kind }: { status?: string; effective: boolean; kind: string }) {
  if (kind === 'opening') return <Badge>اول دوره</Badge>;
  if (kind === 'adjustment') return <Badge className="bg-violet-50 text-violet-700">اصلاحیه</Badge>;
  if (kind === 'void') return <Badge className="bg-rose-50 text-rose-700">باطل</Badge>;
  if (status === 'pending') return <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>;
  if (status === 'bounced') return <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge>;
  if (status === 'cleared') return <Badge className="bg-emerald-50 text-emerald-700">وصول / پاس</Badge>;
  return effective ? <Badge className="bg-emerald-50 text-emerald-700">موثر</Badge> : <Badge>اطلاعاتی</Badge>;
}

export function stockMovementLabel(movement: StockMovement) {
  if (movement.type === 'opening') return movement.action === 'product-opening' ? 'موجودی اولیه کالا' : 'مانده انتقالی';
  if (movement.type === 'purchase') return movement.action === 'revision' ? 'خرید - Revision' : 'ورود از خرید';
  if (movement.type === 'sale') return movement.action === 'revision' ? 'فروش - Revision' : 'خروج از فروش';
  if (movement.type === 'sale-return') return 'ورود از مرجوعی فروش';
  if (movement.type === 'purchase-return') return 'خروج از مرجوعی خرید';
  if (movement.type === 'adjustment') return movement.action === 'count' ? 'اختلاف شمارش انبار' : 'اصلاح موجودی';
  return movement.action === 'void-reversal' ? 'برگشت بابت ابطال' : 'برگشت نسخه قبلی';
}

export function CheckStatus({ status }: { status: CheckRecord['status'] }) { return status === 'cleared' ? <Badge className="bg-emerald-50 text-emerald-700">وصول شده</Badge> : status === 'bounced' ? <Badge className="bg-rose-50 text-rose-700">برگشتی</Badge> : <Badge className="bg-amber-50 text-amber-700">در انتظار</Badge>; }

export function EmptyRow({ cols, text }: { cols: number; text: string }) { return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>; }

