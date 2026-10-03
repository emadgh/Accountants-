import type { AccountingData, Invoice, InvoiceItem, JournalEntry } from './types';
import { invoiceTotal } from './utils';

const date = '۱۴۰۵/۰۷/۰۹';
const at = '2026-09-30T09:00:00.000Z';
const sequence = (number: number) => String(number).padStart(6, '0');

function journal(data: AccountingData, sourceType: JournalEntry['sourceType'], sourceId: string, description: string, lines: JournalEntry['lines']) {
  data.journalEntries.push({ id: `je_${sourceId}`, date, description, sourceType, sourceId,
    sourceReference: description, action: 'post', createdAt: at, lines });
}

function invoice(data: AccountingData, id: string, kind: Invoice['kind'], number: number, customerId: string, projectId: string, items: InvoiceItem[], status: Invoice['status']): Invoice {
  const customer = data.customers.find((item) => item.id === customerId)!;
  const saved: Invoice = { id, number: `${kind === 'sale' ? 'S' : 'P'}-${sequence(number)}`,
    kind, status, businessProfileId: 'business_default', templateId: 'classic', date,
    customerId, customerName: customer.name, customerPhone: customer.phone, customerAddress: customer.address,
    projectId, items, discount: 0, tax: 0, shipping: 0, notes: 'سند نمونه متصل به پروژه.',
    createdAt: at, updatedAt: at, finalizedAt: at, revision: 1,
    auditTrail: [{ id: `audit_${id}`, action: 'finalized', at, revision: 1 }] };
  data.invoices.push(saved);
  const total = invoiceTotal(saved);
  let inventory = 0;
  if (kind === 'purchase') for (const item of items) {
    const product = data.products.find((candidate) => candidate.id === item.productId);
    if (product?.kind !== 'product') continue;
    inventory += item.qty * item.unitPrice;
    product.stock += item.qty;
    product.averageCost = item.unitPrice;
    data.stockMovements.push({ id: `stock_${item.id}`, productId: product.id, warehouseId: 'main', date,
      createdAt: at, quantity: item.qty, balanceAfter: product.stock, averageCostAfter: product.averageCost,
      unitCost: item.unitPrice, type: 'purchase', action: 'finalize', sourceType: 'invoice', sourceId: id,
      sourceReference: saved.number, sourceKind: kind });
  }
  const amounts = kind === 'sale'
    ? [['acct_ar', total, 0], ['acct_sales', 0, total]] as const
    : [['acct_inventory', inventory, 0], ['acct_purchase_service', total - inventory, 0], ['acct_ap', 0, total]] as const;
  journal(data, 'invoice', id, saved.number, amounts.filter(([, debit, credit]) => debit || credit)
    .map(([accountId, debit, credit], index) => ({ id: `jl_${id}_${index}`, accountId, debit, credit })));
  return saved;
}

function payment(data: AccountingData, saved: Invoice, amount: number, number: number) {
  const receipt = saved.kind === 'sale';
  const id = `pay_${saved.id}`;
  data.payments.push({ id, documentNumber: `${receipt ? 'R' : 'PY'}-${sequence(number)}`,
    invoiceId: saved.id, customerId: saved.customerId, direction: receipt ? 'receipt' : 'payment',
    method: 'card', amount, date, reference: `تسویه ${saved.number}` });
  journal(data, 'payment', id, `تسویه ${saved.number}`, [
    { id: `jl_${id}_1`, accountId: receipt ? 'acct_bank' : 'acct_ap', debit: amount, credit: 0 },
    { id: `jl_${id}_2`, accountId: receipt ? 'acct_ar' : 'acct_bank', debit: 0, credit: amount },
  ]);
}

function expense(data: AccountingData, id: string, projectId: string, description: string, amount: number) {
  data.moneyTransactions.push({ id, kind: 'expense', status: 'final', date, amount,
    settlementAccountId: 'acct_bank', categoryAccountId: 'acct_general_expense',
    description, reference: id, projectId, createdAt: at, updatedAt: at });
  journal(data, 'money-transaction', id, description, [
    { id: `jl_${id}_1`, accountId: 'acct_general_expense', debit: amount, credit: 0 },
    { id: `jl_${id}_2`, accountId: 'acct_bank', debit: 0, credit: amount },
  ]);
}

