'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

let rollingNumberModulePromise: Promise<unknown> | null = null;

function ensureRollingNumberModule() {
  if (!rollingNumberModulePromise) {
    rollingNumberModulePromise = import('@layflags/rolling-number');
  }
  return rollingNumberModulePromise;
}

export interface RollingNumberProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'prefix'> {
  value: number;
  locale?: string;
  formatOptions?: Intl.NumberFormatOptions;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  rolling?: boolean;
  durationMs?: number;
  reserveCharacters?: number;
  ariaLabel?: string;
}

export function RollingNumber({
  value,
  locale = 'en-US',
  formatOptions,
  prefix,
  suffix,
  rolling = true,
  durationMs = 520,
  reserveCharacters,
  ariaLabel,
  className,
  style,
  ...props
}: RollingNumberProps) {
  const [ready, setReady] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener?.('change', syncMotion);

    let active = true;
    if (rolling) {
      ensureRollingNumberModule()
        .then(() => {
          if (active) setReady(true);
        })
        .catch(() => {
          if (active) setReady(false);
        });
    }

    return () => {
      active = false;
      media.removeEventListener?.('change', syncMotion);
    };
  }, [rolling]);

  const formatted = React.useMemo(
    () => new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      ...formatOptions,
    }).format(Number.isFinite(value) ? value : 0),
    [formatOptions, locale, value]
  );

  const chars = React.useMemo(() => formatted.split(''), [formatted]);
  const totalDigits = chars.reduce((sum, char) => sum + (/\d/.test(char) ? 1 : 0), 0);
  let seenDigits = 0;

  const readablePrefix = typeof prefix === 'string' || typeof prefix === 'number' ? String(prefix) : '';
  const readableSuffix = typeof suffix === 'string' || typeof suffix === 'number' ? String(suffix) : '';
  const label = ariaLabel || [readablePrefix, formatted, readableSuffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const minWidth = reserveCharacters
    ? `min(${Math.max(reserveCharacters, 1)}ch, 100%)`
    : undefined;

  return (
    <span
      dir="ltr"
      aria-label={label || formatted}
      className={cn('inline-flex max-w-full items-baseline whitespace-nowrap tabular-nums', className)}
      style={{ minWidth, ...style }}
      {...props}
    >
      {prefix ? <span aria-hidden="true" className="me-1">{prefix}</span> : null}

      <span aria-hidden="true" className="inline-flex items-baseline">
        {chars.map((char) => {
          if (/\d/.test(char)) {
            const positionFromRight = totalDigits - seenDigits - 1;
            seenDigits += 1;
            const key = `digit-${positionFromRight}`;

            if (rolling && ready && !reducedMotion) {
              return (
                <layflags-rolling-number
                  key={key}
                  value={char}
                  style={{ '--roll-duration': `${durationMs}ms` } as React.CSSProperties}
                />
              );
            }

            return <span key={key}>{char}</span>;
          }

          const key = `symbol-${char}-${totalDigits - seenDigits}`;
          return <span key={key}>{char}</span>;
        })}
      </span>

      {suffix ? <span aria-hidden="true" className="ms-1">{suffix}</span> : null}
    </span>
  );
}
