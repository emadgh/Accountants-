'use client';

import { CustomersView } from '@/components/management-views';
import { useAccountingNavigation } from '@/components/accounting-app';

export default function CustomersPage() {
  const navigation = useAccountingNavigation();
  return <CustomersView onOpenLedger={navigation.openCustomerLedger} />;
}