function customer(data: AccountingData, id: string, code: string, name: string, kind: 'customer' | 'supplier') {
  data.customers.push({ id, code, name, kind, status: 'active', phone: '', address: '',
    nationalId: '', economicCode: '', postalCode: '', openingBalance: 0 });
}

function lines(data: AccountingData, id: string, specs: Array<[string, number, number?]>) {
  return specs.map(([productId, qty, unitPrice], index) => {
    const product = data.products.find((item) => item.id === productId)!;
    return { id: `${id}_${index}`, productId, description: product.name, unit: product.unit,
      qty, unitPrice: unitPrice ?? product.buyPrice };
  });
}

export function enrichCreativeStudioSeed(data: AccountingData) {
  customer(data, 'cus_studio_cafe', '100002', 'کافه روشن', 'customer');
  customer(data, 'cus_studio_photo', '200002', 'استودیو عکاسی قاب', 'supplier');
  customer(data, 'cus_studio_host', '200003', 'میزبان وب افق', 'supplier');
  const services = [
    ['brandbook', 'راهنمای هویت بصری و برندبوک', 9_000_000, 0],
    ['packaging', 'طراحی بسته‌بندی محصول', 6_000_000, 0],
    ['social', 'طراحی قالب شبکه اجتماعی', 5_000_000, 0],
    ['photography', 'عکاسی تبلیغاتی محصول', 0, 3_000_000],
    ['hosting', 'هاست و دامنه سالانه', 0, 2_400_000],
  ] as const;
  data.products.push(...services.map(([key, name, salePrice, buyPrice], index) => ({
    id: `srv_${key}`, code: `S-${index + 6}`, name, kind: 'service' as const, unit: 'پروژه',
    salePrice, buyPrice, averageCost: 0, stock: 0, minStock: 0, category: buyPrice ? 'خدمات پیمانکار' : 'طراحی',
  })));
  const projectId = 'project_cafe_brand';
  data.projects.push({ id: projectId, customerId: 'cus_studio_cafe', title: 'هویت بصری و بسته‌بندی کافه روشن',
    status: 'in-progress', dueDate: '۱۴۰۵/۰۹/۱۵', agreedAmount: 32_000_000,
    notes: 'طراحی لوگو، برندبوک، بسته‌بندی و قالب شبکه اجتماعی.', createdAt: at, updatedAt: at });
  const items = lines(data, 'line_cafe', [['srv_logo', 1, 12_000_000], ['srv_brandbook', 1, 9_000_000],
    ['srv_packaging', 1, 6_000_000], ['srv_social', 1, 5_000_000]]);
  data.quotes.push({ id: 'quote_studio_cafe', number: 'Q-000002', status: 'accepted',
    customerId: 'cus_studio_cafe', customerName: 'کافه روشن', customerPhone: '', customerAddress: '',
    businessProfileId: 'business_default', date, validUntil: '۱۴۰۵/۰۸/۱۵',
    items: items.map((item) => ({ ...item, id: `quote_${item.id}` })), discount: 0, tax: 0, shipping: 0,
    notes: 'پیش‌فاکتور نمونه هویت بصری.', projectId, createdAt: at, updatedAt: at });
  const sale = invoice(data, 'inv_studio_cafe', 'sale', 2, 'cus_studio_cafe', projectId, items, 'partial');
  sale.dueDate = '۱۴۰۵/۰۹/۱۵';
  sale.installments = [{ id: 'inst_cafe_1', dueDate: date, amount: 12_000_000 },
    { id: 'inst_cafe_2', dueDate: '۱۴۰۵/۰۸/۱۵', amount: 10_000_000 },
    { id: 'inst_cafe_3', dueDate: '۱۴۰۵/۰۹/۱۵', amount: 10_000_000 }];
  payment(data, sale, 12_000_000, 1);
  invoice(data, 'inv_studio_print', 'purchase', 1, 'cus_studio_chap', 'project_brand_website',
    lines(data, 'line_print', [['srv_brochure', 2]]), 'final');
  const photo = invoice(data, 'inv_studio_photo', 'purchase', 2, 'cus_studio_photo', projectId,
    lines(data, 'line_photo', [['srv_photography', 2]]), 'settled');
  payment(data, photo, invoiceTotal(photo), 1);
  invoice(data, 'inv_studio_host', 'purchase', 3, 'cus_studio_host', 'project_brand_website',
    lines(data, 'line_host', [['srv_hosting', 1]]), 'final');
  expense(data, 'money_studio_cafe_proof', projectId, 'چاپ نمونه رنگی بسته‌بندی کافه روشن', 850_000);
  data.settings.numbering.sale.next = 3;
  data.settings.numbering.purchase.next = 4;
  data.settings.numbering.receipt.next = 2;
  data.settings.numbering.payment.next = 2;
  data.settings.numbering.quote.next = 3;
}

