import type * as React from 'react';
import { FileText, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { money, invoiceTotal } from '@/lib/utils';
import type { Customer, Invoice } from '@/lib/types';
import type { ViewKey } from '@/components/sidebar-config';

export type GlobalSearchResult =
  | { type: 'page'; id: string; label: string; groupLabel: string; view: ViewKey; icon: React.ElementType<{ className?: string }> }
  | { type: 'customer'; id: string; customer: Customer }
  | { type: 'invoice'; id: string; invoice: Invoice; currency: string };

type ResultOf<T extends GlobalSearchResult['type']> = Extract<GlobalSearchResult, { type: T }>;
type RendererMap = {
  [T in GlobalSearchResult['type']]: React.ComponentType<{ result: ResultOf<T> }>;
};

function PageResult({ result }: { result: ResultOf<'page'> }) {
  const Icon = result.icon;
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-bold">{result.label}</span>
        <span className="truncate text-xs text-slate-500">رفتن به {result.groupLabel}</span>
      </span>
    </>
  );
}

function CustomerResult({ result }: { result: ResultOf<'customer'> }) {
  const { customer } = result;
  const label = customer.kind === 'supplier' ? 'تأمین‌کننده' : customer.kind === 'both' ? 'طرف حساب' : 'مشتری';
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700">
        <UserRound className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-bold">{label}: {customer.name}</span>
        <span className="truncate text-xs text-slate-500">
          {[customer.phone, customer.code ? `کد ${customer.code}` : ''].filter(Boolean).join(' · ') || 'بدون شماره تماس'}
        </span>
      </span>
      <Badge className="mr-auto shrink-0">{customer.status === 'archived' ? 'بایگانی' : 'فعال'}</Badge>
    </>
  );
}

function InvoiceResult({ result }: { result: ResultOf<'invoice'> }) {
  const { invoice, currency } = result;
  const kind = invoice.kind === 'sale' ? 'فروش' : 'خرید';
  const status = invoice.status === 'draft' ? 'پیش‌نویس'
    : invoice.status === 'partial' ? 'بخشی تسویه'
      : invoice.status === 'settled' ? 'تسویه‌شده'
        : invoice.status === 'void' ? 'باطل' : 'قطعی';

  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
        <FileText className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-bold">فاکتور {kind} {invoice.number}</span>
        <span className="truncate text-xs text-slate-500">{invoice.customerName || 'بدون طرف حساب'} · {invoice.date}</span>
      </span>
      <span className="mr-auto flex shrink-0 items-center gap-2">
        <Badge>{status}</Badge>
        <span className="text-xs font-bold tabular-nums text-slate-700">{money(invoiceTotal(invoice))} {currency}</span>
      </span>
    </>
  );
}

const resultRenderers: RendererMap = {
  page: PageResult,
  customer: CustomerResult,
  invoice: InvoiceResult,
};

export function SearchResultContent({ result }: { result: GlobalSearchResult }) {
  switch (result.type) {
    case 'page': {
      const Renderer = resultRenderers.page;
      return <Renderer result={result} />;
    }
    case 'customer': {
      const Renderer = resultRenderers.customer;
      return <Renderer result={result} />;
    }
    case 'invoice': {
      const Renderer = resultRenderers.invoice;
      return <Renderer result={result} />;
    }
    default: {
      const exhaustiveResult: never = result;
      return exhaustiveResult;
    }
  }
}