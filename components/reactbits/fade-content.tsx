'use client';
import type { ReactNode } from 'react';
export function FadeContent({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <div className="animate-fade-up" style={{ animationDelay: `${delay}ms` }}>{children}</div>;
}
