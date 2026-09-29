'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type PanelVariant = 'default' | 'subtle' | 'elevated' | 'dark';
export type PanelPadding = 'none' | 'sm' | 'md' | 'lg';

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  padding?: PanelPadding;
  spotlight?: boolean;
  interactive?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
}

const variants: Record<PanelVariant, string> = {
  default: 'border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90',
  subtle: 'border-slate-200/70 bg-slate-50/85 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85',
  elevated: 'border-slate-200/80 bg-white/90 shadow-lg shadow-slate-950/5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-black/20',
  dark: 'border-slate-800/80 bg-slate-950/90 text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl',
};

const paddings: Record<PanelPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6 sm:p-7',
};

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    children,
    className,
    variant = 'default',
    padding = 'md',
    spotlight = true,
    interactive = true,
    header,
    footer,
    contentClassName,
    onPointerMove,
    onPointerLeave,
    ...props
  },
  forwardedRef
) {
  const localRef = React.useRef<HTMLDivElement | null>(null);

  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (!spotlight || event.pointerType === 'touch') return;

    const node = localRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    node.style.setProperty('--panel-spot-x', `${event.clientX - rect.left}px`);
    node.style.setProperty('--panel-spot-y', `${event.clientY - rect.top}px`);
  }, [onPointerMove, spotlight]);

  const handlePointerLeave = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    const node = localRef.current;
    if (!node) return;
    node.style.removeProperty('--panel-spot-x');
    node.style.removeProperty('--panel-spot-y');
  }, [onPointerLeave]);

  return (
    <div
      ref={setRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'group/panel relative overflow-hidden rounded-2xl border',
        variants[variant],
        interactive && 'transition-[border-color,box-shadow,transform] duration-200 hover:border-sky-200/80 hover:shadow-md dark:hover:border-sky-800/80 motion-reduce:transition-none',
        className
      )}
      {...props}
    >
      {spotlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/panel:opacity-100 motion-reduce:transition-none"
          style={{
            background: 'radial-gradient(420px circle at var(--panel-spot-x, 50%) var(--panel-spot-y, 50%), rgba(14,165,233,.10), transparent 45%)',
          }}
        />
      )}

      <div className="relative z-[1]">
        {header ? <div className="border-b border-slate-100 px-5 py-4">{header}</div> : null}
        <div className={cn(paddings[padding], contentClassName)}>{children}</div>
        {footer ? <div className="border-t border-slate-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
});

Panel.displayName = 'Panel';
