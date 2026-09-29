'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { cn } from '@/lib/utils';

export function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      dir="rtl"
      theme="light"
      position="bottom-left"
      richColors
      closeButton
      className={cn('toaster group', className)}
      toastOptions={{
        classNames: {
          toast: 'group toast border-slate-200 bg-white text-slate-950 shadow-lg',
          description: 'text-slate-500',
          actionButton: 'bg-slate-900 text-white',
          cancelButton: 'bg-slate-100 text-slate-600',
        },
      }}
      {...props}
    />
  );
}