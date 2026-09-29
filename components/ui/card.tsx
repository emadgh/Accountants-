import * as React from 'react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Panel padding="none" className={className} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-bold text-slate-900', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
