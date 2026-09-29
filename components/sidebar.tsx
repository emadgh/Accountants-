'use client';

import {
  BarChart3, BookOpen, Boxes, Building2, ChevronLeft, CircleDollarSign, ClipboardList,
  FilePlus2, FileText, Home, Menu, PackageSearch, ReceiptText, Settings,
  ShoppingCart, Users, WalletCards, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ViewKey = 'dashboard' | 'sales' | 'sale-new' | 'purchases' | 'purchase-new' | 'customers' | 'ledger' | 'products' | 'inventory' | 'payments' | 'checks' | 'reports' | 'settings';

const sections = [
  { key: 'dashboard', label: 'داشبورد', icon: Home },
  { key: 'sales', label: 'فاکتورهای فروش', icon: ReceiptText },
  { key: 'sale-new', label: 'فاکتور فروش جدید', icon: FilePlus2 },
  { key: 'purchases', label: 'فاکتورهای خرید', icon: ShoppingCart },
  { key: 'purchase-new', label: 'فاکتور خرید جدید', icon: ClipboardList },
  { key: 'customers', label: 'مشتریان و تامین‌کنندگان', icon: Users },
  { key: 'ledger', label: 'دفتر حساب طرف حساب', icon: BookOpen },
  { key: 'products', label: 'کالا و خدمات', icon: PackageSearch },
  { key: 'inventory', label: 'انبار', icon: Boxes },
  { key: 'payments', label: 'دریافت و پرداخت', icon: CircleDollarSign },
  { key: 'checks', label: 'چک‌ها و سررسید', icon: WalletCards },
  { key: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
  { key: 'settings', label: 'تنظیمات', icon: Settings },
] as const;

export function Sidebar({ active, onChange, open, onOpenChange }: { active: ViewKey; onChange: (v: ViewKey) => void; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <>
      <Button className="fixed right-4 top-4 z-50 lg:hidden" size="icon" onClick={() => onOpenChange(!open)} aria-label="منو">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      {open && <button className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => onOpenChange(false)} aria-label="بستن منو" />}
      <aside className={cn(
        'fixed right-0 top-0 z-40 flex h-screen w-[275px] flex-col overflow-hidden border-l border-slate-800 bg-[#0b2134] text-white shadow-2xl transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-400/30"><Building2 className="h-6 w-6 text-sky-300" /></div>
            <div>
              <div className="text-lg font-black">حسابداری</div>
              <div className="mt-1 text-xs text-slate-400">فاکتور، انبار و تسویه حساب</div>
            </div>
          </div>
        </div>
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-3">
          {sections.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button key={key} onClick={() => { onChange(key); onOpenChange(false); }} className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition',
                isActive ? 'bg-sky-500/16 text-white ring-1 ring-inset ring-sky-400/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )}>
                <Icon className={cn('h-4.5 w-4.5', isActive ? 'text-sky-300' : 'text-slate-400 group-hover:text-slate-200')} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronLeft className="h-4 w-4 text-sky-300" />}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">
            <div className="mb-1 flex items-center gap-2 font-bold text-slate-200"><FileText className="h-4 w-4" /> ذخیره‌سازی محلی</div>
            داده‌ها فقط داخل مرورگر شما نگهداری می‌شوند.
          </div>
        </div>
      </aside>
    </>
  );
}
