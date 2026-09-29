'use client';

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, CircleDollarSign, Clock3, FileText, Users } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import { invoiceTotal, money, settledForInvoice } from '@/lib/utils';
import { FadeContent } from '@/components/reactbits/fade-content';
import { SpotlightCard } from '@/components/reactbits/spotlight-card';
import { Badge } from '@/components/ui/badge';

export function DashboardView() {
  const { invoices, payments, customers, products, checks, settings } = useAccountingStore();
  const saleInvoices = invoices.filter((i) => i.kind === 'sale' && i.status !== 'draft' && i.status !== 'void');
  const purchaseInvoices = invoices.filter((i) => i.kind === 'purchase' && i.status !== 'draft' && i.status !== 'void');
  const totalSales = saleInvoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPurchases = purchaseInvoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const receivable = saleInvoices.reduce((s, i) => s + Math.max(0, invoiceTotal(i) - settledForInvoice(i, payments, checks)), 0);
  const inventoryValue = products.filter((p) => p.kind === 'product').reduce((s, p) => s + p.stock * p.buyPrice, 0);
  const pendingChecks = checks.filter((c) => c.status === 'pending');
  const lowStock = products.filter((p) => p.kind === 'product' && p.stock <= p.minStock);

  const cards = [
    { label: 'فروش قطعی', value: totalSales, icon: ArrowUpRight, hint: `${saleInvoices.length} فاکتور`, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'مانده دریافتنی', value: receivable, icon: CircleDollarSign, hint: 'بر اساس دریافت‌های موثر', tone: 'text-sky-600 bg-sky-50' },
    { label: 'خرید قطعی', value: totalPurchases, icon: ArrowDownLeft, hint: `${purchaseInvoices.length} فاکتور`, tone: 'text-violet-600 bg-violet-50' },
    { label: 'ارزش موجودی', value: inventoryValue, icon: Boxes, hint: `${products.filter((p) => p.kind === 'product').length} قلم کالا`, tone: 'text-amber-600 bg-amber-50' },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black text-slate-950">داشبورد</h1><p className="mt-1 text-sm text-slate-500">نمای کلی فروش، خرید، انبار و سررسیدها</p></div>
      <Badge className="bg-sky-50 text-sky-700">واحد پول: {settings.currency}</Badge>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => <FadeContent key={card.label} delay={index * 70}><SpotlightCard className="h-full"><div className="p-5">
        <div className="mb-4 flex items-center justify-between"><div className={`grid h-10 w-10 place-items-center rounded-xl ${card.tone}`}><card.icon className="h-5 w-5" /></div><span className="text-xs text-slate-400">{card.hint}</span></div>
        <div className="text-sm font-bold text-slate-500">{card.label}</div>
        <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{money(card.value)} <span className="text-xs font-bold text-slate-400">{settings.currency}</span></div>
      </div></SpotlightCard></FadeContent>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <SpotlightCard>
        <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 font-black"><FileText className="h-5 w-5 text-sky-600" /> آخرین فاکتورها</div></div>
        <div className="overflow-x-auto"><table className="data-table min-w-[620px]"><thead><tr><th>شماره</th><th>طرف حساب</th><th>نوع</th><th>وضعیت</th><th>مبلغ کل</th></tr></thead><tbody>
          {invoices.slice(0, 7).map((invoice) => <tr key={invoice.id}><td className="font-bold">{invoice.number}</td><td>{invoice.customerName}</td><td>{invoice.kind === 'sale' ? 'فروش' : 'خرید'}</td><td><Status status={invoice.status} /></td><td className="font-bold">{money(invoiceTotal(invoice))}</td></tr>)}
          {!invoices.length && <tr><td colSpan={5} className="py-12 text-center text-slate-400">فاکتوری ثبت نشده است.</td></tr>}
        </tbody></table></div>
      </SpotlightCard>

      <div className="space-y-5">
        <SpotlightCard><div className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black"><Clock3 className="h-5 w-5 text-amber-600" /> چک‌های در انتظار</div><Badge>{pendingChecks.length}</Badge></div>
          <div className="space-y-3">{pendingChecks.slice(0, 4).map((check) => <div key={check.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{check.owner || 'بدون نام'}</span><span className="text-sm font-black text-slate-900">{money(check.amount)}</span></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>{check.bank} · {check.number}</span><span>سررسید {check.dueDate}</span></div></div>)}{!pendingChecks.length && <div className="py-8 text-center text-sm text-slate-400">چک در انتظار ندارید.</div>}</div>
        </div></SpotlightCard>
        <SpotlightCard><div className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black"><AlertTriangle className="h-5 w-5 text-rose-600" /> هشدار موجودی</div><Badge className={lowStock.length ? 'bg-rose-50 text-rose-700' : ''}>{lowStock.length}</Badge></div>
          <div className="space-y-2">{lowStock.slice(0, 5).map((p) => <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"><span>{p.name}</span><span className="font-black text-rose-600">{money(p.stock)} {p.unit}</span></div>)}{!lowStock.length && <div className="py-5 text-center text-sm text-slate-400">موجودی‌ها در محدوده مناسب هستند.</div>}</div>
        </div></SpotlightCard>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <Mini icon={Users} label="طرف حساب‌ها" value={customers.length} />
      <Mini icon={Boxes} label="کالا و خدمات" value={products.length} />
      <Mini icon={CircleDollarSign} label="تراکنش‌های ثبت‌شده" value={payments.length} />
    </div>
  </div>;
}

function Mini({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></div><div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div></div>;
}

function Status({ status }: { status: string }) {
  const map: Record<string, string> = { draft: 'پیش‌نویس', final: 'قطعی', partial: 'بخشی تسویه', settled: 'تسویه‌شده', void: 'باطل' };
  const cls: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', final: 'bg-sky-50 text-sky-700', partial: 'bg-amber-50 text-amber-700', settled: 'bg-emerald-50 text-emerald-700', void: 'bg-rose-50 text-rose-700' };
  return <Badge className={cls[status]}>{map[status] || status}</Badge>;
}
