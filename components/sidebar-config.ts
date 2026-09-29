import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Building2,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  FilePlus2,
  Home,
  Landmark,
  PackageSearch,
  ReceiptText,
  RefreshCcw,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from 'lucide-react';

export type ViewKey =
  | 'dashboard'
  | 'sales'
  | 'sale-new'
  | 'purchases'
  | 'purchase-new'
  | 'customers'
  | 'ledger'
  | 'products'
  | 'inventory'
  | 'payments'
  | 'checks'
  | 'returns'
  | 'accounting'
  | 'reports'
  | 'settings'
  | 'business-profiles';

export type SidebarItem = {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
};

export type SidebarGroup = {
  id: 'main' | 'sales' | 'purchases' | 'contacts' | 'inventory' | 'finance' | 'reports' | 'system';
  label: string;
  collapsible?: boolean;
  items: readonly SidebarItem[];
};

export const sidebarGroups: readonly SidebarGroup[] = [
  {
    id: 'main',
    label: 'اصلی',
    items: [
      { key: 'dashboard', label: 'داشبورد', icon: Home },
    ],
  },
  {
    id: 'sales',
    label: 'فروش',
    collapsible: true,
    items: [
      { key: 'sale-new', label: 'فاکتور فروش جدید', icon: FilePlus2 },
      { key: 'sales', label: 'فاکتورهای فروش', icon: ReceiptText },
      { key: 'returns', label: 'مرجوعی فروش و خرید', icon: RefreshCcw },
    ],
  },
  {
    id: 'purchases',
    label: 'خرید',
    collapsible: true,
    items: [
      { key: 'purchase-new', label: 'فاکتور خرید جدید', icon: ClipboardList },
      { key: 'purchases', label: 'فاکتورهای خرید', icon: ShoppingCart },
    ],
  },
  {
    id: 'contacts',
    label: 'طرف حساب‌ها',
    collapsible: true,
    items: [
      { key: 'customers', label: 'مشتریان و تامین‌کنندگان', icon: Users },
      { key: 'ledger', label: 'دفتر حساب طرف حساب', icon: BookOpen },
    ],
  },
  {
    id: 'inventory',
    label: 'کالا و انبار',
    collapsible: true,
    items: [
      { key: 'products', label: 'کالا و خدمات', icon: PackageSearch },
      { key: 'inventory', label: 'انبار', icon: Boxes },
    ],
  },
  {
    id: 'finance',
    label: 'مالی',
    collapsible: true,
    items: [
      { key: 'payments', label: 'دریافت و پرداخت', icon: CircleDollarSign },
      { key: 'checks', label: 'چک‌ها و سررسید', icon: WalletCards },
      { key: 'accounting', label: 'حسابداری دوبل', icon: Landmark },
    ],
  },
  {
    id: 'reports',
    label: 'گزارش‌ها',
    items: [
      { key: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
    ],
  },
  {
    id: 'system',
    label: 'سیستم',
    items: [
      { key: 'business-profiles', label: 'پروفایل‌های کسب‌وکار', icon: Building2 },
      { key: 'settings', label: 'تنظیمات', icon: Settings },
    ],
  },
] as const;
