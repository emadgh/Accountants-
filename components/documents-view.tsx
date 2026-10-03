'use client';
import { useRouter,useSearchParams } from 'next/navigation';
import { useAccountingNavigation } from './accounting-app';
import { InvoiceListView } from './management/invoice-list';
import { Button } from './ui/button';
export function DocumentsView() {
  const search = useSearchParams(); const router = useRouter(); const navigation = useAccountingNavigation();
  const kind = search.get('kind') === 'purchase' ? 'purchase' : 'sale';
  const changeKind = (next: string) => { const params = new URLSearchParams(search.toString()); params.set('kind', next); router.replace(`/documents?${params}`, { scroll: false }); };
  return <div className="flex flex-col gap-4"><div role="group" aria-label="نوع فاکتور" className="flex gap-2"><Button variant={kind === 'sale' ? 'default' : 'outline'} aria-pressed={kind === 'sale'} onClick={() => changeKind('sale')}>فروش</Button><Button variant={kind === 'purchase' ? 'default' : 'outline'} aria-pressed={kind === 'purchase'} onClick={() => changeKind('purchase')}>خرید</Button></div><InvoiceListView key={kind} kind={kind} onView={(id) => navigation.viewInvoice(id, kind)} onEdit={(id) => navigation.editInvoice(id, kind)} onNew={() => navigation.newInvoice(kind)} /></div>;
}
