import type { AccountingData } from './types';
import { SYSTEM_ACCOUNTS } from './accounting';

export const seedData: AccountingData = {
  settings: {
    businessName: 'حسابداری من',
    ownerName: 'عماد قاسمی',
    phone: '۰۹۳۶۶۸۲۸۹۷۸',
    address: 'کاشمر - امام ۱۸ پلاک ۴۴ - عماد قاسمی',
    nationalId: '',
    economicCode: '',
    postalCode: '',
    cardNumber: '6037 9917 8212 9476',
    iban: 'IR600170000000113816948004',
    bankName: '',
    invoiceTitle: 'فاکتور فروش',
    footer: 'با تشکر از خرید شما',
    currency: 'تومان',
    defaultTax: 0,
    numbering: {
      sale: { prefix: 'S-', next: 1, padding: 6 },
      purchase: { prefix: 'P-', next: 1, padding: 6 },
      receipt: { prefix: 'R-', next: 1, padding: 6 },
      payment: { prefix: 'PY-', next: 1, padding: 6 },
      check: { prefix: 'C-', next: 1, padding: 6 },
    },
    businessProfiles: [
      {
        id: 'business_default',
        label: 'پروفایل اصلی',
        businessName: 'حسابداری من',
        ownerName: 'عماد قاسمی',
        phone: '۰۹۳۶۶۸۲۸۹۷۸',
        address: 'کاشمر - امام ۱۸ پلاک ۴۴ - عماد قاسمی',
        nationalId: '',
        economicCode: '',
        postalCode: '',
        cardNumber: '6037 9917 8212 9476',
        iban: 'IR600170000000113816948004',
        bankName: '',
        invoiceTitle: 'فاکتور فروش',
        footer: 'با تشکر از خرید شما',
      },
    ],
    defaultBusinessProfileId: 'business_default',
  },
  customers: [
    {
      id: 'cus_mansouri', code: '100006', name: 'پخش منصوری', kind: 'customer', status: 'active',
      phone: '۰۹۱۲۳۴۵۶۷۸۹', address: 'کاشمر', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    },
    {
      id: 'cus_kashi', code: '100007', name: 'کاشی زهره', kind: 'both', status: 'active',
      phone: '۰۹۳۵۱۲۳۴۵۶۷', address: 'کاشمر - شهرک صنعتی', nationalId: '', economicCode: '', postalCode: '', openingBalance: 0,
    },
  ],
  products: [
    { id: 'prd_1001', code: '1001', name: 'طراحی تکسچر', kind: 'service', unit: 'عدد', salePrice: 4000000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0 },
    { id: 'prd_1002', code: '1002', name: 'طراحی تری‌دی', kind: 'service', unit: 'عدد', salePrice: 1500000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0 },
    { id: 'prd_1003', code: '1003', name: 'طراحی پست و استوری', kind: 'service', unit: 'عدد', salePrice: 400000, buyPrice: 0, averageCost: 0, stock: 0, minStock: 0 },
    { id: 'prd_1004', code: '1004', name: 'کاشی پرسلان ۶۰×۱۲۰', kind: 'product', unit: 'مترمربع', salePrice: 850000, buyPrice: 690000, averageCost: 690000, stock: 185, minStock: 40 },
    { id: 'prd_1005', code: '1005', name: 'ایفکت دیجیتال', kind: 'product', unit: 'کیلو', salePrice: 1200000, buyPrice: 980000, averageCost: 980000, stock: 18, minStock: 8 },
  ],
  invoices: [
    {
      id: 'inv_demo', number: '300159', businessProfileId: 'business_default', kind: 'sale', status: 'partial', date: '۱۴۰۵/۰۳/۰۵ ۱۳:۱۳',
      customerId: 'cus_mansouri', customerName: 'پخش منصوری', customerPhone: '', customerAddress: '',
      items: [
        { id: 'ii1', productId: 'prd_1001', description: 'طراحی تکسچر', details: '60120 ژینو، کارینا، ادوین', unit: 'عدد', qty: 3, unitPrice: 4000000 },
        { id: 'ii2', productId: 'prd_1002', description: 'طراحی تری‌دی', details: '3090 ادوین، کارو، روبین، رادین / 60120 ادوین، کارینا، پارلا، ژینو / 100100 پارلا، بینتو، هارل طوسی، هارل کرم', unit: 'عدد', qty: 12, unitPrice: 1500000 },
        { id: 'ii3', productId: 'prd_1003', description: 'طراحی پست و استوری', details: '', unit: 'عدد', qty: 12, unitPrice: 400000 },
      ],
      discount: 0, tax: 0, shipping: 0, notes: '',
      createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z',
    },
  ],
  returns: [],
  payments: [
    { id: 'pay_1', documentNumber: 'R-000001', invoiceId: 'inv_demo', customerId: 'cus_mansouri', direction: 'receipt', method: 'card', amount: 12000000, date: '۱۴۰۵/۰۳/۰۵', reference: 'کارت به کارت' },
  ],
  checks: [
    { id: 'chk_1', documentNumber: 'C-000001', direction: 'received', customerId: 'cus_mansouri', amount: 15000000, dueDate: '1405/03/20', number: '458721', bank: 'ملت', owner: 'پخش منصوری', status: 'pending' },
  ],
  adjustments: [],
  stockMovements: [],
  accounts: SYSTEM_ACCOUNTS,
  journalEntries: [],
  moneyTransactions: [],
};
