import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'حسابداری | مدیریت فاکتور و انبار',
  description: 'سامانه حسابداری تک‌صفحه‌ای با ذخیره‌سازی محلی مرورگر',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
