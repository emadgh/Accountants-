import { redirect } from 'next/navigation';
import { documentsAliasHref } from '@/lib/document-routes';
export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { redirect(documentsAliasHref('sale', await searchParams)); }
