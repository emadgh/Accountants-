import type { AccountingData, JournalEntry } from './types';
import { SYSTEM_ACCOUNTS } from './accounting';

function documentNumbering() {
  return {
    sale: { prefix: 'S-', next: 1, padding: 6 },
    purchase: { prefix: 'P-', next: 1, padding: 6 },
    receipt: { prefix: 'R-', next: 1, padding: 6 },
    payment: { prefix: 'PY-', next: 1, padding: 6 },
    check: { prefix: 'C-', next: 1, padding: 6 },
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
  };
}

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
    createdAt: '2026-09-20T09:00:00.000Z',
    lines: lines.map((line, index) => ({ ...line, id: id + '_line_' + (index + 1) })),
  };
}

const sampleMainProfile = {
  id: 'business_default',
  label: 'شعبه مرکزی',
  businessName: 'فروشگاه نمونه آریا',
  ownerName: 'مدیر فروشگاه',
  phone: '',
  address: 'تهران، نشانی نمونه',
  nationalId: '',
  economicCode: '',
  postalCode: '',
  cardNumber: '',
  iban: '',
  bankName: '',
  invoiceTitle: 'فاکتور فروش',
  footer: 'از اعتماد شما سپاسگزاریم.',
};

const sampleWestProfile = {
  ...sampleMainProfile,
  id: 'business_west',
  label: 'شعبه غرب',
  address: 'تهران، محدوده غرب، نشانی نمونه',
};

