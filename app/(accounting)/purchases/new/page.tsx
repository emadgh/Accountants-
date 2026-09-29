'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { InvoiceEditor } from '@/components/invoice-editor';
import { useAccountingNavigation } from '@/components/accounting-app';

export default function NewPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const navigation = useAccountingNavigation();
  const invoiceId = searchParams.get('invoiceId');
  const mode = invoiceId && searchParams.get('mode') !== 'edit' ? 'view' : 'edit';

  return (
    <InvoiceEditor
      key={`purchase:${invoiceId || 'new'}`}
      kind="purchase"
      invoiceId={invoiceId}
      mode={mode}
      onRequestEdit={() => { if (invoiceId) navigation.editInvoice(invoiceId, 'purchase'); }}
      onBack={() => router.back()}
    />
  );
}
