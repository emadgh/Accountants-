import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export type DataTableProps = ComponentPropsWithoutRef<'table'>;
export type TableDensity = 'normal' | 'condensed' | 'extra-condensed';

export function DataTable({ className, ...props }: DataTableProps) {
  return <table className={cn('app-data-table', className)} {...props} />;
}
