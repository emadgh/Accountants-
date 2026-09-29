'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { RollingNumber } from '@/components/ui/rolling-number';

export type MetricTone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
export type MetricDirection = 'up' | 'down' | 'neutral';
export type MetricSize = 'sm' | 'md' | 'lg';
export type MetricAlignment = 'start' | 'center' | 'end';

export interface MetricCardProps {
  title: React.ReactNode;
  value: number | string;
  formattedValue?: string;
  subtitle?: React.ReactNode;
  unit?: React.ReactNode;
  icon?: React.ReactNode | React.ElementType<{ className?: string }>;
  tone?: MetricTone;
  direction?: MetricDirection;
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  rolling?: boolean;
  loading?: boolean;
  size?: MetricSize;
  align?: MetricAlignment;
  spotlight?: boolean;
  className?: string;
  valueClassName?: string;
  ariaLabel?: string;
}

const toneStyles: Record<MetricTone, { icon: string; value: string }> = {
  neutral: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-950' },
  primary: { icon: 'bg-blue-50 text-blue-600', value: 'text-blue-950' },
  success: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-800' },
  danger: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-800' },
  warning: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-900' },
  info: { icon: 'bg-sky-50 text-sky-600', value: 'text-sky-900' },
  purple: { icon: 'bg-violet-50 text-violet-600', value: 'text-violet-900' },
};

const sizeStyles: Record<MetricSize, { panel: string; title: string; value: string; icon: string; reserve: number }> = {
  sm: { panel: 'p-4', title: 'text-xs', value: 'text-xl', icon: 'h-9 w-9', reserve: 6 },
  md: { panel: 'p-5', title: 'text-sm', value: 'text-2xl', icon: 'h-10 w-10', reserve: 14 },
  lg: { panel: 'p-6 sm:p-7', title: 'text-sm', value: 'text-3xl', icon: 'h-11 w-11', reserve: 14 },
};

const alignStyles: Record<MetricAlignment, string> = {
  start: 'items-start text-start',
  center: 'items-center text-center',
  end: 'items-end text-end',
};

function splitDisplayValue(input: string) {
  const match = input.match(/[+-]?\d[\d,]*(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;

  const numeric = Number(match[0].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;

  return {
    numeric,
    prefix: input.slice(0, match.index).trim(),
    suffix: input.slice(match.index + match[0].length).trim(),
  };
}

function iconNode(icon: MetricCardProps['icon']) {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Icon = icon as React.ElementType<{ className?: string }>;
  return <Icon className="h-5 w-5" />;
}

function DirectionIndicator({ direction }: { direction: MetricDirection }) {
  const config = direction === 'up'
    ? { Icon: ArrowUpRight, label: 'روند افزایشی', className: 'text-emerald-600' }
    : direction === 'down'
      ? { Icon: ArrowDownRight, label: 'روند کاهشی', className: 'text-rose-600' }
      : { Icon: Minus, label: 'بدون تغییر', className: 'text-slate-400' };

  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold', config.className)} aria-label={config.label}>
      <config.Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  );
}

export function MetricCard({
  title,
  value,
  formattedValue,
  subtitle,
  unit,
  icon,
  tone = 'neutral',
  direction,
  meta,
  footer,
  rolling = true,
  loading = false,
  size = 'md',
  align = 'start',
  spotlight = true,
  className,
  valueClassName,
  ariaLabel,
}: MetricCardProps) {
  const styles = sizeStyles[size];
  const semantic = toneStyles[tone];
  const sourceText = formattedValue ?? (typeof value === 'string' ? value : '');
  const parsed = sourceText ? splitDisplayValue(sourceText) : null;

  let numericValue: number | null = null;
  let numericPrefix: React.ReactNode = null;
  let numericSuffix: React.ReactNode = unit || null;

  if (typeof value === 'number') {
    numericValue = value;
    if (parsed) {
      numericPrefix = parsed.prefix || null;
      numericSuffix = [parsed.suffix, unit].filter(Boolean).join(' ') || null;
    }
  } else if (parsed) {
    numericValue = parsed.numeric;
    numericPrefix = parsed.prefix || null;
    numericSuffix = [parsed.suffix, unit].filter(Boolean).join(' ') || null;
  }

  const staticValue = formattedValue ?? String(value);
  const preserveStaticFormatting = !rolling && (formattedValue !== undefined || typeof value === 'string');
  const useNumericRenderer = numericValue !== null && !preserveStaticFormatting;

  return (
    <Panel
      padding="none"
      spotlight={spotlight}
      interactive
      className={cn('h-full', className)}
    >
      <div className={cn('flex h-full min-w-0 flex-col gap-3', styles.panel, alignStyles[align])}>
        <div className="flex w-full min-w-0 items-start justify-between gap-3">
          {icon ? (
            <div aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-xl', styles.icon, semantic.icon)}>
              {iconNode(icon)}
            </div>
          ) : <span />}
          <div className="min-w-0 text-xs text-slate-400">{meta}</div>
        </div>

        <div className="min-w-0">
          <div className={cn('font-bold text-slate-500', styles.title)}>{title}</div>

          {loading ? (
            <div className="mt-2 space-y-2" aria-label="در حال بارگذاری">
              <div className="h-7 w-2/3 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
            </div>
          ) : (
            <div className={cn('mt-2 flex max-w-full min-w-0 items-baseline gap-1.5 overflow-hidden font-black tracking-tight leading-tight', styles.value, semantic.value, valueClassName)}>
              {useNumericRenderer ? (
                <RollingNumber
                  value={numericValue!}
                  prefix={numericPrefix}
                  suffix={numericSuffix}
                  rolling={rolling}
                  reserveCharacters={styles.reserve}
                  ariaLabel={ariaLabel || (typeof value === 'string' || formattedValue ? staticValue : undefined)}
                  className="min-w-0"
                />
              ) : (
                <span aria-label={ariaLabel || staticValue} className="min-w-0 max-w-full break-words">{staticValue}</span>
              )}
              {direction ? <DirectionIndicator direction={direction} /> : null}
            </div>
          )}

          {subtitle ? <div className="mt-1 text-[11px] leading-5 text-slate-400">{subtitle}</div> : null}
        </div>

        {footer ? <div className="mt-auto w-full border-t border-slate-100 pt-3 text-xs text-slate-500">{footer}</div> : null}
      </div>
    </Panel>
  );
}
