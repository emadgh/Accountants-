import type { ViewKey } from '@/components/sidebar-config';

export const VIEW_PATHS: Record<ViewKey, string> = {
  dashboard: '/',
  sales: '/sales',
  'sale-new': '/sales/new',
  purchases: '/purchases',
  'purchase-new': '/purchases/new',
  customers: '/customers',
  ledger: '/ledger',
  products: '/products',
  inventory: '/inventory',
  payments: '/payments',
  checks: '/checks',
  returns: '/returns',
  accounting: '/accounting',
  reports: '/reports',
  settings: '/settings',
  'business-profiles': '/business-profiles',
};

export function getViewForPathname(pathname: string): ViewKey {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return (Object.entries(VIEW_PATHS).find(([, path]) => path === normalizedPath)?.[0] as ViewKey | undefined)
    || 'dashboard';
}

export function buildViewHref(
  view: ViewKey,
  details: {
    invoiceId?: string | null;
    invoiceMode?: 'view' | 'edit';
    customerId?: string | null;
    checkId?: string | null;
  } = {}
) {
  const params = new URLSearchParams();

  if ((view === 'sale-new' || view === 'purchase-new') && details.invoiceId) {
    params.set('invoiceId', details.invoiceId);
    params.set('mode', details.invoiceMode || 'view');
  }
  if (view === 'ledger' && details.customerId) params.set('customerId', details.customerId);
  if (view === 'checks' && details.checkId) params.set('checkId', details.checkId);

  const query = params.toString();
  return `${VIEW_PATHS[view]}${query ? `?${query}` : ''}`;
}
