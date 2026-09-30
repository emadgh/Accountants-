'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/analytics/chart-card';
import {
  ChartLegend,
  ChartTooltip,
  chartPalette,
  chartStyle,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatChartMoney, formatChartNumber, type TimeSeriesPoint } from '@/lib/chart-data';

const chartMargin = { top: 4, right: 8, bottom: 0, left: 0 };
const axisTick = { fontSize: 10, fill: chartStyle.axis };

function compactCategory(value: string) {
  return value.length > 17 ? `${value.slice(0, 16)}…` : value;
}

export type SalesPurchasePoint = TimeSeriesPoint & { sales: number; purchases: number };
export type DueCheckPoint = TimeSeriesPoint & { received: number; issued: number };

export function SalesPurchaseTrendChart({
  data,
  currency,
  series = ['sales', 'purchases'],
  title = 'روند فروش خالص و خرید خالص',
  description,
}: {
  data: SalesPurchasePoint[];
  currency: string;
  series?: Array<'sales' | 'purchases'>;
  title?: string;
  description?: string;
}) {
  const config: ChartConfig = {
    ...(series.includes('sales') ? { sales: { label: 'فروش خالص', color: chartPalette.sales } } : {}),
    ...(series.includes('purchases') ? { purchases: { label: 'خرید خالص', color: chartPalette.purchases } } : {}),
  };

  return (
    <ChartCard title={title} description={description} config={config} empty={!data.some((point) => series.some((key) => Number(point[key]) !== 0))}>
      <BarChart data={data} margin={chartMargin} barGap={3} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={chartStyle.grid} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} tickMargin={7} interval="preserveStartEnd" />
        <YAxis width={48} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <ChartTooltip valueFormatter={(value) => formatChartMoney(value, currency)} />
        {series.length > 1 && <ChartLegend />}
        {series.includes('sales') && <Bar dataKey="sales" name="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
        {series.includes('purchases') && <Bar dataKey="purchases" name="purchases" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
      </BarChart>
    </ChartCard>
  );
}

export function BalancesChart({ data, currency }: { data: Array<{ name: string; debtor: number; creditor: number }>; currency: string }) {
  const config: ChartConfig = {
    debtor: { label: 'بدهکار', color: chartPalette.debtor },
    creditor: { label: 'بستانکار', color: chartPalette.creditor },
  };
  const maxBalance = Math.max(1, ...data.map((row) => Math.max(Math.abs(row.debtor), Math.abs(row.creditor))));
  return (
    <ChartCard
      title="بیشترین مانده طرف حساب‌ها"
      description="حداکثر ۶ مورد بر اساس مانده پایان بازه؛ بدهکار و بستانکار در دو سوی صفر"
      config={config}
      size="regular"
      empty={!data.length}
    >
      <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ top: 2, right: 8, bottom: 0, left: 8 }} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke={chartStyle.grid} />
        <XAxis type="number" domain={[-maxBalance, maxBalance]} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <YAxis type="category" dataKey="name" orientation="right" width={112} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={compactCategory} interval={0} />
        <ChartTooltip valueFormatter={(value) => formatChartMoney(Math.abs(Number(value || 0)), currency)} />
        <ReferenceLine x={0} stroke={chartStyle.axis} strokeWidth={1} />
        <Bar dataKey="debtor" name="debtor" stackId="balance" fill="var(--color-debtor)" radius={[4, 4, 4, 4]} maxBarSize={18} />
        <Bar dataKey="creditor" name="creditor" stackId="balance" fill="var(--color-creditor)" radius={[4, 4, 4, 4]} maxBarSize={18} />
      </BarChart>
    </ChartCard>
  );
}

