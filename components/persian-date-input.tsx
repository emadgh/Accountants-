'use client';

import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatPersianDate, persianInputToIso, toEnglishDigits, todayIso } from '@/lib/standards';
import { Button } from '@/components/ui/button';

export function PersianDateInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
}) {
  const current = useMemo(() => {
    const text = toEnglishDigits(formatPersianDate(value || todayIso()));
    const match = text.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    return {
      year: Number(match?.[1] || 1405),
      month: Number(match?.[2] || 1),
      day: Number(match?.[3] || 1),
    };
  }, [value]);

  const years = Array.from({ length: 101 }, (_, index) => current.year - 80 + index);
  const maxDay = current.month <= 6 ? 31 : current.month <= 11 ? 30 : 30;

  const setPart = (part: 'year' | 'month' | 'day', nextValue: number) => {
    const next = { ...current, [part]: nextValue };
    let day = next.day;
    const roughMax = next.month <= 6 ? 31 : next.month <= 11 ? 30 : 30;
    day = Math.min(day, roughMax);

    for (let candidate = day; candidate >= 1; candidate--) {
      const raw = next.year + '/' + String(next.month).padStart(2, '0') + '/' + String(candidate).padStart(2, '0');
      const iso = persianInputToIso(raw);
      if (iso && toEnglishDigits(formatPersianDate(iso)) === raw) {
        onChange(iso);
        return;
      }
    }
  };

  return <div className="flex items-center gap-1" dir="rtl">
    <select disabled={disabled} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100" value={current.year} onChange={(event) => setPart('year', Number(event.target.value))}>
      {years.map((year) => <option key={year} value={year}>{year}</option>)}
    </select>
    <span className="text-slate-400">/</span>
    <select disabled={disabled} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100" value={current.month} onChange={(event) => setPart('month', Number(event.target.value))}>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{String(month).padStart(2, '0')}</option>)}
    </select>
    <span className="text-slate-400">/</span>
    <select disabled={disabled} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-100" value={Math.min(current.day, maxDay)} onChange={(event) => setPart('day', Number(event.target.value))}>
      {Array.from({ length: maxDay }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{String(day).padStart(2, '0')}</option>)}
    </select>
    <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => onChange(todayIso())} title="امروز">
      <CalendarDays className="h-4 w-4" />
    </Button>
  </div>;
}
