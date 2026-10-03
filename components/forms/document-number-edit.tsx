'use client';
import { FormattedInput } from '@/components/ui/formatted-input';
import { money } from '@/lib/utils';

export function NumberEdit({ value, onChange, formatted = false, invoiceStyle = true, label }: { value: number; onChange: (v: number) => void; formatted?: boolean; invoiceStyle?: boolean; label?: string }) {
  return <><FormattedInput aria-label={label} dir="ltr" min={0} unstyled={invoiceStyle} className={invoiceStyle ? 'screen-editor invoice-inline-input text-center' : undefined} value={value} onValueChange={onChange} />{invoiceStyle && <span className="print-only" dir="ltr">{formatted ? money(value) : value}</span>}</>;
}
