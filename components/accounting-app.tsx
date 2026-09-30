'use client';

import { createContext, Suspense, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Sidebar, type ViewKey } from '@/components/sidebar';
import { AppNavbar } from '@/components/app-navbar';
import type { TableDensity } from '@/components/ui/data-table';
import { useAccountingStore } from '@/lib/store';
import { notify } from '@/lib/feedback';
import { pageTransitionVariants } from '@/lib/animation-config';
import { GlobalSearchDialog } from '@/components/global-search/global-search-dialog';
import { buildViewHref, getViewForPathname } from '@/components/app-routes';
import type { InvoiceKind } from '@/lib/types';

type AccountingNavigation = {
  navigate: (view: ViewKey) => void;
  viewInvoice: (id: string, kind: InvoiceKind) => void;
  editInvoice: (id: string, kind: InvoiceKind) => void;
  newInvoice: (kind: InvoiceKind) => void;
  openCustomerLedger: (customerId: string) => void;
  openCheck: (checkId: string) => void;
};

const NavigationContext = createContext<AccountingNavigation | null>(null);

export function useAccountingNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error('useAccountingNavigation must be used inside AccountingApp.');
  return navigation;
}

export function AccountingApp({ onLogout, children }: { onLogout?: () => void; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const view = getViewForPathname(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tableDensity, setTableDensity] = useState<TableDensity>('normal');
  const [isNavigationPending, startNavigation] = useTransition();
  const pendingHref = useRef<string | null>(null);
  const hydrated = useAccountingStore((s) => s.hydrated);
  const invoices = useAccountingStore((s) => s.invoices);

  useEffect(() => {
    try {
      const savedDensity = window.localStorage.getItem('accounting-table-density');
      if (savedDensity === 'condensed' || savedDensity === 'extra-condensed') setTableDensity(savedDensity);
    } catch {
      // Keep the default density when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!isNavigationPending) pendingHref.current = null;
  }, [isNavigationPending]);

  const pushHref = (href: string) => {
    const currentHref = `${pathname}${window.location.search}`;
    if (href === currentHref) {
      if (pendingHref.current && pendingHref.current !== currentHref) {
        pendingHref.current = currentHref;
        startNavigation(() => router.replace(currentHref));
      }
      return;
    }
    if (href === pendingHref.current) return;
    pendingHref.current = href;
    startNavigation(() => router.push(href));
  };

  useEffect(() => {
    if (hydrated) return;
    void useAccountingStore.persist.rehydrate();
  }, [hydrated, useAccountingStore]);

  useEffect(() => {
    const onPersistenceError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail || 'خطای نامشخص دیتابیس';
      notify('اتصال یا ذخیره‌سازی سرور در دسترس نیست؛ سند جدید ذخیره نمی‌شود. ' + message + ' وضعیت از آخرین Commit بازیابی می‌شود.', 'error');
      void Promise.resolve(useAccountingStore.persist.rehydrate()).catch(() => undefined);
    };
    window.addEventListener('accounting:persistence-error', onPersistenceError);
    return () => window.removeEventListener('accounting:persistence-error', onPersistenceError);
  }, []);

  useEffect(() => {
    const onGlobalSearchKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setMenuOpen(false);
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onGlobalSearchKeyDown);
    return () => window.removeEventListener('keydown', onGlobalSearchKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.key.toLowerCase() !== 'n') return;
      if (view === 'sale-new' || view === 'purchase-new') return;
      event.preventDefault();
      pushHref(buildViewHref('sale-new'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pathname, router, view]);

  const navigate = (next: ViewKey) => {
    pushHref(buildViewHref(next));
    setMenuOpen(false);
  };

  const toggleTableDensity = () => {
    const nextDensity: TableDensity = tableDensity === 'normal'
      ? 'condensed'
      : tableDensity === 'condensed'
        ? 'extra-condensed'
        : 'normal';
    setTableDensity(nextDensity);
    try {
      window.localStorage.setItem('accounting-table-density', nextDensity);
    } catch {
      // The in-memory preference still applies for this session.
    }
  };

  const viewInvoice = (id: string, kind: InvoiceKind) => {
    pushHref(buildViewHref(kind === 'sale' ? 'sale-new' : 'purchase-new', { invoiceId: id, invoiceMode: 'view' }));
  };

  const editInvoice = (id: string, kind: InvoiceKind) => {
    const invoice = invoices.find((item) => item.id === id);
    if (invoice?.status === 'settled' || invoice?.status === 'void') {
      notify(invoice.status === 'settled' ? 'فاکتور تسویه‌شده قابل ویرایش نیست.' : 'فاکتور باطل‌شده قابل ویرایش نیست.', 'info');
      viewInvoice(id, kind);
      return;
    }
    pushHref(buildViewHref(kind === 'sale' ? 'sale-new' : 'purchase-new', { invoiceId: id, invoiceMode: 'edit' }));
  };

  const newInvoice = (kind: InvoiceKind) => {
    pushHref(buildViewHref(kind === 'sale' ? 'sale-new' : 'purchase-new'));
  };

  const openCustomerLedger = (customerId: string) => {
    pushHref(buildViewHref('ledger', { customerId }));
  };

  const openCheck = (checkId: string) => {
    pushHref(buildViewHref('checks', { checkId }));
  };

  const navigation: AccountingNavigation = {
    navigate,
    viewInvoice,
    editInvoice,
    newInvoice,
    openCustomerLedger,
    openCheck,
  };
  const isInvoiceEditor = view === 'sale-new' || view === 'purchase-new';
  const contentKey = pathname;

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="app-shell" data-table-density={tableDensity}>
        <Sidebar active={view} onChange={navigate} open={menuOpen} onOpenChange={setMenuOpen} />
        <AnimatePresence>
          {isNavigationPending && (
            <motion.div
              key="route-progress"
              role="status"
              aria-label="در حال بارگذاری صفحه"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-sky-100/80"
            >
              <motion.div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1/3 bg-sky-500"
                animate={{ x: ['-100%', '400%'] }}
                transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
              />
              <span className="sr-only">در حال بارگذاری صفحه...</span>
            </motion.div>
          )}
        </AnimatePresence>
        <main className="min-h-screen lg:mr-[275px]">
          <AppNavbar
            onSearch={() => { setMenuOpen(false); setSearchOpen(true); }}
            onLogout={onLogout}
            onMenuToggle={() => setMenuOpen(true)}
            tableDensity={tableDensity}
            onTableDensityToggle={toggleTableDensity}
          >
            {hydrated ? (
              <Suspense fallback={null}>
                <motion.div
                  key={contentKey}
                  variants={pageTransitionVariants}
                  initial="initial"
                  animate="animate"
                  className={isInvoiceEditor ? 'p-3 sm:p-5' : 'mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8'}
                >
                  {children}
                </motion.div>
              </Suspense>
            ) : (
              <div className="grid min-h-[calc(100dvh-4rem)] place-items-center bg-slate-50">
                <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600" /><div className="mt-4 text-sm font-bold text-slate-500">در حال بارگذاری اطلاعات حسابداری...</div></div>
              </div>
            )}
          </AppNavbar>
        </main>
        <GlobalSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onNavigate={navigate}
          onOpenCustomer={(customerId) => { openCustomerLedger(customerId); setMenuOpen(false); }}
          onOpenInvoice={(invoiceId, kind) => { viewInvoice(invoiceId, kind); setMenuOpen(false); }}
        />
      </div>
    </NavigationContext.Provider>
  );
}
