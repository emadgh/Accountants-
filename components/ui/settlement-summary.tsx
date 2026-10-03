import { money } from '@/lib/utils';
export function SettlementSummary({ outstanding, reserved, available, currency = '' }: { outstanding: number; reserved: number; available: number; currency?: string }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="خلاصه تسویه"><span>مانده: {money(outstanding)} {currency}</span>{reserved > 0 && <span className="text-amber-800">رزرو چک در انتظار: {money(reserved)}</span>}<span>ظرفیت دریافت / پرداخت: {money(available)}</span></div>;
}
