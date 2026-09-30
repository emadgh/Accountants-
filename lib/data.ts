import type {
  AccountingData,
  Customer,
  Invoice,
  JournalEntry,
  MoneyTransaction,
  Product,
  Project,
  Quote,
} from './types';
import { SYSTEM_ACCOUNTS } from './accounting';

function documentNumbering() {
  return {
    sale: { prefix: 'S-', next: 1, padding: 6 },
    purchase: { prefix: 'P-', next: 1, padding: 6 },
    receipt: { prefix: 'R-', next: 1, padding: 6 },
    payment: { prefix: 'PY-', next: 1, padding: 6 },
    check: { prefix: 'C-', next: 1, padding: 6 },
    quote: { prefix: 'Q-', next: 1, padding: 6 },
  };
}

function emptyBusinessProfile() {
  return {
    id: 'business_default',
    label: 'پروفایل اصلی',
    businessName: '',
    ownerName: '',
    phone: '',
    address: '',
    nationalId: '',
    economicCode: '',
    postalCode: '',
    cardNumber: '',
    iban: '',
    bankName: '',
    invoiceTitle: 'فاکتور فروش',
    footer: '',
  };
}

export function createEmptyAccountingData(): AccountingData {
  return {
    settings: {
      businessName: '',
      ownerName: '',
      phone: '',
      address: '',
      nationalId: '',
      economicCode: '',
      postalCode: '',
      cardNumber: '',
      iban: '',
      bankName: '',
      invoiceTitle: 'فاکتور فروش',
      footer: '',
      currency: 'تومان',
      defaultTax: 0,
      numbering: documentNumbering(),
      businessProfiles: [emptyBusinessProfile()],
      defaultBusinessProfileId: 'business_default',
      defaultInvoiceTemplateId: 'classic',
      defaultInvoicePaperSize: 'A4',
    },
    customers: [],
    products: [],
    invoices: [],
    returns: [],
    payments: [],
    checks: [],
    adjustments: [],
    stockMovements: [],
    accounts: SYSTEM_ACCOUNTS.map((account) => ({ ...account })),
    journalEntries: [],
    moneyTransactions: [],
    quotes: [],
    projects: [],
    attachments: [],
  };
}

export const SEED_PRESETS = [
  { id: 'empty', title: 'بدون داده', description: 'شروع با پرونده خالی و سرفصل‌های پایه حسابداری' },
  { id: 'supermarket', title: 'فروشگاهی؛ سوپرمارکت', description: 'کالاهای دسته‌بندی‌شده، بارکد، موجودی و مشتریان نمونه' },
  { id: 'creative-studio', title: 'خدمات طراحی و چاپ', description: 'طراحی هویت بصری، چاپ و طراحی وب‌سایت با پیش‌فاکتور و پروژه' },
  { id: 'construction-suite', title: 'ساخت‌وساز و معماری', description: 'پروژه نمونه ساخت سوییت یک‌خوابه با سرویس بهداشتی' },
] as const;

export type SeedPresetId = (typeof SEED_PRESETS)[number]['id'];

const sampleCreatedAt = '2026-09-30T09:00:00.000Z';
const sampleDate = '۱۴۰۵/۰۷/۰۹';

function sampleJournal(
  id: string,
  date: string,
  description: string,
  sourceType: JournalEntry['sourceType'],
  sourceId: string,
  sourceReference: string,
  lines: Array<{ accountId: string; debit: number; credit: number; memo?: string }>
): JournalEntry {
  return {
    id,
    date,
    description,
    sourceType,
    sourceId,
    sourceReference,
    action: 'post',
    createdAt: sampleCreatedAt,
    lines: lines.map((line, index) => ({ ...line, id: `${id}_line_${index + 1}` })),
  };
}

function sampleProfile(businessName: string, ownerName: string, address: string) {
  return {
    id: 'business_default',
    label: 'دفتر اصلی',
    businessName,
    ownerName,
    phone: '',
    address,
    nationalId: '',
    economicCode: '',
    postalCode: '',
    cardNumber: '',
    iban: '',
    bankName: '',
    invoiceTitle: 'فاکتور فروش',
    footer: 'این اطلاعات نمونه است؛ پیش از استفاده، مشخصات کسب‌وکار را ویرایش کنید.',
  };
}

