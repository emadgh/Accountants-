import type { ViewKey } from '@/components/sidebar-config';

export { VIEW_PATHS } from '@/lib/app-features';
import { VIEW_PATHS } from '@/lib/app-features';

export function getViewForPathname(pathname: string, query = ''): ViewKey {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  if (normalizedPath === '/documents') return new URLSearchParams(query).get('kind') === 'purchase' ? 'purchases' : 'sales';
  if (normalizedPath === '/sales/installments') return 'sales';
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
    projectId?: string | null;
    quoteId?: string | null;
  } = {}
) {
  const params = new URLSearchParams();
  if (view === 'sales' || view === 'purchases') params.set('kind', view === 'sales' ? 'sale' : 'purchase');

  if ((view === 'sale-new' || view === 'purchase-new') && details.invoiceId) {
    params.set('invoiceId', details.invoiceId);
    params.set('mode', details.invoiceMode || 'view');
  }
  if ((view === 'sale-new' || view === 'purchase-new' || view === 'quotes' || view === 'projects' || view === 'sales' || view === 'purchases') && details.projectId) params.set('projectId', details.projectId);
  if (view === 'quotes' && details.quoteId) params.set('quoteId', details.quoteId);
  if (view === 'ledger' && details.customerId) params.set('customerId', details.customerId);
  if (view === 'checks' && details.checkId) params.set('checkId', details.checkId);

  const query = params.toString();
  return `${view === 'sales' || view === 'purchases' ? '/documents' : VIEW_PATHS[view]}${query ? `?${query}` : ''}`;
}
