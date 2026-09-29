'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Boxes,
  CalendarClock,
  FileDown,
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { Customer, Invoice, Product, ReturnDocument, StockMovement } from '@/lib/types';
import { buildCustomerLedger, invoiceTotal, money } from '@/lib/utils';
import { formatPersianDate, normalizeStoredDate, todayIso } from '@/lib/standards';
import { downloadCsv, downloadExcel, type ExportCell } from '@/lib/report-export';
import { JalaliDateRangePicker } from '@/components/ui/jalali-date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';

type ReportTab = 'sales' | 'balances' | 'checks' | 'inventory' | 'ledger' | 'cardex';

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function normalizedDate(value: string) {
  if (!value || value === 'ابتدای دوره') return '';
  return normalizeStoredDate(value);
}

function inRange(value: string, fromDate: string, toDate: string) {
  const date = normalizedDate(value);
  if (!date) return false;
  return date >= fromDate && date <= toDate;
}

function before(value: string, dateLimit: string) {
  if (value === 'ابتدای دوره') return true;
  const date = normalizedDate(value);
  return !!date && date < dateLimit;
}

function onOrBefore(value: string, dateLimit: string) {
  if (value === 'ابتدای دوره') return true;
  const date = normalizedDate(value);
  return !!date && date <= dateLimit;
}

function invoiceRawSubtotal(invoice: Invoice) {
  return invoice.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
}

function invoiceAmountForProduct(invoice: Invoice, productId: string) {
  if (!productId) return invoiceTotal(invoice);
  const subtotal = invoiceRawSubtotal(invoice);
  if (subtotal <= 0) return 0;
  const selected = invoice.items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  return invoiceTotal(invoice) * (selected / subtotal);
}

function returnAmountForProduct(document: ReturnDocument, productId: string) {
  if (!productId) return Number(document.totalAmount || 0);
  const subtotal = document.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  if (subtotal <= 0) return 0;
  const selected = document.items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  return Number(document.totalAmount || 0) * (selected / subtotal);
}

function productNames(invoice: Invoice, products: Product[], productId: string) {
  if (productId) return products.find((item) => item.id === productId)?.name || '—';
  const names = [...new Set(invoice.items.map((item) => products.find((p) => p.id === item.productId)?.name || item.description).filter(Boolean))];
  return names.slice(0, 3).join('، ') + (names.length > 3 ? '…' : '');
}

function movementSortKey(movement: StockMovement) {
  const date = movement.date === 'ابتدای دوره' ? '0000-00-00' : normalizedDate(movement.date);
  return date + '|' + movement.createdAt + '|' + movement.id;
}

function movementLabel(movement: StockMovement) {
  if (movement.type === 'opening') return 'موجودی اول دوره';
  if (movement.type === 'purchase') return 'خرید';
  if (movement.type === 'sale') return 'فروش';
  if (movement.type === 'sale-return') return 'مرجوعی فروش';
  if (movement.type === 'purchase-return') return 'مرجوعی خرید';
  if (movement.type === 'adjustment') return movement.action === 'count' ? 'شمارش انبار' : 'اصلاح موجودی';
  return 'برگشت / اصلاح سند';
}

function asOfInventory(product: Product, movements: StockMovement[], toDate: string) {
  const rows = movements
    .filter((movement) => movement.productId === product.id && onOrBefore(movement.date, toDate))
    .sort((a, b) => movementSortKey(a).localeCompare(movementSortKey(b)));
  const last = rows.at(-1);
  return {
    stock: last ? Number(last.balanceAfter || 0) : 0,
    averageCost: last ? Number(last.averageCostAfter || 0) : Number(product.averageCost || product.buyPrice || 0),
  };
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>;
}

