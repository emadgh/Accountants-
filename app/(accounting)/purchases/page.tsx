import { redirect } from 'next/navigation';
import { documentsAliasHref } from '@/lib/document-routes';
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { redirect(documentsAliasHref('purchase', await searchParams)); }