function setBusiness(data: AccountingData, businessName: string, ownerName: string, address: string) {
  const profile = sampleProfile(businessName, ownerName, address);
  data.settings = {
    ...data.settings,
    businessName,
    ownerName,
    address,
    businessProfiles: [profile],
    defaultBusinessProfileId: profile.id,
    numbering: {
      ...data.settings.numbering,
      sale: { prefix: 'S-', next: 1, padding: 6 },
      purchase: { prefix: 'P-', next: 1, padding: 6 },
      quote: { prefix: 'Q-', next: 1, padding: 6 },
    },
  };
}

function sampleCustomer(input: Pick<Customer, 'id' | 'code' | 'name' | 'kind'> & Partial<Pick<Customer, 'address' | 'phone' | 'notes'>>): Customer {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    kind: input.kind,
    status: 'active',
    phone: input.phone || '',
    address: input.address || '',
    nationalId: '',
    economicCode: '',
    postalCode: '',
    openingBalance: 0,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function sampleProduct(input: Pick<Product, 'id' | 'code' | 'name' | 'kind' | 'unit' | 'salePrice' | 'buyPrice' | 'averageCost' | 'stock' | 'minStock'> & Partial<Pick<Product, 'sku' | 'barcode' | 'category' | 'notes'>>): Product {
  return { ...input };
}

function sampleProject(input: Omit<Project, 'createdAt' | 'updatedAt'>): Project {
  return { ...input, createdAt: sampleCreatedAt, updatedAt: sampleCreatedAt };
}

function sampleMoneyExpense(input: Pick<MoneyTransaction, 'id' | 'amount' | 'description' | 'projectId'> & { reference: string }): MoneyTransaction {
  return {
    id: input.id,
    kind: 'expense',
    status: 'final',
    date: sampleDate,
    amount: input.amount,
    settlementAccountId: 'acct_bank',
    categoryAccountId: 'acct_general_expense',
    description: input.description,
    reference: input.reference,
    createdAt: sampleCreatedAt,
    updatedAt: sampleCreatedAt,
    projectId: input.projectId,
  };
}

function sampleInvoice(input: Omit<Invoice, 'createdAt' | 'updatedAt'>): Invoice {
  return { ...input, createdAt: sampleCreatedAt, updatedAt: sampleCreatedAt };
}

function sampleQuote(input: Omit<Quote, 'createdAt' | 'updatedAt'>): Quote {
  return { ...input, createdAt: sampleCreatedAt, updatedAt: sampleCreatedAt };
}

function createSupermarketSeed(): AccountingData {
  const data = createEmptyAccountingData();
  setBusiness(data, 'سوپرمارکت نمونه بهار', 'مدیر فروشگاه', 'تهران، نشانی نمونه');

  data.customers = [
    sampleCustomer({ id: 'cus_walk_in', code: '100001', name: 'مشتری حضوری', kind: 'customer', notes: 'برای تمرین ثبت فروش سریع' }),
    sampleCustomer({ id: 'cus_negin', code: '100002', name: 'خانواده نگین', kind: 'customer', address: 'تهران، نشانی نمونه' }),
    sampleCustomer({ id: 'cus_food_supplier', code: '200001', name: 'پخش مواد غذایی سپهر', kind: 'supplier', address: 'تهران، نشانی نمونه' }),
  ];

  data.products = [
    sampleProduct({ id: 'prd_rice', code: '1001', sku: 'RICE-IR-10', barcode: '6261000001001', name: 'برنج ایرانی ۱۰ کیلویی', kind: 'product', unit: 'کیسه', category: 'برنج و غلات', salePrice: 1_850_000, buyPrice: 1_520_000, averageCost: 1_520_000, stock: 18, minStock: 5 }),
    sampleProduct({ id: 'prd_milk', code: '1002', sku: 'DAIRY-MILK-1L', barcode: '6261000001002', name: 'شیر کم‌چرب یک لیتری', kind: 'product', unit: 'عدد', category: 'لبنیات', salePrice: 48_000, buyPrice: 39_000, averageCost: 39_000, stock: 42, minStock: 12 }),
    sampleProduct({ id: 'prd_tea', code: '1003', sku: 'TEA-500', barcode: '6261000001003', name: 'چای سیاه ۵۰۰ گرمی', kind: 'product', unit: 'بسته', category: 'نوشیدنی گرم', salePrice: 315_000, buyPrice: 260_000, averageCost: 260_000, stock: 9, minStock: 6 }),
    sampleProduct({ id: 'prd_detergent', code: '1004', sku: 'HOME-LIQ-1L', barcode: '6261000001004', name: 'مایع ظرف‌شویی یک لیتری', kind: 'product', unit: 'عدد', category: 'شوینده و بهداشتی', salePrice: 92_000, buyPrice: 74_000, averageCost: 74_000, stock: 4, minStock: 8, notes: 'موجودی کمتر از حداقل؛ نمونه هشدار موجودی' }),
  ];

  data.stockMovements = data.products.map((product) => ({
    id: `stock_open_${product.id}`,
    productId: product.id,
    warehouseId: 'main',
    date: 'ابتدای دوره',
    createdAt: sampleCreatedAt,
    quantity: product.stock,
    balanceAfter: product.stock,
    averageCostAfter: product.averageCost,
    unitCost: product.averageCost,
    type: 'opening',
    action: 'product-opening',
    sourceType: 'system',
    sourceId: `opening:${product.id}`,
    sourceReference: 'موجودی نمونه',
    note: 'موجودی آغازین پریست فروشگاهی',
  }));
  return data;
}

function createCreativeStudioSeed(): AccountingData {
  const data = createEmptyAccountingData();
  setBusiness(data, 'استودیو خلاق نمونه', 'مدیر استودیو', 'تهران، نشانی نمونه');
  data.customers = [
    sampleCustomer({ id: 'cus_studio_arman', code: '100001', name: 'شرکت آرمان داده', kind: 'customer', address: 'تهران، نشانی نمونه' }),
    sampleCustomer({ id: 'cus_studio_chap', code: '200001', name: 'چاپخانه نقش آرا', kind: 'supplier', address: 'تهران، نشانی نمونه' }),
  ];
  data.products = [
    sampleProduct({ id: 'srv_logo', code: 'S-001', name: 'طراحی لوگو و هویت بصری', kind: 'service', unit: 'پروژه', salePrice: 12_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'طراحی' }),
    sampleProduct({ id: 'srv_catalog', code: 'S-002', name: 'طراحی کاتالوگ ۱۲ صفحه‌ای', kind: 'service', unit: 'پروژه', salePrice: 8_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'طراحی' }),
    sampleProduct({ id: 'srv_brochure', code: 'S-003', name: 'چاپ بروشور رنگی', kind: 'service', unit: 'هزار عدد', salePrice: 3_500_000, buyPrice: 2_600_000, averageCost: 2_600_000, stock: 0, minStock: 0, category: 'چاپ' }),
    sampleProduct({ id: 'srv_website', code: 'S-004', name: 'طراحی وب‌سایت شرکتی', kind: 'service', unit: 'پروژه', salePrice: 24_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'طراحی وب' }),
    sampleProduct({ id: 'srv_maintenance', code: 'S-005', name: 'نگهداری ماهانه وب‌سایت', kind: 'service', unit: 'ماه', salePrice: 4_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'طراحی وب' }),
  ];

  const project = sampleProject({
    id: 'project_brand_website',
    customerId: 'cus_studio_arman',
    title: 'هویت بصری و وب‌سایت شرکتی آرمان داده',
    status: 'awaiting-approval',
    dueDate: '۱۴۰۵/۰۸/۱۵',
    agreedAmount: 44_000_000,
    notes: 'نمونه پروژه خدماتی شامل طراحی هویت بصری، کاتالوگ و وب‌سایت شرکتی.',
  });
  data.projects = [project];
  data.quotes = [sampleQuote({
    id: 'quote_studio_001',
    number: 'Q-000001',
    status: 'issued',
    customerId: 'cus_studio_arman',
    customerName: 'شرکت آرمان داده',
    customerPhone: '',
    customerAddress: 'تهران، نشانی نمونه',
    businessProfileId: 'business_default',
    date: sampleDate,
    validUntil: '۱۴۰۵/۰۸/۰۹',
    items: [
      { id: 'quote_studio_logo', productId: 'srv_logo', description: 'طراحی لوگو و هویت بصری', unit: 'پروژه', qty: 1, unitPrice: 12_000_000 },
      { id: 'quote_studio_catalog', productId: 'srv_catalog', description: 'طراحی کاتالوگ ۱۲ صفحه‌ای', unit: 'پروژه', qty: 1, unitPrice: 8_000_000 },
      { id: 'quote_studio_web', productId: 'srv_website', description: 'طراحی وب‌سایت شرکتی', unit: 'پروژه', qty: 1, unitPrice: 24_000_000 },
    ],
    discount: 0,
    tax: 0,
    shipping: 0,
    notes: 'پیش‌فاکتور نمونه برای مشاهده شرح خدمات و تبدیل به فاکتور.',
    projectId: project.id,
  })];
  data.invoices = [sampleInvoice({
    id: 'inv_studio_maintenance',
    number: 'S-000001',
    businessProfileId: 'business_default',
    templateId: 'classic',
    kind: 'sale',
    status: 'draft',
    date: sampleDate,
    customerId: 'cus_studio_arman',
    customerName: 'شرکت آرمان داده',
    customerPhone: '',
    customerAddress: 'تهران، نشانی نمونه',
    items: [{ id: 'inv_studio_maintenance_line', productId: 'srv_maintenance', description: 'نگهداری ماهانه وب‌سایت', unit: 'ماه', qty: 2, unitPrice: 4_000_000 }],
    discount: 0,
    tax: 0,
    shipping: 0,
    notes: 'پیش‌نویس نمونه؛ برای نمایش موعد و اقساط.',
    projectId: project.id,
    dueDate: '۱۴۰۵/۰۹/۰۹',
    installments: [
      { id: 'inst_studio_1', dueDate: '۱۴۰۵/۰۸/۰۹', amount: 4_000_000 },
      { id: 'inst_studio_2', dueDate: '۱۴۰۵/۰۹/۰۹', amount: 4_000_000 },
    ],
  })];
  data.settings.numbering.sale.next = 2;
  data.settings.numbering.quote.next = 2;
  data.moneyTransactions = [sampleMoneyExpense({
    id: 'money_studio_project_cost',
    amount: 2_600_000,
    description: 'هزینه چاپ نمونه کاتالوگ پروژه آرمان داده',
    reference: 'EXP-STUDIO-001',
    projectId: project.id,
  })];
  data.journalEntries = [sampleJournal(
    'je_studio_project_cost', sampleDate, 'هزینه چاپ نمونه کاتالوگ پروژه آرمان داده',
    'money-transaction', 'money_studio_project_cost', 'EXP-STUDIO-001', [
      { accountId: 'acct_general_expense', debit: 2_600_000, credit: 0 },
      { accountId: 'acct_bank', debit: 0, credit: 2_600_000 },
    ]
  )];
  return data;
}

function createConstructionSeed(): AccountingData {
  const data = createEmptyAccountingData();
  setBusiness(data, 'شرکت معماری و ساخت آبان', 'مدیر پروژه', 'تهران، نشانی نمونه');
  data.customers = [
    sampleCustomer({ id: 'cus_construction_client', code: '100001', name: 'شرکت مهرسازان سپهر', kind: 'customer', address: 'تهران، نشانی نمونه', notes: 'کارفرمای نمونه پروژه ساخت سوییت' }),
    sampleCustomer({ id: 'cus_construction_supplier', code: '200001', name: 'تأمین مصالح پارس', kind: 'supplier', address: 'تهران، نشانی نمونه' }),
  ];
  data.products = [
    sampleProduct({ id: 'srv_arch_design', code: 'A-001', name: 'طراحی معماری و نقشه اجرایی', kind: 'service', unit: 'پروژه', salePrice: 80_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'طراحی و نظارت' }),
    sampleProduct({ id: 'srv_earthworks', code: 'A-002', name: 'خاک‌برداری و آماده‌سازی زمین', kind: 'service', unit: 'مرحله', salePrice: 140_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'عملیات عمرانی' }),
    sampleProduct({ id: 'srv_structure', code: 'A-003', name: 'اجرای سازه و دیوارچینی', kind: 'service', unit: 'مرحله', salePrice: 420_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'ساخت' }),
    sampleProduct({ id: 'srv_installations', code: 'A-004', name: 'تأسیسات برق و لوله‌کشی سرویس', kind: 'service', unit: 'مرحله', salePrice: 280_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'تأسیسات' }),
    sampleProduct({ id: 'srv_finish', code: 'A-005', name: 'کاشی‌کاری و نازک‌کاری داخلی', kind: 'service', unit: 'مرحله', salePrice: 280_000_000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0, category: 'نازک‌کاری' }),
  ];

  const project = sampleProject({
    id: 'project_suite_one_bedroom',
    customerId: 'cus_construction_client',
    title: 'ساخت سوییت اقامتی یک‌خوابه با سرویس بهداشتی',
    status: 'in-progress',
    dueDate: '۱۴۰۵/۱۲/۲۹',
    agreedAmount: 1_200_000_000,
    notes: 'مشخصات نمونه: یک اتاق‌خواب، یک سرویس بهداشتی و حمام، فضای نشیمن و آبدارخانه. برآوردها و اطلاعات کارفرما نمونه‌اند و باید با قرارداد واقعی جایگزین شوند.',
  });
  data.projects = [project];
  data.quotes = [sampleQuote({
    id: 'quote_suite_001',
    number: 'Q-000001',
    status: 'accepted',
    customerId: 'cus_construction_client',
    customerName: 'شرکت مهرسازان سپهر',
    customerPhone: '',
    customerAddress: 'تهران، نشانی نمونه',
    businessProfileId: 'business_default',
    date: sampleDate,
    validUntil: '۱۴۰۵/۰۸/۰۹',
    items: [
      { id: 'quote_suite_design', productId: 'srv_arch_design', description: 'طراحی معماری و نقشه اجرایی سوییت یک‌خوابه', unit: 'پروژه', qty: 1, unitPrice: 80_000_000 },
      { id: 'quote_suite_earthworks', productId: 'srv_earthworks', description: 'خاک‌برداری و آماده‌سازی زمین', unit: 'مرحله', qty: 1, unitPrice: 140_000_000 },
      { id: 'quote_suite_structure', productId: 'srv_structure', description: 'اجرای سازه و دیوارچینی', unit: 'مرحله', qty: 1, unitPrice: 420_000_000 },
      { id: 'quote_suite_installations', productId: 'srv_installations', description: 'تأسیسات برق و لوله‌کشی سرویس بهداشتی و حمام', unit: 'مرحله', qty: 1, unitPrice: 280_000_000 },
      { id: 'quote_suite_finish', productId: 'srv_finish', description: 'کاشی‌کاری سرویس و نازک‌کاری اتاق‌خواب و نشیمن', unit: 'مرحله', qty: 1, unitPrice: 280_000_000 },
    ],
    discount: 0,
    tax: 0,
    shipping: 0,
    notes: 'برآورد نمونه؛ پس از بررسی نقشه، محل اجرا و مشخصات مصالح اصلاح شود.',
    projectId: project.id,
  })];
  data.settings.numbering.quote.next = 2;
  data.moneyTransactions = [sampleMoneyExpense({
    id: 'money_suite_project_cost',
    amount: 75_000_000,
    description: 'هزینه مستقیم نمونه؛ بازدید و آماده‌سازی اولیه پروژه سوییت',
    reference: 'EXP-SUITE-001',
    projectId: project.id,
  })];
  data.journalEntries = [sampleJournal(
    'je_suite_project_cost', sampleDate, 'هزینه مستقیم پروژه ساخت سوییت',
    'money-transaction', 'money_suite_project_cost', 'EXP-SUITE-001', [
      { accountId: 'acct_general_expense', debit: 75_000_000, credit: 0 },
      { accountId: 'acct_bank', debit: 0, credit: 75_000_000 },
    ]
  )];
  return data;
}

export function createSeedData(preset: SeedPresetId): AccountingData {
  switch (preset) {
    case 'empty':
      return createEmptyAccountingData();
    case 'supermarket':
      return createSupermarketSeed();
    case 'creative-studio':
      return createCreativeStudioSeed();
    case 'construction-suite':
      return createConstructionSeed();
  }
}

// Kept for callers that need sample defaults; each new account setup uses a fresh preset object.
export const seedData = createSeedData('supermarket');
