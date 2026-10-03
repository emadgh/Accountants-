'use client';

import { CalendarDays } from 'lucide-react';
import DatePicker, { type DateObject } from 'react-multi-date-picker';
import { cn } from '@/lib/utils';
import {
  dateObjectToStorageDate,
  dateObjectsToStorageRange,
  jalaliCalendar,
  jalaliLocale,
  storageDateToDateObject,
  storageRangeToDateObjects,
  type StorageDateRange,
} from '@/lib/date-utils';

export interface JalaliDatePickerProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  className?: string;
  error?: string;
}

const baseInputClass = 'h-10 w-full rounded-xl border bg-white px-3 pl-9 text-sm text-slate-900 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  disabled = false,
  required = false,
  minDate,
  maxDate,
  className,
  error,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: JalaliDatePickerProps) {
  const pickerValue = storageDateToDateObject(value);

  return <div className={cn('w-full', className)} dir="rtl" aria-required={required || undefined}>
    <div className="relative w-full">
      <DatePicker
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={pickerValue || undefined}
        onChange={(selected) => {
          const storageValue = dateObjectToStorageDate(selected as DateObject | null);
          if (storageValue) onChange(storageValue);
        }}
        calendar={jalaliCalendar}
        locale={jalaliLocale}
        format="YYYY/MM/DD"
        calendarPosition="bottom-right"
        portal
        zIndex={220}
        editable
        disabled={disabled}
        minDate={storageDateToDateObject(minDate) || undefined}
        maxDate={storageDateToDateObject(maxDate) || undefined}
        placeholder={placeholder}
        containerClassName="w-full"
        inputClass={cn(
          baseInputClass,
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'
        )}
      />
      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
    {error ? <div className="mt-1 text-[11px] font-bold text-rose-600">{error}</div> : null}
  </div>;
}

export interface JalaliDateRangePickerProps {
  value: StorageDateRange;
  onChange: (value: StorageDateRange) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  className?: string;
  error?: string;
}

export function JalaliDateRangePicker({
  value,
  onChange,
  placeholder = 'انتخاب بازه تاریخ',
  disabled = false,
  required = false,
  minDate,
  maxDate,
  className,
  error,
}: JalaliDateRangePickerProps) {
  return <div className={cn('w-full', className)} dir="rtl" aria-required={required || undefined}>
    <div className="relative w-full">
      <DatePicker
        range
        value={storageRangeToDateObjects(value)}
        onChange={(selected) => {
          const values = Array.isArray(selected) ? selected as DateObject[] : [];
          const range = dateObjectsToStorageRange(values);
          if (range) onChange(range);
        }}
        calendar={jalaliCalendar}
        locale={jalaliLocale}
        format="YYYY/MM/DD"
        calendarPosition="bottom-right"
        rangeHover
        portal
        zIndex={220}
        editable
        disabled={disabled}
        minDate={storageDateToDateObject(minDate) || undefined}
        maxDate={storageDateToDateObject(maxDate) || undefined}
        placeholder={placeholder}
        containerClassName="w-full"
        inputClass={cn(
          baseInputClass,
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'
        )}
      />
      <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
    {error ? <div className="mt-1 text-[11px] font-bold text-rose-600">{error}</div> : null}
  </div>;
}
