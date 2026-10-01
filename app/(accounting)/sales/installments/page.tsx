'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { InvoiceInstallments } from '@/components/invoice-installments';

export default function SaleInstallmentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get('invoiceId');
  return <InvoiceInstallments invoiceId={invoiceId} onBack={() => router.push(invoiceId ? `/sales/new?invoiceId=${encodeURIComponent(invoiceId)}&mode=edit` : '/sales')} />;
}
