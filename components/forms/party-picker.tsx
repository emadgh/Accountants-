'use client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePersistedAction } from '@/hooks/use-persisted-action';
import { createGuestCustomer } from '@/lib/domain/customer';
import { useAccountingStore } from '@/lib/store';
import type { Customer } from '@/lib/types';
import { useState } from 'react';

export function PartyPicker({ value, onChange, kind = 'customer', manual = false, disabled = false, inputClassName, id, 'aria-describedby': describedBy, 'aria-invalid': invalid }: {
  value: string; onChange: (id: string) => void; kind?: Customer['kind']; manual?: boolean; disabled?: boolean; inputClassName?: string;
  id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean;
}) {
  const customers = useAccountingStore((state) => state.customers);
  const upsertCustomer = useAccountingStore((state) => state.upsertCustomer);
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const submission = usePersistedAction();
  const options = customers.filter((customer) => (customer.status !== 'archived' || customer.id === value) && (kind === 'both' || customer.kind === 'both' || customer.kind === kind)).map((customer) => ({ value: customer.id, label: customer.name, description: [customer.code, customer.phone].filter(Boolean).join(' · '), keywords: [customer.code, customer.phone, customer.nationalId].join(' ') }));
  if (manual) options.unshift({ value: '', label: 'ورود دستی', description: 'نام طرف حساب روی فاکتور', keywords: '' });
  return <><div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchableSelect id={id} aria-describedby={describedBy} aria-invalid={invalid} value={value} options={options} onChange={onChange} disabled={disabled} placeholder="انتخاب طرف حساب…" searchPlaceholder="نام، کد یا تلفن…" inputClassName={inputClassName} /></div><Button size="sm" variant="ghost" disabled={disabled} aria-label="ساخت طرف حساب درجا" onClick={() => setOpen(true)}>+</Button></div>
    <Dialog open={open} onOpenChange={(next) => { if (!submission.busy) setOpen(next); }}><DialogContent><DialogHeader><DialogTitle>طرف حساب جدید</DialogTitle><DialogDescription>پس از ذخیره، طرف حساب در این سند انتخاب می‌شود.</DialogDescription></DialogHeader><FieldGroup><Field label="نام *" error={!name.trim() ? 'نام را وارد کنید.' : undefined}><Input value={name} disabled={submission.busy} onChange={(event) => setName(event.target.value)} /></Field><Field label="تلفن"><Input value={phone} disabled={submission.busy} onChange={(event) => setPhone(event.target.value)} /></Field>{submission.error && <p role="alert" className="text-sm text-rose-600">{submission.error}</p>}<Button disabled={submission.busy || !name.trim()} onClick={async () => { const customer = createGuestCustomer({ name, phone, kind }); await submission.run(() => upsertCustomer(customer), () => { onChange(customer.id); setOpen(false); setName(''); setPhone(''); }); }}>{submission.busy ? 'در حال ذخیره…' : 'ذخیره و انتخاب'}</Button></FieldGroup></DialogContent></Dialog>
  </>;
}
