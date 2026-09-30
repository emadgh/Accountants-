import { formatPersianDate, jalaliDateParts, jalaliMonthStartIso, normalizeStoredDate, toPersianDigits } from './standards';

const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

export type ChartBucketMode = 'day' | 'week' | 'month';
export type TimeSeriesPoint = { key: string; label: string } & Record<string, string | number>;

function isoDate(date: Date) {
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}

function utcDate(value: string) {
  const normalized = normalizeStoredDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function monthOrdinal(value: string) {
  const parts = jalaliDateParts(value);
  return parts ? parts.jy * 12 + parts.jm - 1 : null;
}

function monthLabel(year: number, month: number) {
  return `${persianMonths[month - 1]} ${toPersianDigits(String(year).slice(-2))}`;
}

function dateBucket(value: string, mode: ChartBucketMode) {
  const normalized = normalizeStoredDate(value);
  const date = utcDate(normalized);
  if (!date) return null;

  if (mode === 'month') {
    const parts = jalaliDateParts(normalized);
    if (!parts) return null;
    return {
      key: `${parts.jy}-${String(parts.jm).padStart(2, '0')}`,
      label: monthLabel(parts.jy, parts.jm),
    };
  }

  if (mode === 'week') {
    const dayOffset = (date.getUTCDay() + 1) % 7;
    date.setUTCDate(date.getUTCDate() - dayOffset);
    const start = isoDate(date);
    return { key: start, label: formatPersianDate(start).slice(-5) };
  }

  return { key: normalized, label: formatPersianDate(normalized).slice(-5) };
}

export function selectChartBucketMode(fromDate: string, toDate: string): ChartBucketMode {
  const from = utcDate(fromDate);
  const to = utcDate(toDate);
  if (!from || !to) return 'month';
  const days = Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
  return days <= 45 ? 'day' : days <= 180 ? 'week' : 'month';
}

export function buildTimeSeries<T extends { date: string }>(
  fromDate: string,
  toDate: string,
  records: readonly T[],
  seriesKeys: readonly string[],
  getValues: (record: T) => Partial<Record<string, number>>,
): TimeSeriesPoint[] {
  const normalizedFrom = normalizeStoredDate(fromDate);
  const normalizedTo = normalizeStoredDate(toDate);
  const from = utcDate(normalizedFrom);
  const to = utcDate(normalizedTo);
  if (!from || !to || normalizedFrom > normalizedTo) return [];

  const mode = selectChartBucketMode(normalizedFrom, normalizedTo);
  const points: TimeSeriesPoint[] = [];

  if (mode === 'month') {
    const first = monthOrdinal(normalizedFrom);
    const last = monthOrdinal(normalizedTo);
    if (first === null || last === null) return [];
    for (let ordinal = first; ordinal <= last; ordinal += 1) {
      const year = Math.floor(ordinal / 12);
      const month = ordinal % 12 + 1;
      points.push({ key: `${year}-${String(month).padStart(2, '0')}`, label: monthLabel(year, month) });
    }
  } else {
    let cursor = new Date(from);
    if (mode === 'week') cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 1) % 7));
    const step = mode === 'week' ? 7 : 1;
    while (cursor <= to) {
      const date = isoDate(cursor);
      const bucket = dateBucket(date, mode);
      if (bucket && points.at(-1)?.key !== bucket.key) points.push({ ...bucket });
      cursor.setUTCDate(cursor.getUTCDate() + step);
    }
  }

  for (const point of points) for (const key of seriesKeys) point[key] = 0;
  const pointByKey = new Map(points.map((point) => [point.key, point]));

  for (const record of records) {
    const date = normalizeStoredDate(record.date);
    if (date < normalizedFrom || date > normalizedTo) continue;
    const bucket = dateBucket(date, mode);
    const point = bucket ? pointByKey.get(bucket.key) : undefined;
    if (!point) continue;
    const values = getValues(record);
    for (const key of seriesKeys) point[key] = Number(point[key] || 0) + Number(values[key] || 0);
  }

  return points;
}

export function lastJalaliMonthsRange(endDate: string, monthCount: number) {
  const end = normalizeStoredDate(endDate);
  const ordinal = monthOrdinal(end);
  if (ordinal === null) return { fromDate: end, toDate: end };
  const firstOrdinal = ordinal - Math.max(1, monthCount) + 1;
  const year = Math.floor(firstOrdinal / 12);
  const month = firstOrdinal % 12 + 1;
  return { fromDate: jalaliMonthStartIso(year, month), toDate: end };
}

export function formatChartNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${toPersianDigits((value / 1_000_000_000).toFixed(1))} میلیارد`;
  if (absolute >= 1_000_000) return `${toPersianDigits((value / 1_000_000).toFixed(1))} م`;
  if (absolute >= 10_000) return `${toPersianDigits(Math.round(value / 1_000))} ه`;
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(value);
}

export function formatChartMoney(value: unknown, currency: string) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}
