'use client';

import * as React from 'react';
import {
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<string, { label: string; color: string }>;
export type ChartValueFormatter = (value: TooltipValueType | undefined) => React.ReactNode;

const ChartConfigContext = React.createContext<ChartConfig>({});

export const chartPalette = {
  sales: '#10b981',
  purchases: '#0ea5e9',
  debtor: '#f43f5e',
  creditor: '#10b981',
  received: '#0ea5e9',
  issued: '#f59e0b',
  inventory: '#8b5cf6',
  balance: '#0ea5e9',
  minimum: '#f59e0b',
} as const;

export const chartStyle = {
  grid: '#e2e8f0',
  axis: '#94a3b8',
  tooltipBackground: '#ffffff',
  tooltipBorder: '#e2e8f0',
} as const;

export const chartHeights = {
  compact: 188,
  regular: 218,
} as const;

export function ChartContainer({
  config,
  className,
  height = chartHeights.compact,
  children,
}: {
  config: ChartConfig;
  className?: string;
  height?: number;
  children: React.ReactElement;
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])
  ) as React.CSSProperties;

  return (
    <ChartConfigContext.Provider value={config}>
      <div
        dir="ltr"
        data-slot="chart"
        className={cn('w-full outline-none', className)}
        style={{ ...style, height }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {children}
        </ResponsiveContainer>
      </div>
    </ChartConfigContext.Provider>
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
}: Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & {
  valueFormatter?: ChartValueFormatter;
}) {
  const config = React.useContext(ChartConfigContext);

  if (!active || !payload?.length) return null;

  return (
    <div
      dir="rtl"
      className="min-w-32 rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: chartStyle.tooltipBackground, borderColor: chartStyle.tooltipBorder }}
    >
      {label !== undefined && <div className="mb-1.5 font-bold text-slate-700">{label}</div>}
      <div className="space-y-1.5">
        {payload.filter((item) => item.value !== undefined && item.value !== null).map((item, index) => {
          const key = String(item.dataKey ?? item.name ?? index);
          const value = item.value;
          const color = config[key]?.color || item.color || item.fill || '#64748b';
          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {config[key]?.label || item.name || key}
              </span>
              <span className="font-bold tabular-nums text-slate-800">
                {valueFormatter ? valueFormatter(value) : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartTooltip({
  valueFormatter,
}: {
  valueFormatter?: ChartValueFormatter;
}) {
  return (
    <Tooltip
      cursor={{ fill: 'rgba(15, 23, 42, .035)' }}
      content={(props) => <ChartTooltipContent {...props} valueFormatter={valueFormatter} />}
    />
  );
}

export function ChartLegend() {
  const config = React.useContext(ChartConfigContext);

  return (
    <Legend
      align="right"
      verticalAlign="top"
      height={28}
      iconSize={8}
      content={({ payload }) => (
        <div dir="rtl" className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1 px-2 text-[10px] text-slate-500">
          {payload?.map((item, index) => {
            const key = String(item.dataKey ?? item.value ?? index);
            const color = config[key]?.color || String(item.color || '#64748b');
            return (
              <span key={`${key}-${index}`} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {config[key]?.label || item.value || key}
              </span>
            );
          })}
        </div>
      )}
    />
  );
}
