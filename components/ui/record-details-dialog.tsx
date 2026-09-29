'use client';

import type { ReactNode } from 'react';
import { Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type RecordDetailField = {
  label: string;
  value: ReactNode;
  className?: string;
};

export function RecordDetailsDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  children,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: RecordDetailField[];
  children?: ReactNode;
  onEdit?: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="text-lg font-black">{title}</DialogTitle>
        {description && <DialogDescription className="text-sm leading-6 text-slate-500">{description}</DialogDescription>}
      </DialogHeader>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => <div key={field.label} className={'min-w-0 rounded-xl bg-slate-50 px-3 py-2 ' + (field.className || '')}>
          <dt className="text-[11px] font-bold text-slate-500">{field.label}</dt>
          <dd className="mt-1 break-words text-sm font-bold text-slate-900">{field.value || '—'}</dd>
        </div>)}
      </dl>
      {children}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>بستن</Button>
        {onEdit && <Button onClick={onEdit}><Edit3 className="h-4 w-4" /> ویرایش</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
