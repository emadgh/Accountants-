'use client';

import { useAccountingNavigation } from '@/components/accounting-app';
import { InvoiceListView } from '@/components/management-views';

export default function PurchasesPage() {
  const navigation = useAccountingNavigation();
  return (
    <InvoiceListView
      kind="purchase"
      onView={(id) => navigation.viewInvoice(id, 'purchase')}
      onEdit={(id) => navigation.editInvoice(id, 'purchase')}
      onNew={() => navigation.newInvoice('purchase')}
    />
  );
}
