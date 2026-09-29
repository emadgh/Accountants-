'use client';

import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { sidebarGroups, type ViewKey } from '@/components/sidebar-config';
import { useAccountingStore } from '@/lib/store';
import type { Customer, Invoice } from '@/lib/types';
import { SearchResultContent, type GlobalSearchResult } from './search-result-renderers';

type SearchGroup = { id: string; heading: string; results: GlobalSearchResult[] };

type GlobalSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: ViewKey) => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenInvoice: (invoiceId: string, kind: Invoice['kind']) => void;
};

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('fa-IR')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u200c\u200e\u200f\u202a-\u202e]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const fillerWords = new Set(['مشتری', 'مشتریان', 'شخص', 'اشخاص', 'طرف', 'حساب', 'فاکتور', 'فاکتورها', 'فاکتورهای', 'فاکتورهاي', 'منو', 'صفحه', 'بخش', 'آخر', 'آخرین', 'اخیر', 'چند'].map(normalizeText));
const modifierWords = new Set(['آخر', 'آخرین', 'اخیر', 'چند'].map(normalizeText));

function queryTokens(query: string) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  const meaningfulTokens = tokens.filter((token) => !fillerWords.has(token));
  return meaningfulTokens.length ? meaningfulTokens : tokens.filter((token) => !modifierWords.has(token));
}

function matchesQuery(query: string, fields: Array<string | number | undefined>) {
  const tokens = queryTokens(query);
  if (!query.trim()) return true;
  if (!tokens.length) return false;
  const haystack = normalizeText(fields.filter((field) => field !== undefined && field !== '').join(' '));
  return tokens.every((token) => haystack.includes(token));
}

function invoiceRecency(invoice: Invoice) {
  const timestamp = Date.parse(invoice.createdAt || invoice.updatedAt || '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function invoiceSearchFields(invoice: Invoice) {
  return [
    invoice.number,
    'فاکتور',
    invoice.customerName,
    invoice.customerPhone,
    invoice.customerAddress,
    invoice.customerNationalId,
    invoice.customerEconomicCode,
    invoice.date,
    invoice.notes,
    invoice.kind === 'sale' ? 'فروش' : 'خرید',
    invoice.status,
    ...invoice.items.flatMap((item) => [item.description, item.details]),
  ];
}

function buildSearchGroups(query: string, customers: Customer[], invoices: Invoice[], currency: string): SearchGroup[] {
  const pageResults: GlobalSearchResult[] = sidebarGroups.flatMap((group) =>
    group.items.map(({ key, label, icon }) => ({
      type: 'page' as const,
      id: `page:${key}`,
      label,
      groupLabel: group.label,
      view: key,
      icon,
    }))
  );

  if (!query.trim()) {
    const latestInvoices = [...invoices]
      .sort((left, right) => invoiceRecency(right) - invoiceRecency(left))
      .slice(0, 6)
      .map((invoice) => ({ type: 'invoice' as const, id: `invoice:${invoice.id}`, invoice, currency }));
    return [
      { id: 'pages', heading: 'رفتن به بخش', results: pageResults },
      ...(latestInvoices.length ? [{ id: 'recent-invoices', heading: 'فاکتورهای اخیر', results: latestInvoices }] : []),
    ];
  }

  const matchingPages = pageResults.filter((result) => result.type === 'page' && matchesQuery(query, [result.label, result.groupLabel])).slice(0, 12);
  const matchingCustomers = customers
    .filter((customer) => matchesQuery(query, [customer.name, customer.code, customer.phone, customer.address, customer.nationalId, customer.economicCode, customer.postalCode, customer.notes, customer.kind === 'supplier' ? 'تأمین‌کننده فروشنده' : 'مشتری']))
    .slice(0, 8);
  const customerIds = new Set(matchingCustomers.map((customer) => customer.id));
  const groups: SearchGroup[] = [];

  if (matchingPages.length) groups.push({ id: 'pages', heading: 'صفحه‌ها و منوها', results: matchingPages });
  if (matchingCustomers.length) {
    groups.push({
      id: 'customers',
      heading: 'طرف‌حساب‌ها',
      results: matchingCustomers.map((customer) => ({ type: 'customer', id: `customer:${customer.id}`, customer })),
    });
  }

  const shownRelatedInvoices = new Set<string>();
  matchingCustomers.forEach((customer) => {
    const recentInvoices = invoices
      .filter((invoice) => invoice.customerId === customer.id)
      .sort((left, right) => invoiceRecency(right) - invoiceRecency(left))
      .slice(0, 4);
    if (!recentInvoices.length) return;
    recentInvoices.forEach((invoice) => shownRelatedInvoices.add(invoice.id));
    groups.push({
      id: `customer-invoices:${customer.id}`,
      heading: `فاکتورهای اخیر · ${customer.name}`,
      results: recentInvoices.map((invoice) => ({ type: 'invoice', id: `invoice:${invoice.id}`, invoice, currency })),
    });
  });

  const matchingInvoices = invoices
    .filter((invoice) => !customerIds.has(invoice.customerId) && !shownRelatedInvoices.has(invoice.id))
    .filter((invoice) => matchesQuery(query, invoiceSearchFields(invoice)))
    .sort((left, right) => invoiceRecency(right) - invoiceRecency(left))
    .slice(0, 12)
    .map((invoice) => ({ type: 'invoice' as const, id: `invoice:${invoice.id}`, invoice, currency }));
  if (matchingInvoices.length) groups.push({ id: 'invoices', heading: 'فاکتورها', results: matchingInvoices });

  return groups;
}

export function GlobalSearchDialog({ open, onOpenChange, onNavigate, onOpenCustomer, onOpenInvoice }: GlobalSearchDialogProps) {
  const [query, setQuery] = React.useState('');
  const customers = useAccountingStore((state) => state.customers);
  const invoices = useAccountingStore((state) => state.invoices);
  const currency = useAccountingStore((state) => state.settings.currency);
  const groups = React.useMemo(
    () => buildSearchGroups(query, customers, invoices, currency),
    [customers, currency, invoices, query]
  );

  React.useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const selectResult = (result: GlobalSearchResult) => {
    if (result.type === 'page') onNavigate(result.view);
    else if (result.type === 'customer') onOpenCustomer(result.customer.id);
    else onOpenInvoice(result.invoice.id, result.invoice.kind);
    setQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>جست‌وجوی سراسری</DialogTitle>
          <DialogDescription>جست‌وجو در بخش‌ها، اشخاص و فاکتورهای برنامه</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} loop>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="نام شخص، شماره فاکتور یا بخش موردنظر..."
            aria-label="جست‌وجوی سراسری"
          />
          <CommandList>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.heading}>
                {group.results.map((result) => (
                  <CommandItem key={result.id} value={result.id} onSelect={() => selectResult(result)}>
                    <SearchResultContent result={result} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandEmpty>نتیجه‌ای پیدا نشد.</CommandEmpty>
          </CommandList>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup> جابه‌جایی</span>
            <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> باز کردن</span>
            <span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd> بستن</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}