export function DueChecksChart({ data, currency }: { data: DueCheckPoint[]; currency: string }) {
  const config: ChartConfig = {
    received: { label: 'دریافتی در انتظار', color: chartPalette.received },
    issued: { label: 'پرداختی در انتظار', color: chartPalette.issued },
  };
  return (
    <ChartCard
      title="چک‌های در انتظار بر اساس سررسید"
      description="فقط چک‌های در انتظار؛ چک‌های سررسیدگذشته در کارت بالا جدا آمده‌اند"
      config={config}
      empty={!data.some((point) => point.received || point.issued)}
    >
      <BarChart data={data} margin={chartMargin} barGap={3} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={chartStyle.grid} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} tickMargin={7} interval="preserveStartEnd" />
        <YAxis width={48} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <ChartTooltip valueFormatter={(value) => formatChartMoney(value, currency)} />
        <ChartLegend />
        <Bar dataKey="received" name="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="issued" name="issued" fill="var(--color-issued)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartCard>
  );
}

export function InventoryValueChart({ data, currency }: { data: Array<{ name: string; value: number }>; currency: string }) {
  const config: ChartConfig = { value: { label: 'ارزش موجودی', color: chartPalette.inventory } };
  return (
    <ChartCard title="۱۰ کالای با بیشترین ارزش موجودی" description="موجودی تا پایان بازه × بهای میانگین ثبت‌شده" config={config} size="regular" empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 8, bottom: 0, left: 8 }} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke={chartStyle.grid} />
        <XAxis type="number" axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <YAxis type="category" dataKey="name" orientation="right" width={112} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={compactCategory} interval={0} />
        <ChartTooltip valueFormatter={(value) => formatChartMoney(value, currency)} />
        <Bar dataKey="value" name="value" fill="var(--color-value)" radius={[4, 4, 4, 4]} maxBarSize={18} />
      </BarChart>
    </ChartCard>
  );
}

export function LedgerBalanceChart({ data, currency }: { data: Array<{ label: string; balance: number }>; currency: string }) {
  const config: ChartConfig = { balance: { label: 'مانده تجمعی', color: chartPalette.balance } };
  return (
    <ChartCard title="روند مانده طرف حساب" description="از مانده ابتدای بازه با اعمال گردش‌های موثر" config={config} empty={data.length < 2}>
      <AreaChart data={data} margin={chartMargin} accessibilityLayer>
        <defs>
          <linearGradient id="ledgerBalanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={chartStyle.grid} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} tickMargin={7} interval="preserveStartEnd" />
        <YAxis width={48} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <ChartTooltip valueFormatter={(value) => formatChartMoney(value, currency)} />
        <Area type="stepAfter" dataKey="balance" name="balance" stroke="var(--color-balance)" strokeWidth={2} fill="url(#ledgerBalanceFill)" activeDot={{ r: 3 }} />
      </AreaChart>
    </ChartCard>
  );
}

export function CardexStockChart({
  data,
  unit,
}: {
  data: Array<{ label: string; stock: number; minimum: number }>;
  unit: string;
}) {
  const config: ChartConfig = {
    stock: { label: 'موجودی', color: chartPalette.balance },
    minimum: { label: 'حداقل موجودی', color: chartPalette.minimum },
  };
  return (
    <ChartCard title="روند موجودی کالا" description={`تغییر موجودی در بازه · واحد: ${unit || '—'} · خط حداقل فعلی`} config={config} empty={!data.length}>
      <LineChart data={data} margin={chartMargin} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={chartStyle.grid} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} tickMargin={7} interval="preserveStartEnd" />
        <YAxis width={42} axisLine={false} tickLine={false} tick={axisTick} tickFormatter={formatChartNumber} />
        <ChartTooltip valueFormatter={(value) => `${formatChartNumber(Number(value || 0))} ${unit || ''}`} />
        <ChartLegend />
        <Line type="stepAfter" dataKey="stock" name="stock" stroke="var(--color-stock)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        <Line type="linear" dataKey="minimum" name="minimum" stroke="var(--color-minimum)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} />
      </LineChart>
    </ChartCard>
  );
}
