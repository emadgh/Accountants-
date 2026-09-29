import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import persian from 'react-date-object/calendars/persian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import persian_fa from 'react-date-object/locales/persian_fa';
import { normalizeStoredDate } from '@/lib/standards';

export const jalaliCalendar = persian;
export const jalaliLocale = persian_fa;

export function storageDateToDateObject(value?: string | null) {
  if (!value) return null;

  const normalized = normalizeStoredDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new DateObject({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    calendar: gregorian,
    locale: gregorian_en,
  });

  return date.convert(persian, persian_fa);
}

export function dateObjectToStorageDate(value?: DateObject | null) {
  if (!value) return null;
  return new DateObject(value).convert(gregorian, gregorian_en).format('YYYY-MM-DD');
}

export function storageDateToJalaliText(value?: string | null) {
  const date = storageDateToDateObject(value);
  return date ? date.format('YYYY/MM/DD') : '';
}

export type StorageDateRange = {
  from: string;
  to: string;
};

export function storageRangeToDateObjects(range: StorageDateRange) {
  return [
    storageDateToDateObject(range.from),
    storageDateToDateObject(range.to),
  ].filter((value): value is DateObject => Boolean(value));
}

export function dateObjectsToStorageRange(values: DateObject[]): StorageDateRange | null {
  if (!values.length) return null;
  const from = dateObjectToStorageDate(values[0]);
  const to = dateObjectToStorageDate(values[1] || values[0]);
  return from && to ? { from, to } : null;
}
