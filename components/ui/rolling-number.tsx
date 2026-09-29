'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import styles from './rolling-number.module.css';

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
  const formatted = React.useMemo(
    () => new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      ...formatOptions,
    }).format(Number.isFinite(value) ? value : 0),
    [formatOptions, locale, value]
  );
  const digitSystem = React.useMemo(
    () => Array.from({ length: 10 }, (_, digit) =>
      new Intl.NumberFormat(locale, { useGrouping: false }).format(digit)
    ),
    [locale]
  );
  const characters = React.useMemo(() => Array.from(formatted), [formatted]);
  const totalDigits = characters.reduce((count, character) => count + Number(digitSystem.includes(character)), 0);

  const readablePrefix = typeof prefix === 'string' || typeof prefix === 'number' ? String(prefix) : '';
  const readableSuffix = typeof suffix === 'string' || typeof suffix === 'number' ? String(suffix) : '';
  const label = ariaLabel || [readablePrefix, formatted, readableSuffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const minWidth = reserveCharacters
    ? `min(${Math.max(reserveCharacters, 1)}ch, 100%)`
    : undefined;

  let seenDigits = 0;

  return (
    <span
      dir="ltr"
      aria-label={label || formatted}
      className={cn('inline-flex max-w-full items-baseline whitespace-nowrap tabular-nums', className)}
      style={{ minWidth, ...style }}
      {...props}
    >
      {prefix ? <span aria-hidden="true" className="me-1">{prefix}</span> : null}

      <span aria-hidden="true" className={styles.group}>
        {characters.map((character, index) => {
          const digit = digitSystem.indexOf(character);
          if (digit >= 0) {
            const positionFromRight = totalDigits - seenDigits - 1;
            seenDigits += 1;
            return (
              <span key={`digit-${positionFromRight}`} className={styles.window}>
                <span
                  className={styles.strip}
                  style={{
                    transform: `translateY(-${digit * 10}%)`,
                    transitionDuration: rolling ? `${Math.max(0, durationMs)}ms` : '0ms',
                  }}
                >
                  {digitSystem.map((systemDigit, digitIndex) => (
                    <span key={digitIndex} className={styles.digit}>{systemDigit}</span>
                  ))}
                </span>
              </span>
            );
          }

          return <span key={`symbol-${index}`} className={styles.symbol}>{character}</span>;
        })}
      </span>

      {suffix ? <span aria-hidden="true" className="ms-1">{suffix}</span> : null}
    </span>
  );
}
