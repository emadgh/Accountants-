import * as React from 'react';
import { cn } from '@/lib/utils';
import { Panel, type PanelVariant } from '@/components/ui/panel';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlight?: boolean;
  interactive?: boolean;
  variant?: PanelVariant;
}

export function Card({ className, spotlight = true, interactive = true, variant = 'default', ...props }: CardProps) {
  return <Panel padding="none" variant={variant} spotlight={spotlight} interactive={interactive} className={className} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-bold text-slate-900 dark:text-slate-100', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-slate-500 dark:text-slate-400', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}
