'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar, type ViewKey } from '@/components/sidebar';
import { DashboardView } from '@/components/dashboard-view';
import { InvoiceEditor } from '@/components/invoice-editor';
import { ChecksView, CustomerLedgerView, CustomersView, InventoryView, InvoiceListView, PaymentsView, ProductsView, ReportsView, SettingsView } from '@/components/management-views';
import { useAccountingStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

export function AccountingApp() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const hydrated = useAccountingStore((s) => s.hydrated);
  const setHydrated = useAccountingStore((s) => s.setHydrated);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 30);
    return () => clearTimeout(timer);
  }, [setHydrated]);

  const navigate = (next: ViewKey) => {
    if (next === 'sale-new' || next === 'purchase-new') setSelectedInvoiceId(null);
    setView(next);
  };

  const editInvoice = (id: string, kind: 'sale' | 'purchase') => {
    setSelectedInvoiceId(id);
    setView(kind === 'sale' ? 'sale-new' : 'purchase-new');
  };

  if (!hydrated) {
    return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600" /><div className="mt-4 text-sm font-bold text-slate-500">در حال بارگذاری اطلاعات حسابداری...</div></div></div>;
  }

  return <div className="app-shell">
    <Sidebar active={view} onChange={navigate} open={menuOpen} onOpenChange={setMenuOpen} />
    <main className="min-h-screen lg:mr-[275px]">
      <div className="screen-only flex h-16 items-center border-b border-slate-200 bg-white px-4 lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button>
        <div className="mr-2 font-black">حسابداری</div>
      </div>
      <div className={view === 'sale-new' || view === 'purchase-new' ? 'p-3 sm:p-5' : 'mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8'}>
        {view === 'dashboard' && <DashboardView />}
        {view === 'sales' && <InvoiceListView kind="sale" onEdit={(id) => editInvoice(id, 'sale')} onNew={() => { setSelectedInvoiceId(null); setView('sale-new'); }} />}
        {view === 'sale-new' && <InvoiceEditor kind="sale" invoiceId={selectedInvoiceId} onBack={() => setView('sales')} />}
        {view === 'purchases' && <InvoiceListView kind="purchase" onEdit={(id) => editInvoice(id, 'purchase')} onNew={() => { setSelectedInvoiceId(null); setView('purchase-new'); }} />}
        {view === 'purchase-new' && <InvoiceEditor kind="purchase" invoiceId={selectedInvoiceId} onBack={() => setView('purchases')} />}
        {view === 'customers' && <CustomersView onOpenLedger={(id) => { setSelectedCustomerId(id); setView('ledger'); }} />}
        {view === 'ledger' && <CustomerLedgerView initialCustomerId={selectedCustomerId} onOpenInvoice={editInvoice} />}
        {view === 'products' && <ProductsView />}
        {view === 'inventory' && <InventoryView onOpenInvoice={editInvoice} />}
        {view === 'payments' && <PaymentsView />}
        {view === 'checks' && <ChecksView />}
        {view === 'reports' && <ReportsView />}
        {view === 'settings' && <SettingsView />}
      </div>
    </main>
  </div>;
}