export const seedData: AccountingData = {
  settings: {
    businessName: sampleMainProfile.businessName,
    ownerName: sampleMainProfile.ownerName,
    phone: sampleMainProfile.phone,
    address: sampleMainProfile.address,
    nationalId: sampleMainProfile.nationalId,
    economicCode: sampleMainProfile.economicCode,
    postalCode: sampleMainProfile.postalCode,
    cardNumber: sampleMainProfile.cardNumber,
    iban: sampleMainProfile.iban,
    bankName: sampleMainProfile.bankName,
    invoiceTitle: sampleMainProfile.invoiceTitle,
    footer: sampleMainProfile.footer,
    currency: 'تومان',
    defaultTax: 0,
    numbering: {
      sale: { prefix: 'S-', next: 3, padding: 6 },
      purchase: { prefix: 'P-', next: 2, padding: 6 },
      receipt: { prefix: 'R-', next: 4, padding: 6 },
      payment: { prefix: 'PY-', next: 2, padding: 6 },
      check: { prefix: 'C-', next: 4, padding: 6 },
    },
    businessProfiles: [sampleMainProfile, sampleWestProfile],
    defaultBusinessProfileId: sampleMainProfile.id,
    defaultInvoiceTemplateId: 'classic',
    defaultInvoicePaperSize: 'A4',
  },
  customers: [
    {
      id: 'cus_bahar', code: '100001', name: 'فروشگاه بهار', kind: 'both', status: 'active',
      phone: '', address: 'تهران، نشانی نمونه', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
      notes: 'مشتری و تأمین‌کننده نمونه',
    },
    {
      id: 'cus_baranco', code: '100002', name: 'شرکت باران', kind: 'customer', status: 'active',
      phone: '', address: 'کرج، نشانی نمونه', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    },
    {
      id: 'cus_sepehr', code: '200001', name: 'پخش سپهر', kind: 'supplier', status: 'active',
      phone: '', address: 'تهران، نشانی نمونه', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    },
  ],
  products: [
    { id: 'prd_tile', code: '1001', name: 'کاشی پرسلان ۶۰×۱۲۰', kind: 'product', unit: 'مترمربع', salePrice: 850000, buyPrice: 550000, averageCost: 525000, stock: 30, minStock: 10 },
    { id: 'prd_adhesive', code: '1002', name: 'چسب کاشی', kind: 'product', unit: 'کیسه', salePrice: 320000, buyPrice: 180000, averageCost: 180000, stock: 15, minStock: 8 },
    { id: 'prd_install', code: '2001', name: 'خدمات نصب', kind: 'service', unit: 'مترمربع', salePrice: 420000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0 },
  ],
  invoices: [
    {
      id: 'inv_sale_001', number: 'S-000001', businessProfileId: 'business_default', templateId: 'classic', kind: 'sale', status: 'partial',
      date: '۱۴۰۵/۰۷/۰۱', customerId: 'cus_bahar', customerName: 'فروشگاه بهار', customerPhone: '', customerAddress: 'تهران، نشانی نمونه',
      items: [
        { id: 'item_sale_tile', productId: 'prd_tile', description: 'کاشی پرسلان ۶۰×۱۲۰', unit: 'مترمربع', qty: 12, unitPrice: 850000 },
        { id: 'item_sale_glue', productId: 'prd_adhesive', description: 'چسب کاشی', unit: 'کیسه', qty: 2, unitPrice: 320000 },
      ],
      discount: 0, tax: 0, shipping: 0, notes: 'تحویل مرحله‌ای سفارش',
      createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z', finalizedAt: '2026-09-20T09:00:00.000Z',
    },
    {
      id: 'inv_purchase_001', number: 'P-000001', businessProfileId: 'business_default', templateId: 'classic', kind: 'purchase', status: 'partial',
      date: '۱۴۰۵/۰۷/۰۲', customerId: 'cus_sepehr', customerName: 'پخش سپهر', customerPhone: '', customerAddress: 'تهران، نشانی نمونه',
      items: [
        { id: 'item_purchase_tile', productId: 'prd_tile', description: 'کاشی پرسلان ۶۰×۱۲۰', unit: 'مترمربع', qty: 20, unitPrice: 550000 },
        { id: 'item_purchase_glue', productId: 'prd_adhesive', description: 'چسب کاشی', unit: 'کیسه', qty: 12, unitPrice: 180000 },
      ],
      discount: 0, tax: 0, shipping: 0, notes: 'خرید دوره‌ای کالا',
      createdAt: '2026-09-21T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z', finalizedAt: '2026-09-21T09:00:00.000Z',
    },
    {
      id: 'inv_sale_002', number: 'S-000002', businessProfileId: 'business_west', templateId: 'classic', kind: 'sale', status: 'settled',
      date: '۱۴۰۵/۰۷/۰۳', customerId: 'cus_baranco', customerName: 'شرکت باران', customerPhone: '', customerAddress: 'کرج، نشانی نمونه',
      items: [
        { id: 'item_sale_adhesive', productId: 'prd_adhesive', description: 'چسب کاشی', unit: 'کیسه', qty: 3, unitPrice: 320000 },
      ],
      discount: 0, tax: 0, shipping: 0, notes: '',
      createdAt: '2026-09-22T09:00:00.000Z', updatedAt: '2026-09-22T09:00:00.000Z', finalizedAt: '2026-09-22T09:00:00.000Z',
    },
  ],
  returns: [
    {
      id: 'ret_sale_001', number: 'SR-000001', kind: 'sale-return', status: 'final', originalInvoiceId: 'inv_sale_001',
      originalInvoiceNumber: 'S-000001', customerId: 'cus_bahar', customerName: 'فروشگاه بهار', date: '۱۴۰۵/۰۷/۰۵',
      items: [{ id: 'item_return_tile', originalItemId: 'item_sale_tile', productId: 'prd_tile', description: 'کاشی پرسلان ۶۰×۱۲۰', unit: 'مترمربع', qty: 2, unitPrice: 850000 }],
      totalAmount: 1700000, notes: 'دو مترمربع مرجوع شد', createdAt: '2026-09-24T09:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z', finalizedAt: '2026-09-24T09:00:00.000Z',
    },
    {
      id: 'ret_purchase_001', number: 'PR-000001', kind: 'purchase-return', status: 'final', originalInvoiceId: 'inv_purchase_001',
      originalInvoiceNumber: 'P-000001', customerId: 'cus_sepehr', customerName: 'پخش سپهر', date: '۱۴۰۵/۰۷/۰۶',
      items: [{ id: 'item_return_glue', originalItemId: 'item_purchase_glue', productId: 'prd_adhesive', description: 'چسب کاشی', unit: 'کیسه', qty: 2, unitPrice: 180000 }],
      totalAmount: 360000, notes: 'دو کیسه مرجوع شد', createdAt: '2026-09-25T09:00:00.000Z', updatedAt: '2026-09-25T09:00:00.000Z', finalizedAt: '2026-09-25T09:00:00.000Z',
    },
  ],
  payments: [
    { id: 'pay_receipt_001', documentNumber: 'R-000001', invoiceId: 'inv_sale_001', customerId: 'cus_bahar', direction: 'receipt', method: 'card', amount: 6000000, date: '۱۴۰۵/۰۷/۰۲', reference: 'واریز بانکی' },
    { id: 'pay_check_001', documentNumber: 'R-000002', invoiceId: 'inv_sale_001', customerId: 'cus_bahar', direction: 'receipt', method: 'check', checkId: 'chk_received_001', amount: 2000000, date: '۱۴۰۵/۰۷/۰۴', reference: 'چک وصول‌شده' },
    { id: 'pay_receipt_002', documentNumber: 'R-000003', invoiceId: 'inv_sale_002', customerId: 'cus_baranco', direction: 'receipt', method: 'cash', amount: 960000, date: '۱۴۰۵/۰۷/۰۳', reference: 'تسویه نقدی' },
    { id: 'pay_supplier_001', documentNumber: 'PY-000001', invoiceId: 'inv_purchase_001', customerId: 'cus_sepehr', direction: 'payment', method: 'card', amount: 5000000, date: '۱۴۰۵/۰۷/۰۳', reference: 'پرداخت بخشی از خرید' },
  ],
  checks: [
    { id: 'chk_received_001', documentNumber: 'C-000001', direction: 'received', customerId: 'cus_bahar', amount: 2000000, dueDate: '۱۴۰۵/۰۷/۰۴', number: '10001', bank: 'بانک نمونه', owner: 'فروشگاه بهار', status: 'cleared', notes: 'به‌عنوان دریافت ثبت شده' },
    { id: 'chk_received_002', documentNumber: 'C-000002', direction: 'received', customerId: 'cus_baranco', amount: 1500000, dueDate: '۱۴۰۵/۰۷/۱۸', number: '10002', bank: 'بانک نمونه', owner: 'شرکت باران', status: 'pending' },
    { id: 'chk_issued_001', documentNumber: 'C-000003', direction: 'issued', customerId: 'cus_sepehr', amount: 1200000, dueDate: '۱۴۰۵/۰۷/۲۰', number: '20001', bank: 'بانک نمونه', owner: 'فروشگاه نمونه آریا', status: 'pending' },
  ],
  adjustments: [
    { id: 'adj_baranco_001', customerId: 'cus_baranco', date: '۱۴۰۵/۰۷/۰۱', amount: 250000, note: 'مانده افتتاحیه نمونه', createdAt: '2026-09-20T08:00:00.000Z' },
  ],
  stockMovements: [
    { id: 'stock_tile_open', productId: 'prd_tile', warehouseId: 'main', date: 'ابتدای دوره', createdAt: '2026-09-20T08:00:00.000Z', quantity: 20, balanceAfter: 20, averageCostAfter: 500000, unitCost: 500000, type: 'opening', action: 'product-opening', sourceType: 'system', sourceId: 'opening:prd_tile', sourceReference: 'افتتاحیه', note: 'موجودی ابتدای دوره' },
    { id: 'stock_tile_purchase', productId: 'prd_tile', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۲', createdAt: '2026-09-21T09:00:00.000Z', quantity: 20, balanceAfter: 40, averageCostAfter: 525000, unitCost: 550000, type: 'purchase', action: 'finalize', sourceType: 'invoice', sourceId: 'inv_purchase_001', sourceReference: 'P-000001', sourceKind: 'purchase' },
    { id: 'stock_tile_sale', productId: 'prd_tile', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۱', createdAt: '2026-09-20T09:00:00.000Z', quantity: -12, balanceAfter: 28, averageCostAfter: 525000, unitCost: 525000, type: 'sale', action: 'finalize', sourceType: 'invoice', sourceId: 'inv_sale_001', sourceReference: 'S-000001', sourceKind: 'sale' },
    { id: 'stock_tile_return', productId: 'prd_tile', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۵', createdAt: '2026-09-24T09:00:00.000Z', quantity: 2, balanceAfter: 30, averageCostAfter: 525000, unitCost: 525000, type: 'sale-return', action: 'return-finalize', sourceType: 'return', sourceId: 'ret_sale_001', sourceReference: 'SR-000001', sourceKind: 'sale-return' },
    { id: 'stock_glue_open', productId: 'prd_adhesive', warehouseId: 'main', date: 'ابتدای دوره', createdAt: '2026-09-20T08:00:00.000Z', quantity: 10, balanceAfter: 10, averageCostAfter: 180000, unitCost: 180000, type: 'opening', action: 'product-opening', sourceType: 'system', sourceId: 'opening:prd_adhesive', sourceReference: 'افتتاحیه', note: 'موجودی ابتدای دوره' },
    { id: 'stock_glue_purchase', productId: 'prd_adhesive', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۲', createdAt: '2026-09-21T09:00:00.000Z', quantity: 12, balanceAfter: 22, averageCostAfter: 180000, unitCost: 180000, type: 'purchase', action: 'finalize', sourceType: 'invoice', sourceId: 'inv_purchase_001', sourceReference: 'P-000001', sourceKind: 'purchase' },
    { id: 'stock_glue_sale_001', productId: 'prd_adhesive', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۱', createdAt: '2026-09-20T09:00:00.000Z', quantity: -2, balanceAfter: 20, averageCostAfter: 180000, unitCost: 180000, type: 'sale', action: 'finalize', sourceType: 'invoice', sourceId: 'inv_sale_001', sourceReference: 'S-000001', sourceKind: 'sale' },
    { id: 'stock_glue_sale_002', productId: 'prd_adhesive', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۳', createdAt: '2026-09-22T09:00:00.000Z', quantity: -3, balanceAfter: 17, averageCostAfter: 180000, unitCost: 180000, type: 'sale', action: 'finalize', sourceType: 'invoice', sourceId: 'inv_sale_002', sourceReference: 'S-000002', sourceKind: 'sale' },
    { id: 'stock_glue_return', productId: 'prd_adhesive', warehouseId: 'main', date: '۱۴۰۵/۰۷/۰۶', createdAt: '2026-09-25T09:00:00.000Z', quantity: -2, balanceAfter: 15, averageCostAfter: 180000, unitCost: 180000, type: 'purchase-return', action: 'return-finalize', sourceType: 'return', sourceId: 'ret_purchase_001', sourceReference: 'PR-000001', sourceKind: 'purchase-return' },
  ],
  accounts: SYSTEM_ACCOUNTS.map((account) => ({ ...account })),
  journalEntries: [
    sampleJournal('je_sale_001', '۱۴۰۵/۰۷/۰۱', 'ثبت فاکتور فروش S-000001', 'invoice', 'inv_sale_001', 'S-000001', [
      { accountId: 'acct_ar', debit: 10840000, credit: 0, memo: 'فروشگاه بهار' },
      { accountId: 'acct_sales', debit: 0, credit: 10840000, memo: 'فروش کالا' },
    ]),
    sampleJournal('je_purchase_001', '۱۴۰۵/۰۷/۰۲', 'ثبت فاکتور خرید P-000001', 'invoice', 'inv_purchase_001', 'P-000001', [
      { accountId: 'acct_inventory', debit: 13160000, credit: 0, memo: 'پخش سپهر' },
      { accountId: 'acct_ap', debit: 0, credit: 13160000, memo: 'خرید کالا' },
    ]),
    sampleJournal('je_sale_002', '۱۴۰۵/۰۷/۰۳', 'ثبت فاکتور فروش S-000002', 'invoice', 'inv_sale_002', 'S-000002', [
      { accountId: 'acct_ar', debit: 960000, credit: 0, memo: 'شرکت باران' },
      { accountId: 'acct_sales', debit: 0, credit: 960000, memo: 'فروش کالا' },
    ]),
    sampleJournal('je_return_sale_001', '۱۴۰۵/۰۷/۰۵', 'ثبت برگشت از فروش SR-000001', 'return', 'ret_sale_001', 'SR-000001', [
      { accountId: 'acct_sales_returns', debit: 1700000, credit: 0, memo: 'فروشگاه بهار' },
      { accountId: 'acct_ar', debit: 0, credit: 1700000, memo: 'برگشت کالا' },
    ]),
    sampleJournal('je_return_purchase_001', '۱۴۰۵/۰۷/۰۶', 'ثبت برگشت از خرید PR-000001', 'return', 'ret_purchase_001', 'PR-000001', [
      { accountId: 'acct_ap', debit: 360000, credit: 0, memo: 'پخش سپهر' },
      { accountId: 'acct_inventory', debit: 0, credit: 360000, memo: 'برگشت کالا' },
    ]),
    sampleJournal('je_receipt_001', '۱۴۰۵/۰۷/۰۲', 'ثبت دریافت R-000001', 'payment', 'pay_receipt_001', 'R-000001', [
      { accountId: 'acct_bank', debit: 6000000, credit: 0 },
      { accountId: 'acct_ar', debit: 0, credit: 6000000 },
    ]),
    sampleJournal('je_receipt_002', '۱۴۰۵/۰۷/۰۴', 'ثبت دریافت R-000002', 'payment', 'pay_check_001', 'R-000002', [
      { accountId: 'acct_bank', debit: 2000000, credit: 0 },
      { accountId: 'acct_ar', debit: 0, credit: 2000000 },
    ]),
    sampleJournal('je_receipt_003', '۱۴۰۵/۰۷/۰۳', 'ثبت دریافت R-000003', 'payment', 'pay_receipt_002', 'R-000003', [
      { accountId: 'acct_cash', debit: 960000, credit: 0 },
      { accountId: 'acct_ar', debit: 0, credit: 960000 },
    ]),
    sampleJournal('je_payment_001', '۱۴۰۵/۰۷/۰۳', 'ثبت پرداخت PY-000001', 'payment', 'pay_supplier_001', 'PY-000001', [
      { accountId: 'acct_ap', debit: 5000000, credit: 0 },
      { accountId: 'acct_bank', debit: 0, credit: 5000000 },
    ]),
    sampleJournal('je_adjustment_001', '۱۴۰۵/۰۷/۰۱', 'مانده افتتاحیه نمونه', 'system', 'adj_baranco_001', 'adj_baranco_001', [
      { accountId: 'acct_ar', debit: 250000, credit: 0, memo: 'شرکت باران' },
      { accountId: 'acct_opening', debit: 0, credit: 250000 },
    ]),
    sampleJournal('je_expense_001', '۱۴۰۵/۰۷/۰۴', 'خرید ملزومات فروشگاه', 'money-transaction', 'money_expense_001', 'EXP-000001', [
      { accountId: 'acct_general_expense', debit: 450000, credit: 0 },
      { accountId: 'acct_bank', debit: 0, credit: 450000 },
    ]),
    sampleJournal('je_income_001', '۱۴۰۵/۰۷/۰۵', 'درآمد متفرقه نمونه', 'money-transaction', 'money_income_001', 'INC-000001', [
      { accountId: 'acct_cash', debit: 300000, credit: 0 },
      { accountId: 'acct_other_income', debit: 0, credit: 300000 },
    ]),
  ],
  moneyTransactions: [
    {
      id: 'money_expense_001', kind: 'expense', status: 'final', date: '۱۴۰۵/۰۷/۰۴', amount: 450000,
      settlementAccountId: 'acct_bank', categoryAccountId: 'acct_general_expense', description: 'خرید ملزومات فروشگاه',
      reference: 'EXP-000001', createdAt: '2026-09-23T09:00:00.000Z', updatedAt: '2026-09-23T09:00:00.000Z',
    },
    {
      id: 'money_income_001', kind: 'income', status: 'final', date: '۱۴۰۵/۰۷/۰۵', amount: 300000,
      settlementAccountId: 'acct_cash', categoryAccountId: 'acct_other_income', description: 'درآمد متفرقه نمونه',
      reference: 'INC-000001', createdAt: '2026-09-24T09:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z',
    },
  ],
};