export function enrichConstructionSeed(data: AccountingData) {
  const projectId = 'project_suite_one_bedroom';
  const suppliers = [['ceramic', 'کاشی و سرامیک نگین'], ['fixtures', 'تجهیزات بهداشتی آبتین'],
    ['mason', 'استادکار بنایی رضایی'], ['finishing', 'گروه گچبری و کاشی‌کاری سپید'],
    ['metal', 'جوشکاری و آهنگری آذر'], ['electrical', 'تأسیسات برق روشن'], ['plumbing', 'لوله‌کشی آبشار']] as const;
  suppliers.forEach(([key, name], index) => customer(data, `cus_suite_${key}`, String(200002 + index), name, 'supplier'));
  const materials = [
    ['brick', 'آجر سفال دیواری', 'عدد', 12_000], ['cement', 'سیمان تیپ ۲', 'کیسه', 210_000],
    ['sand', 'ماسه شسته', 'متر مکعب', 1_350_000], ['rebar', 'میلگرد ۱۲', 'کیلوگرم', 48_000],
    ['ceramic_floor', 'سرامیک کف ۶۰×۶۰', 'متر مربع', 780_000], ['ceramic_wall', 'کاشی دیوار سرویس', 'متر مربع', 690_000],
    ['adhesive', 'چسب کاشی و پودر بندکشی', 'بسته', 340_000], ['faucet', 'ست شیرآلات روشویی و دوش', 'ست', 18_500_000],
    ['toilet', 'توالت فرنگی و روشویی', 'ست', 21_000_000], ['pipe', 'لوله پنج‌لایه و اتصالات', 'بسته', 16_000_000],
    ['wire', 'سیم و کابل برق و کلید و پریز', 'بسته', 22_000_000],
  ] as const;
  data.products.push(...materials.map(([key, name, unit, buyPrice], index) => ({ id: `mat_suite_${key}`,
    code: `M-${index + 1}`, name, kind: 'product' as const, unit, salePrice: 0, buyPrice,
    averageCost: 0, stock: 0, minStock: 0, category: 'مصالح و تجهیزات ساختمانی' })));
  const trades = [['mason', 'دستمزد استاد بنا و آجرچینی', 45_000_000], ['plaster', 'دستمزد گچبری و سفیدکاری', 32_000_000],
    ['tiler', 'دستمزد سرامیک‌کاری کف و دیوار', 38_000_000], ['welder', 'دستمزد جوشکاری اسکلت فلزی', 48_000_000],
    ['electrician', 'دستمزد برق‌کاری و نصب تجهیزات', 29_000_000], ['plumber', 'دستمزد لوله‌کشی و نصب شیرآلات', 34_000_000]] as const;
  data.products.push(...trades.map(([key, name, buyPrice], index) => ({ id: `labor_suite_${key}`, code: `L-${index + 1}`,
    name, kind: 'service' as const, unit: 'مرحله', salePrice: 0, buyPrice, averageCost: 0, stock: 0, minStock: 0, category: 'دستمزد استادکار' })));
  const buy = (key: string, number: number, supplier: string, specs: Array<[string, number]>, status: Invoice['status']) =>
    invoice(data, `inv_suite_${key}`, 'purchase', number, supplier, projectId, lines(data, `line_suite_${key}`, specs), status);
  const masonry = buy('masonry_materials', 1, 'cus_construction_supplier', [['mat_suite_brick', 4_000],
    ['mat_suite_cement', 120], ['mat_suite_sand', 12], ['mat_suite_rebar', 700]], 'partial');
  payment(data, masonry, 50_000_000, 1);
  buy('ceramics', 2, 'cus_suite_ceramic', [['mat_suite_ceramic_floor', 65], ['mat_suite_ceramic_wall', 42], ['mat_suite_adhesive', 25]], 'final');
  const fixtures = buy('fixtures', 3, 'cus_suite_fixtures', [['mat_suite_faucet', 1], ['mat_suite_toilet', 1], ['mat_suite_pipe', 1], ['mat_suite_wire', 1]], 'settled');
  payment(data, fixtures, invoiceTotal(fixtures), 2);
  const laborBills: Array<[string, string, Invoice['status']]> = [['mason', 'mason', 'settled'], ['plaster', 'finishing', 'final'],
    ['tiler', 'finishing', 'final'], ['welder', 'metal', 'settled'], ['electrician', 'electrical', 'final'], ['plumber', 'plumbing', 'partial']];
  laborBills.forEach(([key, supplier, status], index) => {
    const bill = buy(key, index + 4, `cus_suite_${supplier}`, [[`labor_suite_${key}`, 1]], status);
    if (status === 'settled') payment(data, bill, invoiceTotal(bill), key === 'mason' ? 3 : 4);
    if (key === 'plumber') payment(data, bill, 10_000_000, 5);
  });
  const milestone = invoice(data, 'inv_suite_milestone', 'sale', 1, 'cus_construction_client', projectId,
    lines(data, 'line_suite_milestone', [['srv_arch_design', 1, 80_000_000], ['srv_earthworks', 1, 140_000_000]]), 'partial');
  milestone.notes = 'صورت‌وضعیت مرحله طراحی و آماده‌سازی.';
  milestone.dueDate = '۱۴۰۵/۰۹/۰۹';
  milestone.installments = [{ id: 'inst_suite_1', dueDate: date, amount: 100_000_000 },
    { id: 'inst_suite_2', dueDate: '۱۴۰۵/۰۸/۰۹', amount: 60_000_000 }, { id: 'inst_suite_3', dueDate: '۱۴۰۵/۰۹/۰۹', amount: 60_000_000 }];
  payment(data, milestone, 100_000_000, 1);
  data.checks.push({ id: 'check_suite_client', documentNumber: 'C-000001', direction: 'received', customerId: 'cus_construction_client',
    amount: 60_000_000, dueDate: '۱۴۰۵/۰۸/۰۹', number: '۸۴۳۲۱۵', bank: 'بانک نمونه', owner: 'شرکت مهرسازان سپهر', status: 'pending' },
    { id: 'check_suite_ceramics', documentNumber: 'C-000002', direction: 'issued', customerId: 'cus_suite_ceramic',
      amount: 20_000_000, dueDate: '۱۴۰۵/۰۸/۱۵', number: '۷۰۱۴۵۸', bank: 'بانک نمونه', owner: 'شرکت معماری و ساخت آبان', status: 'pending' });
  data.payments.push({ id: 'pay_suite_check_client', documentNumber: 'R-000002', invoiceId: milestone.id, customerId: milestone.customerId,
    direction: 'receipt', method: 'check', checkId: 'check_suite_client', amount: 60_000_000, date },
    { id: 'pay_suite_check_ceramics', documentNumber: 'PY-000006', invoiceId: 'inv_suite_ceramics', customerId: 'cus_suite_ceramic',
      direction: 'payment', method: 'check', checkId: 'check_suite_ceramics', amount: 20_000_000, date });
  expense(data, 'money_suite_transport', projectId, 'حمل مصالح و تخلیه در کارگاه', 8_500_000);
  expense(data, 'money_suite_permit', projectId, 'هزینه بازدید و مجوزهای اولیه پروژه', 4_200_000);
  data.settings.numbering.sale.next = 2;
  data.settings.numbering.purchase.next = 10;
  data.settings.numbering.receipt.next = 3;
  data.settings.numbering.payment.next = 7;
  data.settings.numbering.check.next = 3;
}
