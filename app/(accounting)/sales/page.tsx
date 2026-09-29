'use client';

import { useAccountingNavigation } from '@/components/accounting-app';
import { InvoiceListView } from '@/components/management-views';

export default function SalesPage() {
  const navigation = useAccountingNavigation();
  return (
    <InvoiceListView
      kind="sale"
      onView={(id) => navigation.viewInvoice(id, 'sale')}
      onEdit={(id) => navigation.editInvoice(id, 'sale')}
      onNew={() => navigation.newInvoice('sale')}
    />
  );
}
