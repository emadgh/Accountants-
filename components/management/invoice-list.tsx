'use client';
import { InvoicePaymentDialog } from '@/components/invoice-payment-dialog';
import { InvoicePaymentHistoryButton } from '@/components/invoice-payment-history';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EMPTY_LIST_FILTERS, FilterBar, type ListFilters } from '@/components/ui/filter-bar';
import { RecordTable, type RecordColumn } from '@/components/ui/record-table';
import { documentList } from '@/lib/domain/document-list';
import { confirmDialog, notify } from '@/lib/feedback';
import { persistOperation } from '@/lib/operation-result';
import { formatPersianDate, todayIso } from '@/lib/standards';
import { useAccountingStore } from '@/lib/store';
import type { InvoiceKind } from '@/lib/types';
import { money } from '@/lib/utils';
import { CircleDollarSign, Edit3, Eye, Plus, Trash2 } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { InvoiceStatus, PageHead, ReturnProgressBadge } from './shared';

export function InvoiceListView({ kind, onView, onEdit, onNew }: { kind: InvoiceKind; onView: (id: string) => void; onEdit: (id: string) => void; onNew: () => void }) {
  const data = useAccountingStore(useShallow((state) => ({ invoices: state.invoices, customers: state.customers, projects: state.projects, returns: state.returns, payments: state.payments, checks: state.checks, settings: state.settings })));
  const deleteInvoice = useAccountingStore((state) => state.deleteInvoice);
  const reserveDocumentNumber = useAccountingStore((state) => state.reserveDocumentNumber);
  const search = useSearchParams(); const pathname = usePathname();
  const filters = Object.fromEntries(Object.entries(EMPTY_LIST_FILTERS).map(([key, fallback]) => [key, search.get(key) || fallback])) as unknown as ListFilters;
  const setFilters = (value: ListFilters) => {
    const params = new URLSearchParams(search.toString());
    for (const [key, entry] of Object.entries(value)) { if (entry && entry !== 'all') params.set(key, entry); else params.delete(key); }
    window.history.replaceState(null, '', `${pathname}?${params}`);
  };
  const [paymentAction, setPaymentAction] = useState<{ invoiceId: string; documentNumber: string } | null>(null);
  const rows = useMemo(() => documentList(data, kind, filters, todayIso()), [data, kind, search.toString()]);
  type Row = typeof rows[number];
  const columns: RecordColumn<Row>[] = [
    { id: 'number', title: 'شماره', sortValue: (row) => row.invoice.number, cell: (row) => <b>{row.invoice.number}</b> },
    { id: 'date', title: 'تاریخ', sortValue: (row) => row.invoice.date, cell: (row) => formatPersianDate(row.invoice.date) },
    { id: 'due', title: 'سررسید', sortValue: (row) => row.invoice.dueDate || '', cell: (row) => <span className={row.overdue ? 'font-bold text-rose-600' : ''}>{row.invoice.dueDate ? formatPersianDate(row.invoice.dueDate) : '—'}{row.overdue && <span className="block text-xs">سررسید گذشته</span>}</span> },
    { id: 'customer', title: 'طرف حساب', sortValue: (row) => row.invoice.customerName, cell: (row) => row.invoice.customerName || '—' },
    { id: 'status', title: 'وضعیت', cell: (row) => <div className="flex flex-wrap gap-1"><InvoiceStatus status={row.invoice.status} /><ReturnProgressBadge returned={row.returned} total={row.total} /></div> },
    { id: 'total', title: 'مبلغ کل', sortValue: (row) => row.total, cell: (row) => <div><b>{money(row.total)}</b> {data.settings.currency}{row.returned > 0 && <div className="text-xs text-rose-600">مرجوعی: {money(row.returned)} · خالص: {money(row.netTotal)}</div>}</div> },
    { id: 'paid', title: 'پرداخت', sortValue: (row) => row.paid, cell: (row) => <div className="flex items-center gap-2">{row.posted && <InvoicePaymentHistoryButton invoiceId={row.invoice.id} />}{money(row.paid)}</div> },
    { id: 'remaining', title: 'مانده', sortValue: (row) => row.outstanding, cell: (row) => <div className={row.outstanding > 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(row.outstanding)}{row.reserved > 0 && <span className="block text-xs text-amber-800">رزرو چک: {money(row.reserved)}</span>}</div> },
  ];
  return <div className="flex flex-col gap-5"><PageHead title={kind === 'sale' ? 'فاکتورهای فروش' : 'فاکتورهای خرید'} subtitle="اسناد، سررسیدها و تسویه" action={<Button onClick={onNew}><Plus />فاکتور جدید</Button>} />
    <Card><CardHeader><FilterBar value={filters} onChange={setFilters} customers={data.customers} projects={data.projects} statuses={[{ value: 'draft', label: 'پیش‌نویس' }, { value: 'final', label: 'قطعی' }, { value: 'partial', label: 'بخشی تسویه' }, { value: 'settled', label: 'تسویه‌شده' }, { value: 'void', label: 'باطل' }]}><select aria-label="مانده" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={filters.balance} onChange={(event) => setFilters({ ...filters, balance: event.target.value })}><option value="all">همه مانده‌ها</option><option value="open">مانده‌دار</option><option value="settled">تسویه‌شده</option><option value="overdue">سررسید گذشته</option></select></FilterBar></CardHeader>
    <RecordTable rows={rows} columns={columns} rowId={(row) => row.invoice.id} actions={(row) => <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => onView(row.invoice.id)} aria-label="نمایش فاکتور"><Eye /></Button>
      {!['settled', 'void'].includes(row.invoice.status) && <Button variant="ghost" size="icon" onClick={() => onEdit(row.invoice.id)} aria-label="ویرایش فاکتور"><Edit3 /></Button>}
      {row.posted && row.available > 0 && <Button variant="outline" size="sm" onClick={() => setPaymentAction({ invoiceId: row.invoice.id, documentNumber: reserveDocumentNumber(kind === 'sale' ? 'receipt' : 'payment') })}><CircleDollarSign />{kind === 'sale' ? 'دریافت' : 'پرداخت'}</Button>}
      {row.invoice.status === 'draft' && <Button variant="ghost" size="icon" aria-label="حذف پیش‌نویس" onClick={async () => { if (!await confirmDialog('پیش‌نویس حذف شود؟', { title: 'حذف پیش‌نویس', danger: true })) return; const result = await persistOperation(() => deleteInvoice(row.invoice.id)); if (!result.ok) notify(result.message || 'حذف انجام نشد.', 'error'); }}><Trash2 /></Button>}
    </div>} /></Card><InvoicePaymentDialog invoiceId={paymentAction?.invoiceId} documentNumber={paymentAction?.documentNumber} open={!!paymentAction} onOpenChange={(open) => { if (!open) setPaymentAction(null); }} /></div>;
}
