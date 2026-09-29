'use client';

import { useSearchParams } from 'next/navigation';
import { CustomerLedgerView } from '@/components/management-views';
import { useAccountingNavigation } from '@/components/accounting-app';

export default function LedgerPage() {
  const searchParams = useSearchParams();
  const navigation = useAccountingNavigation();
  return (
    <CustomerLedgerView
      initialCustomerId={searchParams.get('customerId')}
      onOpenInvoice={navigation.viewInvoice}
    />
  );
}
