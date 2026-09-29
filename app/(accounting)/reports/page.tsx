'use client';

import { ReportsView } from '@/components/reports-view';
import { useAccountingNavigation } from '@/components/accounting-app';

export default function ReportsPage() {
  const navigation = useAccountingNavigation();
  return (
    <ReportsView
      onOpenInvoice={navigation.viewInvoice}
      onOpenCustomer={navigation.openCustomerLedger}
      onOpenCheck={navigation.openCheck}
    />
  );
}
