'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TableDensity } from '@/components/ui/data-table';

const TableDensityContext = createContext<TableDensity>('normal');

export function TableDensityProvider({ value, children }: { value: TableDensity; children: ReactNode }) {
  return <TableDensityContext.Provider value={value}>{children}</TableDensityContext.Provider>;
}

export function useTableDensity() {
  return useContext(TableDensityContext);
}
