'use client';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/ui/data-table';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, DatabaseZap, Download, FileSearch, ShieldCheck, Upload } from 'lucide-react';
import { useAccountingStore } from '@/lib/store';
import type { AccountingData } from '@/lib/types';
import { analyzeYasDatabase, type YasMigrationAnalysis } from '@/lib/yas-importer';
import { getLastYasImportHistory, importAccountingData, recordYasImportHistory } from '@/lib/storage';
import { confirmDialog, notify } from '@/lib/feedback';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Panel } from '@/components/ui/panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function YasImporterPanel() {
  const store = useAccountingStore(useShallow((state) => ({ accounts: state.accounts, adjustments: state.adjustments, attachments: state.attachments, checks: state.checks, customers: state.customers, invoices: state.invoices, journalEntries: state.journalEntries, moneyTransactions: state.moneyTransactions, payments: state.payments, products: state.products, projects: state.projects, quotes: state.quotes, repairPaymentInvoiceLinks: state.repairPaymentInvoiceLinks, replaceAll: state.replaceAll, returns: state.returns, settings: state.settings, stockMovements: state.stockMovements })));
  const fileRef = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<YasMigrationAnalysis | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [alreadyImported, setAlreadyImported] = useState(false);

  const repairLinks = useMemo(() => {
    if (!analysis) return [];
    const sourceCustomers = new Map(analysis.data.customers.map((customer) => [customer.id, customer.code]));
    const currentCustomers = new Map(store.customers.map((customer) => [customer.id, customer.code]));
    const sourceInvoices = new Map(analysis.data.invoices.map((invoice) => [invoice.id, invoice]));
    const currentInvoices = new Map(store.invoices.map((invoice) => [invoice.kind + ':' + invoice.number + ':' + currentCustomers.get(invoice.customerId), invoice]));
    const sourcePayments = new Map(analysis.data.payments.filter((payment) => payment.invoiceId).map((payment) => [payment.documentNumber, payment]));
    return store.payments.flatMap((payment) => {
      if (payment.invoiceId) return [];
      const sourcePayment = sourcePayments.get(payment.documentNumber);
      if (!sourcePayment?.invoiceId || sourcePayment.direction !== payment.direction || Math.abs(sourcePayment.amount - payment.amount) > 0.01) return [];
      const sourceCustomerCode = sourceCustomers.get(sourcePayment.customerId);
      if (!sourceCustomerCode || sourceCustomerCode !== currentCustomers.get(payment.customerId)) return [];
      const sourceInvoice = sourceInvoices.get(sourcePayment.invoiceId);
      if (!sourceInvoice) return [];
      const currentInvoice = currentInvoices.get(sourceInvoice.kind + ':' + sourceInvoice.number + ':' + sourceCustomerCode);
      return currentInvoice && currentInvoice.status !== 'draft' && currentInvoice.status !== 'void'
        ? [{ paymentId: payment.id, invoiceId: currentInvoice.id }]
        : [];
    });
  }, [analysis, store.customers, store.invoices, store.payments]);

  const currentData = (): AccountingData => ({
    customers: store.customers,
    products: store.products,
    invoices: store.invoices,
    returns: store.returns,
    payments: store.payments,
    checks: store.checks,
    adjustments: store.adjustments,
    stockMovements: store.stockMovements,
    accounts: store.accounts,
    journalEntries: store.journalEntries,
    moneyTransactions: store.moneyTransactions,
    quotes: store.quotes,
    projects: store.projects,
    attachments: store.attachments,
    settings: store.settings,
  });

  const analyze = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setAnalysis(null);
    setFilename(file.name);
    try {
      const bytes = await file.arrayBuffer();
      const result = await analyzeYasDatabase(bytes, currentData());
      const history = await getLastYasImportHistory();
      setAlreadyImported(history?.fingerprint === result.report.fingerprint);
      setAnalysis(result);
      notify('Analyze فایل Yas کامل شد؛ هنوز هیچ داده‌ای نوشته نشده است.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Analyze دیتابیس Yas انجام نشد.', 'error');
      setFilename('');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadReport = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis.report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'yas-migration-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importData = async () => {
    if (!analysis) return;
    const blocking = analysis.report.messages.filter(
      (message) => message.severity === 'conflict' && message.code !== 'known-anomaly-300051'
    );
    if (blocking.length) {
      notify('تا رفع Conflictهای ساختاری Import نهایی مجاز نیست.', 'error');
      return;
    }

    if (alreadyImported) {
      const reimport = await confirmDialog(
        'Fingerprint این فایل با آخرین Import یکسان است. وارد کردن دوباره، داده فعلی را با همین Migration جایگزین می‌کند. ادامه می‌دهید؟',
        { title: 'فایل قبلاً Import شده', confirmLabel: 'Import دوباره', danger: true }
      );
      if (!reimport) return;
    }

    const existingCount = store.customers.length + store.products.length + store.invoices.length + store.payments.length;
    if (existingCount > 0) {
      const replace = await confirmDialog(
        'Import Yas عملیات Merge نیست. کل داده حسابداری فعلی با نتیجه Migration جایگزین می‌شود و قبل از آن Snapshot ساخته می‌شود. ادامه می‌دهید؟',
        { title: 'جایگزینی دیتابیس فعلی', confirmLabel: 'Snapshot و جایگزینی', danger: true }
      );
      if (!replace) return;
    }

    setBusy(true);
    try {
      await importAccountingData(analysis.data);
      await recordYasImportHistory(analysis.report.fingerprint, analysis.report);
      store.replaceAll(analysis.data);
      setAlreadyImported(true);
      notify('Migration Yas ثبت شد. گزارش نهایی و Fingerprint داخل SQLite ذخیره شدند.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Import نهایی Yas انجام نشد.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const repairCurrentLinks = () => {
    if (!repairLinks.length) return;
    const result = store.repairPaymentInvoiceLinks(repairLinks);
    if (!result.ok) {
      notify(result.message || 'ترمیم ارتباط دریافت‌ها انجام نشد.', 'error');
      return;
    }
    notify((result.updated || 0) + ' ارتباط دریافت و فاکتور در دادهٔ فعلی ترمیم شد.', 'success');
  };

  const report = analysis?.report;
  const blockingConflicts = report?.messages.filter(
    (message) => message.severity === 'conflict' && message.code !== 'known-anomaly-300051'
  ).length || 0;

  return <Card>
    <CardHeader className="flex-wrap gap-3">
      <div>
        <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5 text-violet-600" /> مهاجرت از حسابداری Yas</CardTitle>
        <div className="mt-1 text-xs text-slate-500">فایل SQLite ابتدا فقط Analyze می‌شود. Import نهایی Merge نمی‌کند و قبل از Replace از دیتای فعلی Snapshot می‌گیرد.</div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><FileSearch className="h-4 w-4" /> انتخاب و Analyze فایل .db</Button>
        <input ref={fileRef} type="file" className="hidden" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={(event) => void analyze(event.target.files?.[0])} />
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {!analysis && <Panel padding="md" className="border-dashed text-center text-sm text-slate-500">
        <Upload className="mx-auto mb-2 h-7 w-7 text-slate-400" />
        Dry Run هیچ تغییری در SQLite برنامه ایجاد نمی‌کند.
      </Panel>}

      {analysis && report && <>
        <Panel padding="sm" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-black">{filename}</div>
            <div className="mt-1 text-xs text-slate-500">SQLite quick_check: {report.source.quickCheck} · Fingerprint: <span className="font-mono">{report.fingerprint.slice(0, 16)}…</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {alreadyImported && <Badge className="bg-amber-50 text-amber-700">قبلاً Import شده</Badge>}
            {report.source.walHeader && <Badge className="bg-amber-50 text-amber-700">WAL header</Badge>}
            <Badge className={blockingConflicts ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}>{blockingConflicts ? blockingConflicts + ' Conflict مسدودکننده' : 'قابل Import'}</Badge>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <MetricCard size="sm" title="طرف‌حساب" value={report.counts.customers} align="center" />
          <MetricCard size="sm" title="آرشیو" value={report.counts.archivedCustomers} align="center" />
          <MetricCard size="sm" title="کالا/خدمت" value={report.counts.products} align="center" />
          <MetricCard size="sm" title="فروش" value={report.counts.saleInvoices} align="center" />
          <MetricCard size="sm" title="خرید" value={report.counts.purchaseInvoices} align="center" />
          <MetricCard size="sm" title="ردیف فاکتور" value={report.counts.invoiceItems} align="center" />
          <MetricCard size="sm" title="دریافت" value={report.counts.receipts} align="center" />
          <MetricCard size="sm" title="پرداخت" value={report.counts.payments} align="center" />
        </div>

        <Panel padding="sm" className="text-sm">
          <div className="font-black">ارتباط دریافت‌ها با فاکتورها</div>
          <div className="mt-1 text-slate-600">{report.paymentLinks.explicit} مورد با شمارهٔ فاکتور ثبت‌شده، {report.paymentLinks.ledger} مورد با تسویهٔ یک‌به‌یک در دفتر مشتری، و {report.paymentLinks.unresolved} مورد بدون ارتباط قطعی.</div>
          {!!repairLinks.length && <div className="mt-2 text-slate-600">{repairLinks.length} ارتباط را می‌توان در دادهٔ فعلی ترمیم کرد؛ سایر داده‌ها جایگزین نمی‌شوند.</div>}
        </Panel>

        <Panel padding="sm">
          <div className="mb-2 text-sm font-black">Mapping شناسایی‌شده</div>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div>طرف‌حساب: <b>{report.mapping.customers || '—'}</b></div>
            <div>کالا: <b>{report.mapping.products || '—'}</b></div>
            <div>فاکتور: <b>{report.mapping.invoiceHeaders.join(', ') || '—'}</b></div>
            <div>ردیف فاکتور: <b>{report.mapping.invoiceItems.join(', ') || '—'}</b></div>
            <div>دریافت/پرداخت: <b>{report.mapping.payments.join(', ') || '—'}</b></div>
            <div>حساب‌های مالی: <b>{report.mapping.financialAccounts.join(', ') || 'صندوق/بانک بر اساس ردیف سند'}</b></div>
            <div>امضا: <b>{report.mapping.signature || '—'}</b></div>
          </div>
        </Panel>

        {!!report.duplicates.length && <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
          <AlertTitle className="font-black">Duplicate detection روی دیتابیس فعلی</AlertTitle>
          <AlertDescription className="mt-2 max-h-32 overflow-auto text-xs leading-6 text-amber-800">{report.duplicates.slice(0, 50).map((item) => <div key={item}>• {item}</div>)}</AlertDescription>
        </Alert>}

        {!!report.messages.length && <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4 text-amber-600" /> Warnings / Conflicts</h3>
          <div className="max-h-56 space-y-2 overflow-auto">
            {report.messages.map((item, index) => <Alert key={item.code + index} variant={item.severity === 'conflict' ? 'destructive' : 'default'} className={item.severity === 'conflict' ? 'rounded-lg border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 [&>svg]:text-rose-700' : item.severity === 'warning' ? 'rounded-lg border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 [&>svg]:text-amber-700' : 'rounded-lg border-slate-200 bg-slate-50 p-2 text-xs text-slate-700'}>
              <AlertDescription className="text-xs"><b>{item.severity === 'conflict' ? 'Conflict' : item.severity === 'warning' ? 'Warning' : 'Info'}:</b> {item.message}</AlertDescription>
            </Alert>)}
          </div>
        </section>}

        <Panel padding="sm">
          <div className="mb-2 flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Reconciliation</div>
          <div className="max-h-64 overflow-auto">
            <DataTable className="data-table min-w-[720px]">
              <thead><tr><th>مورد</th><th>منبع Yas</th><th>بعد از Migration</th><th>اختلاف</th><th>نتیجه</th></tr></thead>
              <tbody>
                {report.reconciliation.map((item) => <tr key={item.kind + ':' + item.key}>
                  <td>{item.label}</td>
                  <td dir="ltr">{formatNumber(item.source)}</td>
                  <td dir="ltr">{formatNumber(item.imported)}</td>
                  <td dir="ltr">{formatNumber(item.difference)}</td>
                  <td><Badge className={item.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>{item.status === 'ok' ? 'OK' : 'Mismatch'}</Badge></td>
                </tr>)}
                {!report.reconciliation.length && <tr><td colSpan={5} className="!py-8 text-center text-slate-400">جدول کاردکس/Total قابل Reconciliation خودکار شناسایی نشد؛ Mapping و هشدارها را بررسی کنید.</td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Panel>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={downloadReport}><Download className="h-4 w-4" /> دانلود Migration Report</Button>
          <Button variant="outline" disabled={busy || blockingConflicts > 0 || !repairLinks.length} onClick={repairCurrentLinks}>ترمیم {repairLinks.length} ارتباط در دادهٔ فعلی</Button>
          <Button disabled={busy || blockingConflicts > 0} onClick={() => void importData()}><DatabaseZap className="h-4 w-4" /> Import نهایی</Button>
        </div>
      </>}
    </CardContent>
  </Card>;
}
