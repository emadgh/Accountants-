import type { ReactNode } from 'react';

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={'space-y-1.5 ' + className}>
    <span className="block text-xs font-bold text-slate-600">{label}</span>
    {children}
  </label>;
}
