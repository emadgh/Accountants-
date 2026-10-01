'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import './branched-menu.css';

export type BranchedMenuChild = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

export type BranchedMenuGroup = {
  id: string;
  label: string;
  collapsible?: boolean;
  children: readonly BranchedMenuChild[];
};

type BranchedMenuProps = {
  items: readonly BranchedMenuGroup[];
  activeValue: string;
  openSections: ReadonlySet<number>;
  onSelect: (value: string) => void;
  onToggle: (index: number) => void;
  className?: string;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
};

const PAD = 6;
const MARK = 16;

export function BranchedMenu({
  items,
  activeValue,
  openSections,
  onSelect,
  onToggle,
  className,
  color = '#d5e0eb',
  accentColor = '#69bce8',
  lineColor = 'rgba(148, 163, 184, .28)',
  rowHeight = 36,
  indent = 38,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 13,
  drawDuration = 400,
  foldDuration = 300,
}: BranchedMenuProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const heads = useRef<Array<HTMLButtonElement | HTMLDivElement | null>>([]);
  const markerRef = useRef<HTMLSpanElement>(null);

  const activeSection = items.findIndex((item) => item.children.some((child) => child.value === activeValue));
  const markerShown = activeSection >= 0 && openSections.has(activeSection);

  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const marker = markerRef.current;
      const heading = heads.current[activeSection];
      if (!marker) return;
      const on = markerShown && heading;
      if (!glide) marker.style.transition = 'none';
      if (on) marker.style.top = `${heading.offsetTop + (heading.offsetHeight - MARK) / 2}px`;
      marker.toggleAttribute('data-on', Boolean(on));
      if (!glide) {
        void marker.offsetHeight;
        marker.style.transition = '';
      }
    };

    place(true);
    let first = true;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (observer && navRef.current) observer.observe(navRef.current);
    return () => observer?.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const style = {
    '--bm-ink': color,
    '--bm-accent': accentColor,
    '--bm-line': lineColor,
    '--bm-font': `${fontSize}px`,
    '--bm-row': `${rowHeight}px`,
    '--bm-indent': `${indent}px`,
    '--bm-line-w': lineWidth,
    '--bm-draw': `${drawDuration}ms`,
    '--bm-fold': `${foldDuration}ms`,
  } as CSSProperties;

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (index: number) => PAD + index * rowHeight + rowHeight / 2;
  const branch = (index: number) => `M ${trunk} ${rowY(index) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(index)} H ${endX}`;
  const reach = (index: number) => `M ${trunk} 0 V ${rowY(index) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(index)} H ${endX}`;
  const length = (index: number) => rowY(index) - r + (Math.PI * r) / 2 + (endX - trunk - r);

  return (
    <div ref={navRef} className={cn('branched-menu', className)} style={style}>
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      {items.map((item, index) => {
        const isOpen = openSections.has(index);
        const collapsible = item.collapsible !== false;
        const contentId = `branched-menu-section-${item.id}`;
        const bodyHeight = PAD * 2 + item.children.length * rowHeight;

        return (
          <section key={item.id} className="branched-menu__section" data-open={isOpen ? '' : undefined}>
            {collapsible ? (
              <button
                ref={(element) => { heads.current[index] = element; }}
                type="button"
                className="branched-menu__head"
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => onToggle(index)}
              >
                <span>{item.label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', !isOpen && '-rotate-90')} />
              </button>
            ) : (
              <div ref={(element) => { heads.current[index] = element; }} className="branched-menu__static-head">
                {item.label}
              </div>
            )}
            <div id={contentId} className="branched-menu__body" aria-hidden={!isOpen}>
              <div className="branched-menu__fold">
                <div className="branched-menu__tree" style={{ height: bodyHeight }}>
                  <svg className="branched-menu__lines" width={indent} height={bodyHeight} aria-hidden="true">
                    <path className="branched-menu__base" d={`M ${trunk} 0 V ${rowY(item.children.length - 1) - r}`} />
                    {item.children.map((child, childIndex) => (
                      <path key={`base-${child.value}`} className="branched-menu__base" d={branch(childIndex)} />
                    ))}
                    {item.children.map((child, childIndex) => (
                      <path
                        key={`active-${child.value}`}
                        className="branched-menu__reach"
                        d={reach(childIndex)}
                        style={{
                          strokeDasharray: length(childIndex),
                          strokeDashoffset: child.value === activeValue ? 0 : length(childIndex),
                        }}
                      />
                    ))}
                  </svg>
                  {item.children.map((child) => {
                    const Icon = child.icon;
                    const isActive = child.value === activeValue;
                    return (
                      <button
                        key={child.value}
                        type="button"
                        className="branched-menu__item"
                        aria-current={isActive ? 'page' : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => onSelect(child.value)}
                      >
                        {Icon && <Icon className="branched-menu__icon h-4 w-4" aria-hidden="true" />}
                        <span className="branched-menu__label">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
