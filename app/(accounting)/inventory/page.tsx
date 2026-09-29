'use client';

import { InventoryView } from '@/components/management-views';
import { useAccountingNavigation } from '@/components/accounting-app';

export default function InventoryPage() {
  const navigation = useAccountingNavigation();
  return <InventoryView onOpenInvoice={navigation.viewInvoice} />;
}
