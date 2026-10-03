import type { LucideIcon } from 'lucide-react';
import {
BarChart3,
BookOpen,
Boxes,
BriefcaseBusiness,
Building2,
CircleDollarSign,
ClipboardList,
Database,
FilePlus2,
FileText,
Home,
Info,
Landmark,
PackageSearch,
ReceiptText,
RefreshCcw,
ScanBarcode,
Settings,
ShoppingCart,
Users,
WalletCards,
Zap
} from 'lucide-react';

export type ViewKey =
  | 'dashboard'
  | 'sales'
  | 'quotes'
  | 'projects'
  | 'sale-new'
  | 'service-quick'
  | 'retail-quick'
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
  | 'business-profiles'
  | 'about';

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
      { key: 'service-quick', label: 'ثبت سریع خدمت', icon: Zap },
      { key: 'retail-quick', label: 'فروش سریع کالا', icon: ScanBarcode },
      { key: 'sales', label: 'فاکتورهای فروش', icon: ReceiptText },
      { key: 'quotes', label: 'پیش‌فاکتورها', icon: FileText },
      { key: 'projects', label: 'پروژه‌ها', icon: BriefcaseBusiness },
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
      { key: 'about', label: 'دربارهٔ برنامه', icon: Info },
    ],
  },
] as const;

export const VIEW_PATHS: Record<ViewKey, string> = {
  dashboard: '/',
  sales: '/sales',
  quotes: '/quotes',
  projects: '/projects',
  'sale-new': '/sales/new',
  'service-quick': '/sales/quick',
  'retail-quick': '/retail/quick',
  purchases: '/purchases',
  'purchase-new': '/purchases/new',
  customers: '/customers',
  ledger: '/ledger',
  products: '/products',
  inventory: '/inventory',
  payments: '/payments',
  checks: '/checks',
  returns: '/returns',
  accounting: '/accounting',
  reports: '/reports',
  settings: '/settings',
  'business-profiles': '/business-profiles',
  about: '/about',
};


export const capabilities = [
  {
    title: 'داشبورد و پیگیری',
    features: [
      'نمای کلی فروش، خرید، دریافت‌ها و ارزش موجودی',
      'یادآوری مطالبات و اقساط سررسیدشده، چک‌های در انتظار و هشدار کمبود کالا',
      'پیگیری پروژه‌های منتظر تأیید و روند ماهانه',
    ],
    icon: Home,
  },
  {
    title: 'فاکتور و فروش',
    features: [
      'فاکتور فروش و خرید، ذخیرهٔ پیش‌نویس و چاپ با قالب‌های مختلف در اندازهٔ A4 و A5',
      'ثبت سریع خدمات و فروش سریع کالا با جست‌وجو یا بارکد',
      'تخفیف، مالیات، دریافت نقدی، کارتی یا چکی، پرداخت جزئی و برنامهٔ اقساط',
      'ثبت و پیگیری مرجوعی فروش و خرید',
    ],
    icon: FileText,
  },
  {
    title: 'پیش‌فاکتور و پروژه',
    features: [
      'صدور پیش‌فاکتور، پیگیری وضعیت و تبدیل پیش‌فاکتور پذیرفته‌شده به فاکتور فروش',
      'پروندهٔ پروژه با مشتری، وضعیت، موعد، مبلغ توافقی و اسناد مرتبط',
      'محاسبهٔ هزینهٔ خدمات از فاکتور خرید و ثبت هزینه‌های بدون فاکتور',
      'پیوست PDF و تصویر و نمایش فروش، هزینه و سود برآوردی پروژه',
    ],
    icon: BriefcaseBusiness,
  },
  {
    title: 'مشتریان و تأمین‌کنندگان',
    features: [
      'ثبت اطلاعات و ماندهٔ اول دورهٔ طرف‌حساب‌ها',
      'دفتر گردش بدهکار و بستانکار، ماندهٔ حساب و اصلاحیهٔ قابل پیگیری',
    ],
    icon: Users,
  },
  {
    title: 'کالا و انبار',
    features: [
      'تعریف کالا و خدمت همراه کد، SKU، بارکد، دسته و قیمت مشتری یا گروه مشتری',
      'کاردکس ورود و خروج، ارزش موجودی با میانگین موزون، شمارش و اصلاح موجودی',
      'هشدار حداقل موجودی و گزارش گردش کالا',
    ],
    icon: Boxes,
  },
  {
    title: 'دریافت، پرداخت و حسابداری',
    features: [
      'ثبت دریافت از مشتری و پرداخت به تأمین‌کننده با صندوق، بانک، کارت و چک',
      'پیگیری چک‌های دریافتی و پرداختی، سررسید، وصول و برگشت',
      'کدینگ حساب‌ها، اسناد روزنامهٔ خودکار و کنترل تراز',
    ],
    icon: WalletCards,
  },
  {
    title: 'گزارش‌ها و خروجی',
    features: [
      'گزارش فروش، خرید و مرجوعی؛ فروش به تفکیک کالا و دسته',
      'گزارش موجودی و گردش کالا، دفتر طرف‌حساب‌ها، بدهکاران و بستانکاران و چک‌ها',
      'فیلتر بازهٔ تاریخ و خروجی CSV، Excel و چاپ یا PDF',
    ],
    icon: BarChart3,
  },
  {
    title: 'پروفایل و تنظیمات',
    features: [
      'مدیریت پروفایل‌های کسب‌وکار و مشخصات چاپ فاکتور',
      'تنظیم واحد پول، مالیات پیش‌فرض، قالب و اندازهٔ کاغذ و شماره‌گذاری اسناد',
    ],
    icon: Settings,
  },
  {
    title: 'ورود و پشتیبان‌گیری',
    features: [
      'ورود امن به برنامه و مدیریت پایگاه داده',
      'ساخت Snapshot، دریافت نسخهٔ پشتیبان داده و پیوست‌ها و بازیابی آن',
      'ورود اطلاعات از نرم‌افزار یاس و دریافت گزارش مهاجرت',
    ],
    icon: Database,
  },
];

