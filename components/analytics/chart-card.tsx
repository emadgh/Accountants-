'use client';

import type { ReactElement } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, chartHeights, type ChartConfig } from '@/components/ui/chart';

export function ChartCard({
  title,
  description,
  config,
  children,
  empty,
  emptyMessage = 'در این بازه داده‌ای برای نمایش نمودار وجود ندارد.',
  size = 'compact',
}: {
  title: string;
  description?: string;
  config: ChartConfig;
  children: ReactElement;
  empty?: boolean;
  emptyMessage?: string;
  size?: keyof typeof chartHeights;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start justify-start space-y-1 border-0 p-4 pb-0">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {description && <CardDescription className="text-xs leading-5">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-1">
        {empty ? (
          <div style={{ height: chartHeights[size] }} className="flex items-center justify-center px-5 text-center text-xs text-slate-400">
            {emptyMessage}
          </div>
        ) : (
          <ChartContainer config={config} height={chartHeights[size]}>
            {children}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
