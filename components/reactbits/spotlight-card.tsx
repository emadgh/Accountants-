'use client';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const [p, setP] = useState({ x: 50, y: 50 });
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setP({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  return <div onMouseMove={move} className={cn('relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
    <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(420px circle at ${p.x}% ${p.y}%, rgba(14,165,233,.10), transparent 45%)` }} />
    <div className="relative">{children}</div>
  </div>;
}
