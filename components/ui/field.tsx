'use client';
import { cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from 'react';

export function Field({ label, children, className = '', id, error, description }: { label: string; children: ReactNode; className?: string; id?: string; error?: string; description?: string }) {
  const generated = useId();
  const controlId = id || generated;
  const describedBy = [description ? `${controlId}-description` : '', error ? `${controlId}-error` : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { id: controlId, 'aria-invalid': !!error, 'aria-describedby': describedBy }) : children;
  return <label htmlFor={controlId} data-invalid={!!error || undefined} className={'flex flex-col gap-1.5 ' + className}>
    <span className="block text-xs font-bold text-slate-600">{label}</span>
    {control}
    {description && <span id={`${controlId}-description`} className="text-xs text-slate-500">{description}</span>}
    {error && <span id={`${controlId}-error`} role="alert" className="text-xs text-rose-600">{error}</span>}
  </label>;
}

export function FieldGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'grid gap-3 ' + className}>{children}</div>;
}
