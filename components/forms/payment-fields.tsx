'use client';
import { Field, FieldGroup } from '@/components/ui/field';
import { FormattedInput } from '@/components/ui/formatted-input';
import { Input } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { SettlementSummary } from '@/components/ui/settlement-summary';
import { eligiblePaymentChecks, paymentCapacity } from '@/lib/domain/payment-capacity';
import type { AccountingData, Payment } from '@/lib/types';
import { money } from '@/lib/utils';

export function PaymentFields({ value, onChange, data, currency, disabled = false }: {
  value: Payment; onChange: (payment: Payment) => void;
  data: Pick<AccountingData, 'invoices' | 'payments' | 'checks' | 'returns'>;
  currency: string; disabled?: boolean;
}) {
  const invoice = data.invoices.find((item) => item.id === value.invoiceId);
  const capacity = invoice ? paymentCapacity(invoice, data, value.id) : undefined;
  const checks = eligiblePaymentChecks(value, data, capacity?.available);
  const amountError = !Number.isFinite(value.amount) || value.amount <= 0 ? 'مبلغ باید بیشتر از صفر باشد.'
    : capacity && value.amount > capacity.available + 0.0001 ? 'مبلغ از مانده آزاد فاکتور بیشتر است.' : undefined;
  const patch = (update: Partial<Payment>) => onChange({ ...value, ...update });
  return <fieldset disabled={disabled} className="contents"><FieldGroup className="sm:col-span-2 sm:grid-cols-2">
    <Field label="روش"><select className="h-10 rounded-xl border border-slate-200 bg-white px-3" value={value.method} onChange={(event) => patch({ method: event.target.value as Payment['method'], checkId: undefined, reference: '' })}><option value="cash">نقدی</option><option value="card">کارت / واریز</option><option value="check">چک</option></select></Field>
    {value.method === 'check' && <Field label="چک ثبت‌شده *" error={!checks.some((item) => item.id === value.checkId) ? 'چک معتبر ثبت‌شده را انتخاب کنید.' : undefined}><select className="h-10 rounded-xl border border-slate-200 bg-white px-3" value={value.checkId || ''} onChange={(event) => { const check = checks.find((item) => item.id === event.target.value); patch({ checkId: check?.id, amount: check?.amount || 0, reference: check?.number || '' }); }}><option value="">انتخاب چک…</option>{checks.map((check) => <option key={check.id} value={check.id}>{check.number} · {money(check.amount)} · {check.status === 'cleared' ? 'وصول شده' : 'در انتظار'}</option>)}</select></Field>}
    <Field label={`مبلغ (${currency}) *`} error={amountError}><FormattedInput min={0} max={capacity?.available} value={value.amount} readOnly={value.method === 'check' && !!value.checkId} onValueChange={(amount) => patch({ amount })} /></Field>
    <Field label="تاریخ"><JalaliDatePicker value={value.date} onChange={(date) => patch({ date })} /></Field>
    <Field label="شماره پیگیری / مرجع"><Input value={value.reference || ''} onChange={(event) => patch({ reference: event.target.value })} /></Field>
    <Field label="توضیحات"><Input value={value.notes || ''} onChange={(event) => patch({ notes: event.target.value })} /></Field>
    {capacity && <div className="sm:col-span-2"><SettlementSummary {...capacity} currency={currency} /></div>}
    {value.method === 'check' && <p className="text-xs text-slate-500 sm:col-span-2">چک تا وصول‌شدن دریافت مؤثر محسوب نمی‌شود.</p>}
  </FieldGroup></fieldset>;
}
