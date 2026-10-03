'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'انتخاب...',
  searchPlaceholder = 'جستجو...',
  emptyText = 'موردی پیدا نشد.',
  disabled = false,
  className,
  inputClassName,
  id: controlId,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fa');
    if (!needle) return options;
    return options.filter((option) =>
      [option.label, option.description, option.keywords]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fa')
        .includes(needle)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const choose = (option: SearchableOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0);
      return;
    }
    if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  return <div ref={rootRef} className={cn('relative', className)}>
    <div className="relative">
      <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        id={controlId || id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + '-listbox'}
        aria-activedescendant={open && filtered[activeIndex] ? id + '-option-' + activeIndex : undefined}
        disabled={disabled}
        className={cn('h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100', inputClassName)}
        value={open ? query : selected?.label || ''}
        placeholder={open ? searchPlaceholder : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="باز کردن فهرست"
        disabled={disabled}
        className="absolute left-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
          inputRef.current?.focus();
        }}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>
    </div>

    {open && !disabled && <div
      id={id + '-listbox'}
      role="listbox"
      className="absolute z-[80] mt-1 max-h-64 w-full min-w-[220px] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
    >
      {filtered.map((option, index) => <button
        type="button"
        id={id + '-option-' + index}
        role="option"
        aria-selected={option.value === value}
        key={option.value || '__empty'}
        className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-sm hover:bg-slate-50', activeIndex === index && 'bg-sky-50')}
        onMouseEnter={() => setActiveIndex(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{option.label}</span>
          {option.description && <span className="mt-0.5 block truncate text-[10px] text-slate-500">{option.description}</span>}
        </span>
        {option.value === value && <Check className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />}
      </button>)}
      {!filtered.length && <div className="px-3 py-8 text-center text-xs text-slate-400">{emptyText}</div>}
    </div>}
  </div>;
}
