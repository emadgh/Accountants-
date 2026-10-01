'use client';

import { useMemo } from 'react';
import { DataTable } from '@/components/ui/data-table';

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, CircleDollarSign, Clock3, FileText, Users } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import { invoiceTotal, money, settledForInvoice } from '@/lib/utils';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { getReceivableDueBuckets } from '@/lib/receivables';
import { FadeContent } from '@/components/reactbits/fade-content';
import { Badge } from '@/components/ui/badge';
import { MetricCard, type MetricTone } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { AppNavbarContent } from '@/components/app-navbar';
import { SalesPurchaseTrendChart } from '@/components/analytics/charts';
import { buildTimeSeries, lastJalaliMonthsRange } from '@/lib/chart-data';
import { useAccountingNavigation } from '@/components/accounting-app';

export function DashboardView() {
  const { invoices, returns, payments, customers, products, checks, settings, projects } = useAccountingStore();
  const navigation = useAccountingNavigation();
  const saleInvoices = useMemo(() => invoices.filter((i) => i.kind === 'sale' && i.status !== 'draft' && i.status !== 'void'), [invoices]);
  const purchaseInvoices = useMemo(() => invoices.filter((i) => i.kind === 'purchase' && i.status !== 'draft' && i.status !== 'void'), [invoices]);
  const finalizedReturns = useMemo(() => returns.filter((document) => document.status === 'final'), [returns]);
  const saleReturns = finalizedReturns.filter((document) => document.kind === 'sale-return').reduce((sum, document) => sum + document.totalAmount, 0);
  const purchaseReturns = finalizedReturns.filter((document) => document.kind === 'purchase-return').reduce((sum, document) => sum + document.totalAmount, 0);
  const totalSales = Math.max(0, saleInvoices.reduce((s, i) => s + invoiceTotal(i), 0) - saleReturns);
  const totalPurchases = Math.max(0, purchaseInvoices.reduce((s, i) => s + invoiceTotal(i), 0) - purchaseReturns);
  const receivable = saleInvoices.reduce((sum, invoice) => {
    const returned = returns.filter((document) => document.status === 'final' && document.originalInvoiceId === invoice.id).reduce((value, document) => value + document.totalAmount, 0);
    const netTotal = Math.max(0, invoiceTotal(invoice) - returned);
    return sum + Math.max(0, netTotal - settledForInvoice(invoice, payments, checks));
  }, 0);
  const inventoryValue = products.filter((p) => p.kind === 'product' && !p.archived).reduce((s, p) => s + p.stock * Number(p.averageCost ?? p.buyPrice ?? 0), 0);
  const pendingChecks = checks.filter((c) => c.status === 'pending');
  const lowStock = products.filter((p) => p.kind === 'product' && !p.archived && p.stock <= p.minStock);
  const throughDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const { overdue: overdueInvoices, upcoming: upcomingInvoices } = getReceivableDueBuckets(invoices, payments, checks, returns, todayIso(), throughDate);
  const approvalProjects = projects.filter((project) => project.status === 'awaiting-approval');
  const salesPurchaseTrend = useMemo(() => {
    const range = lastJalaliMonthsRange(todayIso(), 12);
    const events = [
      ...saleInvoices.map((invoice) => ({ date: invoice.date, series: 'sales' as const, amount: invoiceTotal(invoice) })),
      ...purchaseInvoices.map((invoice) => ({ date: invoice.date, series: 'purchases' as const, amount: invoiceTotal(invoice) })),
      ...finalizedReturns.map((document) => ({
        date: document.date,
        series: document.kind === 'sale-return' ? 'sales' as const : 'purchases' as const,
        amount: -Number(document.totalAmount || 0),
      })),
    ];
    return buildTimeSeries(range.fromDate, range.toDate, events, ['sales', 'purchases'], (event) => ({ [event.series]: event.amount }));
  }, [saleInvoices, purchaseInvoices, finalizedReturns]);

  const cards: Array<{
    label: string;
    value: number;
    icon: typeof ArrowUpRight;
    hint: string;
    tone: MetricTone;
  }> = [
    { label: 'فروش خالص', value: totalSales, icon: ArrowUpRight, hint: `${saleInvoices.length} فاکتور`, tone: 'success' },
    { label: 'مانده دریافتنی', value: receivable, icon: CircleDollarSign, hint: 'بر اساس دریافت‌های موثر', tone: 'info' },
    { label: 'خرید خالص', value: totalPurchases, icon: ArrowDownLeft, hint: `${purchaseInvoices.length} فاکتور`, tone: 'purple' },
    { label: 'ارزش موجودی', value: inventoryValue, icon: Boxes, hint: `${products.filter((p) => p.kind === 'product' && !p.archived).length} قلم کالا`, tone: 'warning' },
  ];

  return <div className="space-y-5">
    <AppNavbarContent title="داشبورد" subtitle="نمای کلی فروش، خرید، انبار و سررسیدها" actions={<Badge className="bg-sky-50 text-sky-700">واحد پول: {settings.currency}</Badge>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => (
        <FadeContent key={card.label} delay={index * 70}>
          <MetricCard
            className="h-full"
            title={card.label}
            value={card.value}
            unit={settings.currency}
            icon={card.icon}
            meta={card.hint}
            tone={card.tone}
          />
        </FadeContent>
      ))}
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <div className="space-y-5">
        <SalesPurchaseTrendChart
          data={salesPurchaseTrend.map((point) => ({ ...point, sales: Number(point.sales || 0), purchases: Number(point.purchases || 0) }))}
          currency={settings.currency}
          description="۱۲ ماه اخیر شمسی · مرجوعی‌های قطعی از مبلغ خالص کسر شده‌اند"
        />
        <Panel padding="none" spotlight interactive>
        <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 font-black"><FileText className="h-5 w-5 text-sky-600" /> آخرین فاکتورها</div></div>
        <div className="overflow-x-auto"><DataTable className="data-table min-w-[620px]"><thead><tr><th>شماره</th><th>طرف حساب</th><th>نوع</th><th>وضعیت</th><th>مبلغ کل</th></tr></thead><tbody>
          {invoices.slice(0, 7).map((invoice) => <tr key={invoice.id}><td className="font-bold">{invoice.number}</td><td>{invoice.customerName}</td><td>{invoice.kind === 'sale' ? 'فروش' : 'خرید'}</td><td><Status status={invoice.status} /></td><td className="font-bold">{money(invoiceTotal(invoice))}</td></tr>)}
          {!invoices.length && <tr><td colSpan={5} className="py-12 text-center text-slate-400">فاکتوری ثبت نشده است.</td></tr>}
        </tbody></DataTable></div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel padding="none" spotlight interactive><div className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black"><Clock3 className="h-5 w-5 text-amber-600" /> چک‌های در انتظار</div><Badge>{pendingChecks.length}</Badge></div>
          <div className="space-y-3">{pendingChecks.slice(0, 4).map((check) => <div key={check.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{check.owner || 'بدون نام'}</span><span className="text-sm font-black text-slate-900">{money(check.amount)}</span></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>{check.bank} · {check.number}</span><span>سررسید {formatPersianDate(check.dueDate)}</span></div></div>)}{!pendingChecks.length && <div className="py-8 text-center text-sm text-slate-400">چک در انتظار ندارید.</div>}</div>
        </div></Panel>
        <Panel padding="none" spotlight interactive><div className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black"><AlertTriangle className="h-5 w-5 text-rose-600" /> هشدار موجودی</div><Badge className={lowStock.length ? 'bg-rose-50 text-rose-700' : ''}>{lowStock.length}</Badge></div>
          <div className="space-y-2">{lowStock.slice(0, 5).map((p) => <button key={p.id} onClick={() => navigation.navigate('inventory')} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-right text-sm hover:bg-rose-50"><span>{p.name}</span><span className="font-black text-rose-600">{money(p.stock)} {p.unit}</span></button>)}{!lowStock.length && <div className="py-5 text-center text-sm text-slate-400">موجودی‌ها در محدوده مناسب هستند.</div>}</div>
        </div></Panel>
        <Panel padding="none" spotlight interactive><div className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black"><CircleDollarSign className="h-5 w-5 text-sky-600" /> مطالبات و پیگیری</div><Badge>{overdueInvoices.length + upcomingInvoices.length + approvalProjects.length}</Badge></div>
          <div className="space-y-2">{overdueInvoices.slice(0, 3).map((item) => <button key={item.id} onClick={() => navigation.viewInvoice(item.invoiceId, 'sale')} className="flex w-full items-center justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2 text-right text-xs"><span className="truncate font-bold">{item.customerName} · {item.invoiceNumber}{item.downPayment ? ' · پیش‌پرداخت' : item.installmentNumber ? ` · قسط ${item.installmentNumber}` : ''} · {money(item.amount)}</span><span className="shrink-0 text-rose-700">سررسید گذشته</span></button>)}{upcomingInvoices.slice(0, 3).map((item) => <button key={item.id} onClick={() => navigation.viewInvoice(item.invoiceId, 'sale')} className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-right text-xs"><span className="truncate font-bold">{item.customerName} · {item.invoiceNumber}{item.downPayment ? ' · پیش‌پرداخت' : item.installmentNumber ? ` · قسط ${item.installmentNumber}` : ''} · {money(item.amount)}</span><span className="shrink-0">نزدیک سررسید</span></button>)}{approvalProjects.slice(0, 3).map((project) => <button key={project.id} onClick={() => navigation.navigate('projects')} className="w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-right text-xs font-bold">پروژه منتظر تأیید: {project.title}</button>)}{!overdueInvoices.length && !upcomingInvoices.length && !approvalProjects.length && <div className="py-5 text-center text-sm text-slate-400">موردی برای پیگیری ندارید.</div>}</div>
          <div className="mt-3 text-[11px] text-slate-400">{overdueInvoices.length} سررسید گذشته · {upcomingInvoices.length} تا ۷ روز آینده · {approvalProjects.length} پروژه منتظر تأیید</div>
        </div></Panel>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard size="sm" icon={Users} title="طرف حساب‌ها" value={customers.length} />
      <MetricCard size="sm" icon={Boxes} title="کالا و خدمات" value={products.length} />
      <MetricCard size="sm" icon={CircleDollarSign} title="تراکنش‌های ثبت‌شده" value={payments.length} />
    </div>
  </div>;
}

function Status({ status }: { status: string }) {
  const map: Record<string, string> = { draft: 'پیش‌نویس', final: 'قطعی', partial: 'بخشی تسویه', settled: 'تسویه‌شده', void: 'باطل' };
  const cls: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', final: 'bg-sky-50 text-sky-700', partial: 'bg-amber-50 text-amber-700', settled: 'bg-emerald-50 text-emerald-700', void: 'bg-rose-50 text-rose-700' };
  return <Badge className={cls[status]}>{map[status] || status}</Badge>;
}
