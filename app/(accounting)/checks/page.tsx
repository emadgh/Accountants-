'use client';

import { useSearchParams } from 'next/navigation';
import { ChecksView } from '@/components/management-views';

export default function ChecksPage() {
  const searchParams = useSearchParams();
  return <ChecksView initialCheckId={searchParams.get('checkId')} />;
}