export function ReportsView() {
  const {
    customers,
    products,
    invoices,
    returns,
    payments,
    checks,
    adjustments,
    stockMovements,
    settings,
  } = useAccountingStore();

  const [tab, setTab] = useState<ReportTab>('sales');
  const [fromDate, setFromDate] = useState(daysAgoIso(30));
  const [toDate, setToDate] = useState(todayIso());
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [documentKind, setDocumentKind] = useState<'all' | 'sale' | 'purchase'>('all');
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState(customers[0]?.id || '');
  const [selectedCardexProductId, setSelectedCardexProductId] = useState(products.find((item) => item.kind === 'product')?.id || '');

  const postedInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void'),
    [invoices]
  );
  const finalizedReturns = useMemo(
    () => returns.filter((document) => document.status === 'final'),
    [returns]
  );

  const filteredInvoices = useMemo(() => postedInvoices.filter((invoice) => {
    if (!inRange(invoice.date, fromDate, toDate)) return false;
    if (documentKind !== 'all' && invoice.kind !== documentKind) return false;
    if (customerId && invoice.customerId !== customerId) return false;
    if (productId && !invoice.items.some((item) => item.productId === productId)) return false;
    return true;
  }), [postedInvoices, fromDate, toDate, documentKind, customerId, productId]);

  const filteredReturns = useMemo(() => finalizedReturns.filter((document) => {
    if (!inRange(document.date, fromDate, toDate)) return false;
    if (documentKind === 'sale' && document.kind !== 'sale-return') return false;
    if (documentKind === 'purchase' && document.kind !== 'purchase-return') return false;
    if (customerId && document.customerId !== customerId) return false;
    if (productId && !document.items.some((item) => item.productId === productId)) return false;
    return true;
  }), [finalizedReturns, fromDate, toDate, documentKind, customerId, productId]);

  const salesInvoices = filteredInvoices.filter((invoice) => invoice.kind === 'sale');
  const purchaseInvoices = filteredInvoices.filter((invoice) => invoice.kind === 'purchase');
  const saleReturns = filteredReturns.filter((document) => document.kind === 'sale-return');
  const purchaseReturns = filteredReturns.filter((document) => document.kind === 'purchase-return');

  const grossSales = salesInvoices.reduce((sum, invoice) => sum + invoiceAmountForProduct(invoice, productId), 0);
  const grossPurchases = purchaseInvoices.reduce((sum, invoice) => sum + invoiceAmountForProduct(invoice, productId), 0);
  const saleReturnTotal = saleReturns.reduce((sum, document) => sum + returnAmountForProduct(document, productId), 0);
  const purchaseReturnTotal = purchaseReturns.reduce((sum, document) => sum + returnAmountForProduct(document, productId), 0);
  const netSales = grossSales - saleReturnTotal;
  const netPurchases = grossPurchases - purchaseReturnTotal;

  const selectedSaleIds = new Set(salesInvoices.map((invoice) => invoice.id));
  const selectedSaleReturnIds = new Set(saleReturns.map((document) => document.id));
  const saleCost = stockMovements
    .filter((movement) => movement.sourceType === 'invoice' && selectedSaleIds.has(movement.sourceId) && movement.quantity < 0)
    .filter((movement) => !productId || movement.productId === productId)
    .reduce((sum, movement) => sum + Math.abs(Number(movement.quantity || 0)) * Number(movement.unitCost || 0), 0);
  const returnedCost = stockMovements
    .filter((movement) => movement.sourceType === 'return' && selectedSaleReturnIds.has(movement.sourceId) && movement.quantity > 0)
    .filter((movement) => !productId || movement.productId === productId)
    .reduce((sum, movement) => sum + Number(movement.quantity || 0) * Number(movement.unitCost || 0), 0);
  const netCostOfSales = saleCost - returnedCost;
  const grossProfit = netSales - netCostOfSales;

  const salesRows = useMemo(() => {
    const invoiceRows = filteredInvoices.map((invoice) => ({
      key: 'invoice-' + invoice.id,
      date: invoice.date,
      type: invoice.kind === 'sale' ? 'فروش' : 'خرید',
      number: invoice.number,
      customer: invoice.customerName,
      products: productNames(invoice, products, productId),
      amount: invoiceAmountForProduct(invoice, productId),
      sign: 1,
    }));
    const returnRows = filteredReturns.map((document) => ({
      key: 'return-' + document.id,
      date: document.date,
      type: document.kind === 'sale-return' ? 'مرجوعی فروش' : 'مرجوعی خرید',
      number: document.number,
      customer: document.customerName,
      products: productId
        ? products.find((item) => item.id === productId)?.name || '—'
        : [...new Set(document.items.map((item) => products.find((p) => p.id === item.productId)?.name || item.description))].slice(0, 3).join('، '),
      amount: returnAmountForProduct(document, productId),
      sign: -1,
    }));
    return [...invoiceRows, ...returnRows].sort((a, b) => normalizedDate(b.date).localeCompare(normalizedDate(a.date)));
  }, [filteredInvoices, filteredReturns, productId, products]);

  const balanceRows = useMemo(() => {
    return customers
      .filter((customer) => !customerId || customer.id === customerId)
      .map((customer) => {
        const ledger = buildCustomerLedger(customer, invoices, payments, checks, adjustments, returns)
          .filter((entry) => entry.effective);
        const opening = ledger
          .filter((entry) => before(entry.date, fromDate))
          .reduce((sum, entry) => sum + Number(entry.debit || 0) - Number(entry.credit || 0), 0);
        const range = ledger.filter((entry) => inRange(entry.date, fromDate, toDate));
        const debit = range.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);
        const credit = range.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
        const closing = opening + debit - credit;
        return { customer, opening, debit, credit, closing };
      })
      .filter((row) => Math.abs(row.opening) > 0.0001 || Math.abs(row.debit) > 0.0001 || Math.abs(row.credit) > 0.0001 || Math.abs(row.closing) > 0.0001)
      .sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing));
  }, [customers, customerId, invoices, payments, checks, adjustments, returns, fromDate, toDate]);

  const debtors = balanceRows.filter((row) => row.closing > 0).reduce((sum, row) => sum + row.closing, 0);
  const creditors = balanceRows.filter((row) => row.closing < 0).reduce((sum, row) => sum + Math.abs(row.closing), 0);

  const checkRows = useMemo(() => checks
    .filter((check) => inRange(check.dueDate, fromDate, toDate))
    .filter((check) => !customerId || check.customerId === customerId)
    .map((check) => {
      const customer = customers.find((item) => item.id === check.customerId);
      const dueKey = normalizedDate(check.dueDate);
      const timing = check.status === 'pending'
        ? (dueKey < todayIso() ? 'سررسید گذشته' : 'آینده')
        : check.status === 'cleared' ? 'وصول / پاس شده' : 'برگشتی';
      return { check, customerName: customer?.name || '—', timing };
    })
    .sort((a, b) => normalizedDate(a.check.dueDate).localeCompare(normalizedDate(b.check.dueDate))),
  [checks, customers, customerId, fromDate, toDate]);

  const overdueChecks = checkRows.filter((row) => row.check.status === 'pending' && normalizedDate(row.check.dueDate) < todayIso()).reduce((sum, row) => sum + row.check.amount, 0);
  const futureChecks = checkRows.filter((row) => row.check.status === 'pending' && normalizedDate(row.check.dueDate) >= todayIso()).reduce((sum, row) => sum + row.check.amount, 0);

  const inventoryRows = useMemo(() => products
    .filter((product) => product.kind === 'product')
    .filter((product) => !productId || product.id === productId)
    .map((product) => {
      const rangeMovements = stockMovements.filter((movement) =>
        movement.productId === product.id && inRange(movement.date, fromDate, toDate)
      );
      const incoming = rangeMovements.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0);
      const outgoing = rangeMovements.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
      const asOf = asOfInventory(product, stockMovements, toDate);
      return {
        product,
        incoming,
        outgoing,
        stock: asOf.stock,
        averageCost: asOf.averageCost,
        value: asOf.stock * asOf.averageCost,
        belowMin: asOf.stock <= product.minStock,
      };
    })
    .sort((a, b) => a.product.code.localeCompare(b.product.code)),
  [products, productId, stockMovements, fromDate, toDate]);

  const inventoryValue = inventoryRows.reduce((sum, row) => sum + row.value, 0);
  const belowMinimumCount = inventoryRows.filter((row) => row.belowMin).length;

  const selectedLedgerCustomer = customers.find((customer) => customer.id === selectedLedgerCustomerId);
  const ledgerAll = useMemo(
    () => selectedLedgerCustomer
      ? buildCustomerLedger(selectedLedgerCustomer, invoices, payments, checks, adjustments, returns).filter((entry) => entry.effective)
      : [],
    [selectedLedgerCustomer, invoices, payments, checks, adjustments, returns]
  );
  const ledgerOpening = ledgerAll.filter((entry) => before(entry.date, fromDate)).reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
  const ledgerRows = ledgerAll.filter((entry) => inRange(entry.date, fromDate, toDate));
  const ledgerDebit = ledgerRows.reduce((sum, entry) => sum + entry.debit, 0);
  const ledgerCredit = ledgerRows.reduce((sum, entry) => sum + entry.credit, 0);
  const ledgerClosing = ledgerOpening + ledgerDebit - ledgerCredit;

  const selectedCardexProduct = products.find((product) => product.id === selectedCardexProductId);
  const cardexRows = useMemo(() => stockMovements
    .filter((movement) => movement.productId === selectedCardexProductId)
    .filter((movement) => inRange(movement.date, fromDate, toDate))
    .sort((a, b) => movementSortKey(a).localeCompare(movementSortKey(b))),
  [stockMovements, selectedCardexProductId, fromDate, toDate]);

  const cardexIncoming = cardexRows.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0);
  const cardexOutgoing = cardexRows.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
  const cardexAsOf = selectedCardexProduct ? asOfInventory(selectedCardexProduct, stockMovements, toDate) : { stock: 0, averageCost: 0 };

  const activeExport = useMemo((): { title: string; filename: string; headers: ExportCell[]; rows: ExportCell[][] } => {
    if (tab === 'sales') return {
      title: 'گزارش فروش و خرید',
      filename: 'sales-purchases-report',
      headers: ['تاریخ', 'نوع سند', 'شماره سند', 'طرف حساب', 'کالا / خدمت', 'مبلغ'],
      rows: salesRows.map((row) => [formatPersianDate(row.date), row.type, row.number, row.customer, row.products, row.sign * row.amount]),
    };
    if (tab === 'balances') return {
      title: 'گزارش بدهکاران و بستانکاران',
      filename: 'customer-balances-report',
      headers: ['کد', 'طرف حساب', 'مانده ابتدای بازه', 'بدهکار بازه', 'بستانکار بازه', 'مانده پایان بازه', 'وضعیت'],
      rows: balanceRows.map((row) => [row.customer.code, row.customer.name, row.opening, row.debit, row.credit, row.closing, row.closing > 0 ? 'بدهکار' : row.closing < 0 ? 'بستانکار' : 'تسویه']),
    };
    if (tab === 'checks') return {
      title: 'گزارش چک‌ها',
      filename: 'checks-report',
      headers: ['شماره سند', 'شماره چک', 'طرف حساب', 'نوع', 'بانک', 'سررسید', 'مبلغ', 'وضعیت', 'زمان‌بندی'],
      rows: checkRows.map((row) => [row.check.documentNumber, row.check.number, row.customerName, row.check.direction === 'received' ? 'دریافتی' : 'پرداختی', row.check.bank, formatPersianDate(row.check.dueDate), row.check.amount, row.check.status, row.timing]),
    };
    if (tab === 'inventory') return {
      title: 'گزارش موجودی و گردش کالا',
      filename: 'inventory-report',
      headers: ['کد', 'کالا', 'واحد', 'ورود بازه', 'خروج بازه', 'موجودی پایان بازه', 'میانگین هزینه', 'ارزش موجودی', 'حداقل', 'وضعیت'],
      rows: inventoryRows.map((row) => [row.product.code, row.product.name, row.product.unit, row.incoming, row.outgoing, row.stock, row.averageCost, row.value, row.product.minStock, row.belowMin ? 'زیر حداقل' : 'مناسب']),
    };
    if (tab === 'ledger') return {
      title: 'دفتر طرف حساب - ' + (selectedLedgerCustomer?.name || ''),
      filename: 'customer-ledger-report',
      headers: ['تاریخ', 'شرح', 'مرجع', 'بدهکار', 'بستانکار', 'اثر'],
      rows: ledgerRows.map((entry) => [formatPersianDate(entry.date), entry.title, entry.reference || '', entry.debit, entry.credit, entry.effective ? 'موثر' : 'بدون اثر']),
    };
    return {
      title: 'کاردکس کالا - ' + (selectedCardexProduct?.name || ''),
      filename: 'product-cardex-report',
      headers: ['تاریخ', 'نوع حرکت', 'مرجع', 'ورود', 'خروج', 'مانده', 'میانگین هزینه', 'بهای واحد'],
      rows: cardexRows.map((movement) => [formatPersianDate(movement.date), movementLabel(movement), movement.sourceReference || '', movement.quantity > 0 ? movement.quantity : 0, movement.quantity < 0 ? Math.abs(movement.quantity) : 0, movement.balanceAfter, movement.averageCostAfter, movement.unitCost]),
    };
  }, [tab, salesRows, balanceRows, checkRows, inventoryRows, ledgerRows, selectedLedgerCustomer, cardexRows, selectedCardexProduct]);

  const exportCsv = () => downloadCsv(activeExport.filename + '-' + fromDate + '-' + toDate, activeExport.headers, activeExport.rows);
  const exportExcel = () => downloadExcel(activeExport.filename + '-' + fromDate + '-' + toDate, activeExport.title, activeExport.headers, activeExport.rows);

  const tabs: Array<{ key: ReportTab; label: string; icon: typeof TrendingUp }> = [
    { key: 'sales', label: 'فروش / خرید', icon: TrendingUp },
    { key: 'balances', label: 'بدهکار / بستانکار', icon: Users },
    { key: 'checks', label: 'چک‌ها', icon: CalendarClock },
    { key: 'inventory', label: 'موجودی', icon: Boxes },
    { key: 'ledger', label: 'دفتر طرف حساب', icon: BookOpen },
    { key: 'cardex', label: 'کاردکس کالا', icon: Archive },
  ];

  return <div className="space-y-5">
    <div className="screen-only flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-slate-950">گزارش‌ها</h1>
        <p className="mt-1 text-sm text-slate-500">گزارش‌های عملیاتی با فیلتر تاریخ و خروجی CSV، Excel و چاپ/PDF</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> چاپ / PDF</Button>
      </div>
    </div>

    <Card className="screen-only">
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr]">
        <label className="space-y-1.5 lg:col-span-2"><span className="block text-xs font-bold text-slate-600">بازه تاریخ</span><JalaliDateRangePicker value={{ from: fromDate, to: toDate }} onChange={(range) => { setFromDate(range.from); setToDate(range.to); }} /></label>
        {(tab === 'sales' || tab === 'balances' || tab === 'checks') && <label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">طرف حساب</span><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">همه طرف حساب‌ها</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>}
        {(tab === 'sales' || tab === 'inventory') && <label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">کالا / خدمت</span><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">همه کالا و خدمات</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label>}
        {tab === 'sales' && <label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">نوع سند</span><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={documentKind} onChange={(event) => setDocumentKind(event.target.value as 'all' | 'sale' | 'purchase')}><option value="all">فروش و خرید</option><option value="sale">فقط فروش</option><option value="purchase">فقط خرید</option></select></label>}
      </CardContent>
    </Card>

    <div className="screen-only flex flex-wrap gap-2">
      {tabs.map(({ key, label, icon: Icon }) => <Button key={key} size="sm" variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}><Icon className="h-4 w-4" /> {label}</Button>)}
    </div>

    <div className="print-surface space-y-5">
      <div className="hidden print-block border-b-2 border-slate-900 pb-3">
        <h1 className="text-xl font-black">{activeExport.title}</h1>
        <div className="mt-1 text-xs">بازه: {formatPersianDate(fromDate)} تا {formatPersianDate(toDate)} · واحد پول: {settings.currency}</div>
      </div>

      {tab === 'sales' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="فروش خالص" value={money(netSales) + ' ' + settings.currency} subtitle={'فروش ' + money(grossSales) + ' - مرجوعی ' + money(saleReturnTotal)} />
          <MetricCard title="خرید خالص" value={money(netPurchases) + ' ' + settings.currency} subtitle={'خرید ' + money(grossPurchases) + ' - مرجوعی ' + money(purchaseReturnTotal)} />
          <MetricCard title="بهای تمام‌شده فروش" value={money(netCostOfSales) + ' ' + settings.currency} />
          <MetricCard title="سود ناخالص تقریبی" value={money(grossProfit) + ' ' + settings.currency} subtitle="بر مبنای Stock Movement و بهای ثبت‌شده" />
          <MetricCard title="تعداد سند" value={String(salesRows.length)} />
        </div>
        <Card>
          <CardHeader><CardTitle>جزئیات فروش، خرید و مرجوعی</CardTitle></CardHeader>
          <div className="table-wrap"><table className="data-table min-w-[920px]">
            <thead><tr><th>تاریخ</th><th>نوع</th><th>شماره</th><th>طرف حساب</th><th>کالا / خدمت</th><th>مبلغ</th></tr></thead>
            <tbody>{salesRows.map((row) => <tr key={row.key}><td>{formatPersianDate(row.date)}</td><td><Badge className={row.sign < 0 ? 'bg-rose-50 text-rose-700' : row.type === 'فروش' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}>{row.type}</Badge></td><td className="font-bold">{row.number}</td><td>{row.customer}</td><td>{row.products || '—'}</td><td className={row.sign < 0 ? 'font-black text-rose-700' : 'font-black'}>{row.sign < 0 ? '− ' : ''}{money(row.amount)} {settings.currency}</td></tr>)}{!salesRows.length && <EmptyRow cols={6} text="سندی در این بازه و فیلتر وجود ندارد." />}</tbody>
          </table></div>
        </Card>
      </>}

      {tab === 'balances' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="جمع بدهکاران پایان بازه" value={money(debtors) + ' ' + settings.currency} />
          <MetricCard title="جمع بستانکاران پایان بازه" value={money(creditors) + ' ' + settings.currency} />
          <MetricCard title="تعداد طرف حساب دارای گردش/مانده" value={String(balanceRows.length)} />
        </div>
        <Card><CardHeader><CardTitle>بدهکاران و بستانکاران</CardTitle></CardHeader><div className="table-wrap"><table className="data-table min-w-[900px]">
          <thead><tr><th>کد</th><th>طرف حساب</th><th>مانده ابتدای بازه</th><th>بدهکار بازه</th><th>بستانکار بازه</th><th>مانده پایان بازه</th><th>وضعیت</th></tr></thead>
          <tbody>{balanceRows.map((row) => <tr key={row.customer.id}><td>{row.customer.code}</td><td className="font-bold">{row.customer.name}</td><td>{money(Math.abs(row.opening))}{row.opening > 0 ? ' بدهکار' : row.opening < 0 ? ' بستانکار' : ''}</td><td className="text-rose-700">{money(row.debit)}</td><td className="text-emerald-700">{money(row.credit)}</td><td className="font-black">{money(Math.abs(row.closing))}</td><td>{row.closing > 0 ? <Badge className="bg-rose-50 text-rose-700">بدهکار</Badge> : row.closing < 0 ? <Badge className="bg-emerald-50 text-emerald-700">بستانکار</Badge> : <Badge>تسویه</Badge>}</td></tr>)}{!balanceRows.length && <EmptyRow cols={7} text="گردش یا مانده‌ای در این بازه وجود ندارد." />}</tbody>
        </table></div></Card>
      </>}

      {tab === 'checks' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="چک‌های سررسید گذشته" value={money(overdueChecks) + ' ' + settings.currency} />
          <MetricCard title="چک‌های آینده" value={money(futureChecks) + ' ' + settings.currency} />
          <MetricCard title="تعداد چک در بازه" value={String(checkRows.length)} />
        </div>
        <Card><CardHeader><CardTitle>چک‌ها بر اساس سررسید</CardTitle></CardHeader><div className="table-wrap"><table className="data-table min-w-[960px]">
          <thead><tr><th>سند</th><th>شماره چک</th><th>طرف حساب</th><th>نوع</th><th>بانک</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th></tr></thead>
          <tbody>{checkRows.map(({ check, customerName, timing }) => <tr key={check.id}><td className="font-bold">{check.documentNumber}</td><td>{check.number}</td><td>{customerName}</td><td>{check.direction === 'received' ? 'دریافتی' : 'پرداختی'}</td><td>{check.bank || '—'}</td><td>{formatPersianDate(check.dueDate)}</td><td className="font-black">{money(check.amount)} {settings.currency}</td><td><Badge className={timing === 'سررسید گذشته' ? 'bg-rose-50 text-rose-700' : timing === 'آینده' ? 'bg-amber-50 text-amber-700' : timing === 'برگشتی' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}>{timing}</Badge></td></tr>)}{!checkRows.length && <EmptyRow cols={8} text="چکی در این بازه وجود ندارد." />}</tbody>
        </table></div></Card>
      </>}

      {tab === 'inventory' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="ارزش موجودی پایان بازه" value={money(inventoryValue) + ' ' + settings.currency} />
          <MetricCard title="کالاهای زیر حداقل" value={String(belowMinimumCount)} />
          <MetricCard title="تعداد کالا" value={String(inventoryRows.length)} />
        </div>
        <Card><CardHeader><CardTitle>موجودی و گردش کالا</CardTitle></CardHeader><div className="table-wrap"><table className="data-table min-w-[980px]">
          <thead><tr><th>کد</th><th>کالا</th><th>ورود</th><th>خروج</th><th>موجودی پایان بازه</th><th>میانگین هزینه</th><th>ارزش</th><th>حداقل</th><th>وضعیت</th></tr></thead>
          <tbody>{inventoryRows.map((row) => <tr key={row.product.id}><td>{row.product.code}</td><td className="font-bold">{row.product.name}</td><td className="text-emerald-700">{money(row.incoming)} {row.product.unit}</td><td className="text-rose-700">{money(row.outgoing)} {row.product.unit}</td><td className="font-black">{money(row.stock)} {row.product.unit}</td><td>{money(row.averageCost)} {settings.currency}</td><td>{money(row.value)} {settings.currency}</td><td>{money(row.product.minStock)}</td><td>{row.belowMin ? <Badge className="bg-rose-50 text-rose-700">زیر حداقل</Badge> : <Badge className="bg-emerald-50 text-emerald-700">مناسب</Badge>}</td></tr>)}{!inventoryRows.length && <EmptyRow cols={9} text="کالایی مطابق فیلتر وجود ندارد." />}</tbody>
        </table></div></Card>
      </>}

      {tab === 'ledger' && <>
        <Card className="screen-only"><CardContent><label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">طرف حساب دفتر</span><select className="h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedLedgerCustomerId} onChange={(event) => setSelectedLedgerCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label></CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard title="مانده ابتدای بازه" value={money(Math.abs(ledgerOpening)) + (ledgerOpening > 0 ? ' بدهکار' : ledgerOpening < 0 ? ' بستانکار' : '')} />
          <MetricCard title="بدهکار بازه" value={money(ledgerDebit) + ' ' + settings.currency} />
          <MetricCard title="بستانکار بازه" value={money(ledgerCredit) + ' ' + settings.currency} />
          <MetricCard title="مانده پایان بازه" value={money(Math.abs(ledgerClosing)) + (ledgerClosing > 0 ? ' بدهکار' : ledgerClosing < 0 ? ' بستانکار' : '')} />
        </div>
        <Card><CardHeader><CardTitle>دفتر {selectedLedgerCustomer?.name || 'طرف حساب'}</CardTitle></CardHeader><div className="table-wrap"><table className="data-table min-w-[840px]">
          <thead><tr><th>تاریخ</th><th>شرح</th><th>مرجع</th><th>بدهکار</th><th>بستانکار</th></tr></thead>
          <tbody>{ledgerRows.map((entry) => <tr key={entry.id}><td>{formatPersianDate(entry.date)}</td><td className="font-bold">{entry.title}</td><td>{entry.reference || '—'}</td><td className="text-rose-700">{entry.debit ? money(entry.debit) : '—'}</td><td className="text-emerald-700">{entry.credit ? money(entry.credit) : '—'}</td></tr>)}{!ledgerRows.length && <EmptyRow cols={5} text="گردشی در این بازه وجود ندارد." />}</tbody>
        </table></div></Card>
      </>}

      {tab === 'cardex' && <>
        <Card className="screen-only"><CardContent><label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">کالای کاردکس</span><select className="h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedCardexProductId} onChange={(event) => setSelectedCardexProductId(event.target.value)}>{products.filter((product) => product.kind === 'product').map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label></CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard title="ورود بازه" value={money(cardexIncoming) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="خروج بازه" value={money(cardexOutgoing) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="موجودی پایان بازه" value={money(cardexAsOf.stock) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="میانگین هزینه پایان بازه" value={money(cardexAsOf.averageCost) + ' ' + settings.currency} />
        </div>
        <Card><CardHeader><CardTitle>کاردکس {selectedCardexProduct?.name || 'کالا'}</CardTitle></CardHeader><div className="table-wrap"><table className="data-table min-w-[940px]">
          <thead><tr><th>تاریخ</th><th>نوع حرکت</th><th>مرجع</th><th>ورود</th><th>خروج</th><th>مانده</th><th>میانگین بعد حرکت</th><th>بهای واحد</th></tr></thead>
          <tbody>{cardexRows.map((movement) => <tr key={movement.id}><td>{formatPersianDate(movement.date)}</td><td className="font-bold">{movementLabel(movement)}</td><td>{movement.sourceReference || '—'}</td><td className="text-emerald-700">{movement.quantity > 0 ? money(movement.quantity) : '—'}</td><td className="text-rose-700">{movement.quantity < 0 ? money(Math.abs(movement.quantity)) : '—'}</td><td className="font-black">{money(movement.balanceAfter)} {selectedCardexProduct?.unit}</td><td>{money(movement.averageCostAfter)} {settings.currency}</td><td>{money(movement.unitCost)} {settings.currency}</td></tr>)}{!cardexRows.length && <EmptyRow cols={8} text="حرکتی در این بازه وجود ندارد." />}</tbody>
        </table></div></Card>
      </>}
    </div>
  </div>;
}
