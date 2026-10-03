'use client';
import type { ReactNode } from 'react';
import { Input } from './input';
import { Button } from './button';
import { JalaliDatePicker } from './jalali-date-picker';
export interface ListFilters { q: string; status: string; from: string; to: string; customerId: string; projectId: string; balance: string }
export const EMPTY_LIST_FILTERS: ListFilters = { q: '', status: 'all', from: '', to: '', customerId: '', projectId: '', balance: 'all' };
export function FilterBar({ value, onChange, statuses, customers = [], projects = [], children }: {
  value: ListFilters; onChange: (filters: ListFilters) => void; statuses: Array<{ value: string; label: string }>;
  customers?: Array<{ id: string; name: string }>; projects?: Array<{ id: string; title: string }>; children?: ReactNode;
}) {
  const patch = (update: Partial<ListFilters>) => onChange({ ...value, ...update });
  return <div className="flex w-full flex-wrap items-center gap-2">
    <Input aria-label="جستجو" className="max-w-sm" value={value.q} onChange={(event) => patch({ q: event.target.value })} placeholder="جستجوی شماره و طرف حساب…" />
    <select aria-label="وضعیت سند" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={value.status} onChange={(event) => patch({ status: event.target.value })}><option value="all">همه وضعیت‌ها</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
    <JalaliDatePicker value={value.from} onChange={(from) => patch({ from })} placeholder="از تاریخ" className="max-w-40" />
    <JalaliDatePicker value={value.to} onChange={(to) => patch({ to })} placeholder="تا تاریخ" className="max-w-40" />
    <select aria-label="طرف حساب" className="h-10 max-w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={value.customerId} onChange={(event) => patch({ customerId: event.target.value })}><option value="">همه طرف حساب‌ها</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
    <select aria-label="پروژه" className="h-10 max-w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={value.projectId} onChange={(event) => patch({ projectId: event.target.value })}><option value="">همه پروژه‌ها</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
    {children}<Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_LIST_FILTERS)}>پاک‌کردن فیلترها</Button>
  </div>;
}
