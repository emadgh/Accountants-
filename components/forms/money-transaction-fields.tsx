'use client';
import { Field, FieldGroup } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import type { Account, MoneyTransaction } from '@/lib/types';

export type MoneyDraft = Pick<MoneyTransaction, 'kind' | 'date' | 'settlementAccountId' | 'categoryAccountId' | 'amount' | 'reference' | 'description'>;
export function MoneyTransactionFields({ value, onChange, accounts, currency, fixedKind = false, disabled = false }: {
  value: MoneyDraft; onChange: (draft: MoneyDraft) => void; accounts: Account[]; currency: string; fixedKind?: boolean; disabled?: boolean;
}) {
  const categories = accounts.filter((account) => account.active && account.type === (value.kind === 'income' ? 'revenue' : 'expense'));
  const settlement = accounts.filter((account) => account.active && account.type === 'asset');
  const patch = (update: Partial<MoneyDraft>) => onChange({ ...value, ...update });
  return <fieldset disabled={disabled} className="contents"><FieldGroup className="sm:col-span-2 sm:grid-cols-2">
    {!fixedKind && <Field label="نوع"><select className="h-10 rounded-xl border border-slate-200 px-3" value={value.kind} onChange={(event) => { const kind = event.target.value as MoneyDraft['kind']; patch({ kind, categoryAccountId: accounts.find((account) => account.active && account.type === (kind === 'income' ? 'revenue' : 'expense'))?.id || '' }); }}><option value="income">درآمد</option><option value="expense">هزینه</option></select></Field>}
    <Field label="تاریخ"><JalaliDatePicker value={value.date} onChange={(date) => patch({ date })} /></Field>
    <Field label="حساب صندوق / بانک" error={!value.settlementAccountId ? 'حساب پرداخت یا دریافت را انتخاب کنید.' : undefined}><select className="h-10 rounded-xl border border-slate-200 px-3" value={value.settlementAccountId} onChange={(event) => patch({ settlementAccountId: event.target.value })}><option value="">انتخاب حساب…</option>{settlement.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></Field>
    <Field label="سرفصل درآمد / هزینه" error={!value.categoryAccountId ? 'سرفصل را انتخاب کنید.' : undefined}><select className="h-10 rounded-xl border border-slate-200 px-3" value={value.categoryAccountId} onChange={(event) => patch({ categoryAccountId: event.target.value })}><option value="">انتخاب سرفصل…</option>{categories.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></Field>
    <Field label={`مبلغ (${currency})`} error={!Number.isFinite(value.amount) || value.amount <= 0 ? 'مبلغ باید بیشتر از صفر باشد.' : undefined}><FormattedInput min={0} value={value.amount} onValueChange={(amount) => patch({ amount })} /></Field>
    <Field label="مرجع"><Input value={value.reference || ''} onChange={(event) => patch({ reference: event.target.value })} /></Field>
    <Field label="شرح *" className="sm:col-span-2" error={!value.description.trim() ? 'شرح را وارد کنید.' : undefined}><Textarea value={value.description} onChange={(event) => patch({ description: event.target.value })} /></Field>
  </FieldGroup></fieldset>;
}
