'use client';
import { asOfInventory, before, daysAgoIso, inRange, invoiceAmountForProduct, movementLabel, movementSortKey, normalizedDate, productNames, returnAmountForProduct } from '@/lib/domain/report-calculations';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';

import { BalancesChart, CardexStockChart, DueChecksChart, InventoryValueChart, LedgerBalanceChart, SalesPurchaseTrendChart } from '@/components/analytics/charts';
import { AppNavbarContent } from '@/components/app-navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JalaliDateRangePicker } from '@/components/ui/jalali-date-picker';
import { MetricCard } from '@/components/ui/metric-card';
import { buildTimeSeries } from '@/lib/chart-data';
import { downloadCsv, downloadExcel, type ExportCell } from '@/lib/report-export';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { InvoiceKind } from '@/lib/types';
import { buildCustomerLedger, invoiceLineNet, money } from '@/lib/utils';
import {
  Archive,
  BookOpen,
  Boxes,
  CalendarClock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Package,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type ReportTab = 'sales' | 'product-sales' | 'balances' | 'checks' | 'inventory' | 'ledger' | 'cardex';

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="!py-14 text-center text-slate-400">{text}</td></tr>;
}

export function ReportsView({ onOpenInvoice, onOpenCustomer, onOpenCheck }: {
  onOpenInvoice?: (invoiceId: string, kind: InvoiceKind) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenCheck?: (checkId: string) => void;
}) {
  const { customers,
    products,
    invoices,
    returns,
    payments,
    checks,
    adjustments,
    stockMovements,
    settings, } = useAccountingStore(useShallow((state) => ({ customers: state.customers, products: state.products, invoices: state.invoices, returns: state.returns, payments: state.payments, checks: state.checks, adjustments: state.adjustments, stockMovements: state.stockMovements, settings: state.settings })));

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
      sourceInvoiceId: invoice.id,
      sourceInvoiceKind: invoice.kind,
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
      sourceInvoiceId: document.originalInvoiceId,
      sourceInvoiceKind: document.kind === 'sale-return' ? 'sale' as const : 'purchase' as const,
      customer: document.customerName,
      products: productId
        ? products.find((item) => item.id === productId)?.name || '—'
        : [...new Set(document.items.map((item) => products.find((p) => p.id === item.productId)?.name || item.description))].slice(0, 3).join('، '),
      amount: returnAmountForProduct(document, productId),
      sign: -1,
    }));
    return [...invoiceRows, ...returnRows].sort((a, b) => normalizedDate(b.date).localeCompare(normalizedDate(a.date)));
  }, [filteredInvoices, filteredReturns, productId, products]);

  const productSalesRows = useMemo(() => {
    const rows = new Map<string, { name: string; category: string; quantity: number; sales: number; returns: number }>();
    const productInfo = new Map(products.map((product) => [product.id, product]));
    const keyFor = (productId: string | undefined, description: string) => productId || `manual:${description.trim().toLowerCase()}`;
    for (const invoice of postedInvoices.filter((item) => item.kind === 'sale' && inRange(item.date, fromDate, toDate) && (!customerId || item.customerId === customerId))) {
      for (const item of invoice.items) {
        const key = keyFor(item.productId, item.description);
        const product = item.productId ? productInfo.get(item.productId) : undefined;
        const row = rows.get(key) || { name: product?.name || item.description || 'شرح دستی', category: product?.category || (product ? 'بدون دسته' : 'خدمات دستی'), quantity: 0, sales: 0, returns: 0 };
        row.quantity += Number(item.qty || 0);
        row.sales += invoiceLineNet(item);
        rows.set(key, row);
      }
    }
    for (const document of finalizedReturns.filter((item) => item.kind === 'sale-return' && inRange(item.date, fromDate, toDate) && (!customerId || item.customerId === customerId))) {
      for (const item of document.items) {
        const key = keyFor(item.productId, item.description);
        const product = item.productId ? productInfo.get(item.productId) : undefined;
        const row = rows.get(key) || { name: product?.name || item.description || 'شرح دستی', category: product?.category || (product ? 'بدون دسته' : 'خدمات دستی'), quantity: 0, sales: 0, returns: 0 };
        row.quantity -= Number(item.qty || 0);
        row.returns += Number(item.qty || 0) * Number(item.unitPrice || 0);
        rows.set(key, row);
      }
    }
    return [...rows.values()].map((row) => ({ ...row, netSales: row.sales - row.returns })).sort((left, right) => right.netSales - left.netSales);
  }, [postedInvoices, finalizedReturns, products, fromDate, toDate, customerId]);

  const categorySalesRows = useMemo(() => {
    const categories = new Map<string, { quantity: number; sales: number; returns: number }>();
    for (const row of productSalesRows) {
      const category = categories.get(row.category) || { quantity: 0, sales: 0, returns: 0 };
      category.quantity += row.quantity; category.sales += row.sales; category.returns += row.returns;
      categories.set(row.category, category);
    }
    return [...categories.entries()].map(([category, value]) => ({ category, ...value, netSales: value.sales - value.returns })).sort((left, right) => right.netSales - left.netSales);
  }, [productSalesRows]);

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

  const salesPurchaseTrend = useMemo(() => buildTimeSeries(
    fromDate,
    toDate,
    salesRows,
    ['sales', 'purchases'],
    (row) => ({ [row.type.includes('فروش') ? 'sales' : 'purchases']: row.amount * row.sign }),
  ), [fromDate, toDate, salesRows]);

  const balanceChartRows = balanceRows
    .filter((row) => Math.abs(row.closing) > 0.0001)
    .slice(0, 6)
    .map((row) => ({
      name: row.customer.name,
      debtor: row.closing > 0 ? row.closing : 0,
      creditor: row.closing < 0 ? row.closing : 0,
    }));

  const checksTrend = useMemo(() => buildTimeSeries(
    fromDate,
    toDate,
    checkRows.filter((row) => row.check.status === 'pending').map((row) => ({
      date: row.check.dueDate,
      direction: row.check.direction,
      amount: Number(row.check.amount || 0),
    })),
    ['received', 'issued'],
    (row) => ({ [row.direction]: row.amount }),
  ), [fromDate, toDate, checkRows]);

  const inventoryChartRows = inventoryRows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((row) => ({ name: row.product.name, value: row.value }));

  const ledgerChartRows = useMemo(() => {
    let balance = ledgerOpening;
    const byDate = new Map<string, number>();
    for (const entry of [...ledgerRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
      balance += Number(entry.debit || 0) - Number(entry.credit || 0);
      byDate.set(normalizedDate(entry.date), balance);
    }
    const rows = [...byDate.entries()].map(([date, closing]) => ({ label: formatPersianDate(date).slice(-5), balance: closing }));
    if (!rows.length) return [{ label: 'شروع بازه', balance: ledgerOpening }, { label: 'پایان بازه', balance: ledgerClosing }];
    return [{ label: 'شروع بازه', balance: ledgerOpening }, ...rows];
  }, [ledgerRows, ledgerOpening, ledgerClosing]);

  const cardexChartRows = useMemo(() => {
    if (!selectedCardexProduct) return [];
    const opening = stockMovements
      .filter((movement) => movement.productId === selectedCardexProduct.id && before(movement.date, fromDate))
      .sort((a, b) => movementSortKey(a).localeCompare(movementSortKey(b)))
      .at(-1);
    const startingStock = Number(opening?.balanceAfter || 0);
    const rows = cardexRows.map((movement) => ({
      label: formatPersianDate(movement.date).slice(-5),
      stock: Number(movement.balanceAfter || 0),
      minimum: Number(selectedCardexProduct.minStock || 0),
    }));
    if (!rows.length) {
      return [
        { label: 'شروع بازه', stock: startingStock, minimum: Number(selectedCardexProduct.minStock || 0) },
        { label: 'پایان بازه', stock: startingStock, minimum: Number(selectedCardexProduct.minStock || 0) },
      ];
    }
    return [{ label: 'شروع بازه', stock: startingStock, minimum: Number(selectedCardexProduct.minStock || 0) }, ...rows];
  }, [selectedCardexProduct, stockMovements, fromDate, cardexRows]);

  const activeExport = useMemo((): { title: string; filename: string; headers: ExportCell[]; rows: ExportCell[][] } => {
    if (tab === 'sales') return {
      title: 'گزارش فروش و خرید',
      filename: 'sales-purchases-report',
      headers: ['تاریخ', 'نوع سند', 'شماره سند', 'طرف حساب', 'کالا / خدمت', 'مبلغ'],
      rows: salesRows.map((row) => [formatPersianDate(row.date), row.type, row.number, row.customer, row.products, row.sign * row.amount]),
    };
    if (tab === 'product-sales') return {
      title: 'فروش به تفکیک کالا و دسته', filename: 'product-category-sales-report',
      headers: ['نوع گزارش', 'کالا / دسته', 'دسته کالا', 'تعداد خالص', 'فروش', 'مرجوعی', 'فروش خالص'],
      rows: [
        ...productSalesRows.map((row) => ['کالا', row.name, row.category, row.quantity, row.sales, row.returns, row.netSales]),
        ...categorySalesRows.map((row) => ['دسته', row.category, row.category, row.quantity, row.sales, row.returns, row.netSales]),
      ],
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
  }, [tab, salesRows, productSalesRows, categorySalesRows, balanceRows, checkRows, inventoryRows, ledgerRows, selectedLedgerCustomer, cardexRows, selectedCardexProduct]);

  const exportCsv = () => downloadCsv(activeExport.filename + '-' + fromDate + '-' + toDate, activeExport.headers, activeExport.rows);
  const exportExcel = () => downloadExcel(activeExport.filename + '-' + fromDate + '-' + toDate, activeExport.title, activeExport.headers, activeExport.rows);

  const tabs: Array<{ key: ReportTab; label: string; icon: typeof TrendingUp }> = [
    { key: 'sales', label: 'فروش / خرید', icon: TrendingUp },
    { key: 'product-sales', label: 'فروش کالا / دسته', icon: Package },
    { key: 'balances', label: 'بدهکار / بستانکار', icon: Users },
    { key: 'checks', label: 'چک‌ها', icon: CalendarClock },
    { key: 'inventory', label: 'موجودی', icon: Boxes },
    { key: 'ledger', label: 'دفتر طرف حساب', icon: BookOpen },
    { key: 'cardex', label: 'کاردکس کالا', icon: Archive },
  ];

  return <div className="space-y-5">
    <AppNavbarContent
      title="گزارش‌ها"
      subtitle="گزارش‌های عملیاتی با فیلتر تاریخ و خروجی CSV، Excel و چاپ/PDF"
      actions={<>
        <Button variant="outline" onClick={exportCsv}><FileDown className="h-4 w-4" /> CSV</Button>
        <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> چاپ / PDF</Button>
      </>}
    />

    <Card className="screen-only">
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr]">
        <label className="space-y-1.5 lg:col-span-2"><span className="block text-xs font-bold text-slate-600">بازه تاریخ</span><JalaliDateRangePicker value={{ from: fromDate, to: toDate }} onChange={(range) => { setFromDate(range.from); setToDate(range.to); }} /></label>
        {(tab === 'sales' || tab === 'product-sales' || tab === 'balances' || tab === 'checks') && <label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">طرف حساب</span><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">همه طرف حساب‌ها</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>}
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
        <SalesPurchaseTrendChart
          data={salesPurchaseTrend.map((point) => ({ ...point, sales: Number(point.sales || 0), purchases: Number(point.purchases || 0) }))}
          currency={settings.currency}
          series={documentKind === 'sale' ? ['sales'] : documentKind === 'purchase' ? ['purchases'] : ['sales', 'purchases']}
          description="فقط اسناد ثبت‌شده · مرجوعی قطعی از فروش یا خرید خالص کسر شده است"
        />
        <Card>
          <CardHeader><CardTitle>جزئیات فروش، خرید و مرجوعی</CardTitle></CardHeader>
          <div className="table-wrap"><DataTable className="data-table min-w-[920px]">
            <thead><tr><th>تاریخ</th><th>نوع</th><th>شماره</th><th>طرف حساب</th><th>کالا / خدمت</th><th>مبلغ</th></tr></thead>
            <tbody>{salesRows.map((row) => <tr key={row.key}><td>{formatPersianDate(row.date)}</td><td><Badge className={row.sign < 0 ? 'bg-rose-50 text-rose-700' : row.type === 'فروش' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}>{row.type}</Badge></td><td className="font-bold">{onOpenInvoice ? <button type="button" className="text-sky-700 underline-offset-4 hover:underline" onClick={() => onOpenInvoice(row.sourceInvoiceId, row.sourceInvoiceKind)} aria-label={'نمایش فاکتور مرجع ' + row.number}>{row.number}</button> : row.number}</td><td>{row.customer}</td><td>{row.products || '—'}</td><td className={row.sign < 0 ? 'font-black text-rose-700' : 'font-black'}>{row.sign < 0 ? '− ' : ''}{money(row.amount)} {settings.currency}</td></tr>)}{!salesRows.length && <EmptyRow cols={6} text="سندی در این بازه و فیلتر وجود ندارد." />}</tbody>
          </DataTable></div>
        </Card>
      </>}

      {tab === 'product-sales' && <>
        <div className="grid gap-4 sm:grid-cols-3"><MetricCard title="فروش خالص کالاها" value={money(productSalesRows.reduce((sum, row) => sum + row.netSales, 0)) + ' ' + settings.currency} /><MetricCard title="تعداد کالای/خدمت فروخته‌شده" value={money(productSalesRows.reduce((sum, row) => sum + row.quantity, 0))} /><MetricCard title="دسته‌های دارای فروش" value={String(categorySalesRows.length)} /></div>
        <Card><CardHeader><CardTitle>فروش و مرجوعی به تفکیک کالا</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table"><thead><tr><th>کالا / خدمت</th><th>دسته</th><th>تعداد خالص</th><th>فروش ناخالص</th><th>مرجوعی</th><th>فروش خالص</th></tr></thead><tbody>{productSalesRows.map((row) => <tr key={row.name + row.category}><td className="font-bold">{row.name}</td><td>{row.category}</td><td>{money(row.quantity)}</td><td>{money(row.sales)}</td><td className="text-rose-600">{money(row.returns)}</td><td className="font-black">{money(row.netSales)} {settings.currency}</td></tr>)}{!productSalesRows.length && <EmptyRow cols={6} text="فروشی در بازه انتخاب‌شده ثبت نشده است." />}</tbody></DataTable></div></Card>
        <Card><CardHeader><CardTitle>جمع فروش به تفکیک دسته</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table"><thead><tr><th>دسته</th><th>تعداد خالص</th><th>فروش</th><th>مرجوعی</th><th>فروش خالص</th></tr></thead><tbody>{categorySalesRows.map((row) => <tr key={row.category}><td className="font-bold">{row.category}</td><td>{money(row.quantity)}</td><td>{money(row.sales)}</td><td className="text-rose-600">{money(row.returns)}</td><td className="font-black">{money(row.netSales)} {settings.currency}</td></tr>)}{!categorySalesRows.length && <EmptyRow cols={5} text="دسته فروشی ثبت نشده است." />}</tbody></DataTable></div></Card>
      </>}

      {tab === 'balances' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="جمع بدهکاران پایان بازه" value={money(debtors) + ' ' + settings.currency} />
          <MetricCard title="جمع بستانکاران پایان بازه" value={money(creditors) + ' ' + settings.currency} />
          <MetricCard title="تعداد طرف حساب دارای گردش/مانده" value={String(balanceRows.length)} />
        </div>
        <BalancesChart data={balanceChartRows} currency={settings.currency} />
        <Card><CardHeader><CardTitle>بدهکاران و بستانکاران</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table min-w-[900px]">
          <thead><tr><th>کد</th><th>طرف حساب</th><th>مانده ابتدای بازه</th><th>بدهکار بازه</th><th>بستانکار بازه</th><th>مانده پایان بازه</th><th>وضعیت</th><th>عملیات</th></tr></thead>
          <tbody>{balanceRows.map((row) => <tr key={row.customer.id}><td>{row.customer.code}</td><td className="font-bold">{row.customer.name}</td><td>{money(Math.abs(row.opening))}{row.opening > 0 ? ' بدهکار' : row.opening < 0 ? ' بستانکار' : ''}</td><td className="text-rose-700">{money(row.debit)}</td><td className="text-emerald-700">{money(row.credit)}</td><td className="font-black">{money(Math.abs(row.closing))}</td><td>{row.closing > 0 ? <Badge className="bg-rose-50 text-rose-700">بدهکار</Badge> : row.closing < 0 ? <Badge className="bg-emerald-50 text-emerald-700">بستانکار</Badge> : <Badge>تسویه</Badge>}</td><td>{onOpenCustomer && <Button variant="ghost" size="sm" onClick={() => onOpenCustomer(row.customer.id)}><BookOpen className="h-3.5 w-3.5" /> دفتر حساب</Button>}</td></tr>)}{!balanceRows.length && <EmptyRow cols={8} text="گردش یا مانده‌ای در این بازه وجود ندارد." />}</tbody>
        </DataTable></div></Card>
      </>}

      {tab === 'checks' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="چک‌های سررسید گذشته" value={money(overdueChecks) + ' ' + settings.currency} />
          <MetricCard title="چک‌های آینده" value={money(futureChecks) + ' ' + settings.currency} />
          <MetricCard title="تعداد چک در بازه" value={String(checkRows.length)} />
        </div>
        <DueChecksChart
          data={checksTrend.map((point) => ({ ...point, received: Number(point.received || 0), issued: Number(point.issued || 0) }))}
          currency={settings.currency}
        />
        <Card><CardHeader><CardTitle>چک‌ها بر اساس سررسید</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table min-w-[960px]">
          <thead><tr><th>سند</th><th>شماره چک</th><th>طرف حساب</th><th>نوع</th><th>بانک</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead>
          <tbody>{checkRows.map(({ check, customerName, timing }) => <tr key={check.id}><td className="font-bold">{check.documentNumber}</td><td>{check.number}</td><td>{customerName}</td><td>{check.direction === 'received' ? 'دریافتی' : 'پرداختی'}</td><td>{check.bank || '—'}</td><td>{formatPersianDate(check.dueDate)}</td><td className="font-black">{money(check.amount)} {settings.currency}</td><td><Badge className={timing === 'سررسید گذشته' ? 'bg-rose-50 text-rose-700' : timing === 'آینده' ? 'bg-amber-50 text-amber-700' : timing === 'برگشتی' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}>{timing}</Badge></td><td>{onOpenCheck && <Button variant="ghost" size="sm" onClick={() => onOpenCheck(check.id)}><FileText className="h-3.5 w-3.5" /> جزئیات</Button>}</td></tr>)}{!checkRows.length && <EmptyRow cols={9} text="چکی در این بازه وجود ندارد." />}</tbody>
        </DataTable></div></Card>
      </>}

      {tab === 'inventory' && <>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="ارزش موجودی پایان بازه" value={money(inventoryValue) + ' ' + settings.currency} />
          <MetricCard title="کالاهای زیر حداقل" value={String(belowMinimumCount)} />
          <MetricCard title="تعداد کالا" value={String(inventoryRows.length)} />
        </div>
        <InventoryValueChart data={inventoryChartRows} currency={settings.currency} />
        <Card><CardHeader><CardTitle>موجودی و گردش کالا</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table min-w-[980px]">
          <thead><tr><th>کد</th><th>کالا</th><th>ورود</th><th>خروج</th><th>موجودی پایان بازه</th><th>میانگین هزینه</th><th>ارزش</th><th>حداقل</th><th>وضعیت</th></tr></thead>
          <tbody>{inventoryRows.map((row) => <tr key={row.product.id}><td>{row.product.code}</td><td className="font-bold">{row.product.name}</td><td className="text-emerald-700">{money(row.incoming)} {row.product.unit}</td><td className="text-rose-700">{money(row.outgoing)} {row.product.unit}</td><td className="font-black">{money(row.stock)} {row.product.unit}</td><td>{money(row.averageCost)} {settings.currency}</td><td>{money(row.value)} {settings.currency}</td><td>{money(row.product.minStock)}</td><td>{row.belowMin ? <Badge className="bg-rose-50 text-rose-700">زیر حداقل</Badge> : <Badge className="bg-emerald-50 text-emerald-700">مناسب</Badge>}</td></tr>)}{!inventoryRows.length && <EmptyRow cols={9} text="کالایی مطابق فیلتر وجود ندارد." />}</tbody>
        </DataTable></div></Card>
      </>}

      {tab === 'ledger' && <>
        <Card className="screen-only"><CardContent><label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">طرف حساب دفتر</span><select className="h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedLedgerCustomerId} onChange={(event) => setSelectedLedgerCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label></CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard title="مانده ابتدای بازه" value={money(Math.abs(ledgerOpening)) + (ledgerOpening > 0 ? ' بدهکار' : ledgerOpening < 0 ? ' بستانکار' : '')} />
          <MetricCard title="بدهکار بازه" value={money(ledgerDebit) + ' ' + settings.currency} />
          <MetricCard title="بستانکار بازه" value={money(ledgerCredit) + ' ' + settings.currency} />
          <MetricCard title="مانده پایان بازه" value={money(Math.abs(ledgerClosing)) + (ledgerClosing > 0 ? ' بدهکار' : ledgerClosing < 0 ? ' بستانکار' : '')} />
        </div>
        <LedgerBalanceChart data={ledgerChartRows} currency={settings.currency} />
        <Card><CardHeader><CardTitle>دفتر {selectedLedgerCustomer?.name || 'طرف حساب'}</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table min-w-[840px]">
          <thead><tr><th>تاریخ</th><th>شرح</th><th>مرجع</th><th>بدهکار</th><th>بستانکار</th></tr></thead>
          <tbody>{ledgerRows.map((entry) => <tr key={entry.id}><td>{formatPersianDate(entry.date)}</td><td className="font-bold">{entry.title}</td><td>{entry.reference || '—'}</td><td className="text-rose-700">{entry.debit ? money(entry.debit) : '—'}</td><td className="text-emerald-700">{entry.credit ? money(entry.credit) : '—'}</td></tr>)}{!ledgerRows.length && <EmptyRow cols={5} text="گردشی در این بازه وجود ندارد." />}</tbody>
        </DataTable></div></Card>
      </>}

      {tab === 'cardex' && <>
        <Card className="screen-only"><CardContent><label className="space-y-1.5"><span className="block text-xs font-bold text-slate-600">کالای کاردکس</span><select className="h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedCardexProductId} onChange={(event) => setSelectedCardexProductId(event.target.value)}>{products.filter((product) => product.kind === 'product').map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label></CardContent></Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard title="ورود بازه" value={money(cardexIncoming) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="خروج بازه" value={money(cardexOutgoing) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="موجودی پایان بازه" value={money(cardexAsOf.stock) + ' ' + (selectedCardexProduct?.unit || '')} />
          <MetricCard title="میانگین هزینه پایان بازه" value={money(cardexAsOf.averageCost) + ' ' + settings.currency} />
        </div>
        <CardexStockChart data={cardexChartRows} unit={selectedCardexProduct?.unit || ''} />
        <Card><CardHeader><CardTitle>کاردکس {selectedCardexProduct?.name || 'کالا'}</CardTitle></CardHeader><div className="table-wrap"><DataTable className="data-table min-w-[940px]">
          <thead><tr><th>تاریخ</th><th>نوع حرکت</th><th>مرجع</th><th>ورود</th><th>خروج</th><th>مانده</th><th>میانگین بعد حرکت</th><th>بهای واحد</th></tr></thead>
          <tbody>{cardexRows.map((movement) => <tr key={movement.id}><td>{formatPersianDate(movement.date)}</td><td className="font-bold">{movementLabel(movement)}</td><td>{movement.sourceReference || '—'}</td><td className="text-emerald-700">{movement.quantity > 0 ? money(movement.quantity) : '—'}</td><td className="text-rose-700">{movement.quantity < 0 ? money(Math.abs(movement.quantity)) : '—'}</td><td className="font-black">{money(movement.balanceAfter)} {selectedCardexProduct?.unit}</td><td>{money(movement.averageCostAfter)} {settings.currency}</td><td>{money(movement.unitCost)} {settings.currency}</td></tr>)}{!cardexRows.length && <EmptyRow cols={8} text="حرکتی در این بازه وجود ندارد." />}</tbody>
        </DataTable></div></Card>
      </>}
    </div>
  </div>;
}
