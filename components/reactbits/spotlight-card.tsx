'use client';

import type { ReactNode } from 'react';
import { Panel } from '@/components/ui/panel';

export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Panel padding="none" spotlight interactive className={className}>{children}</Panel>;
}
