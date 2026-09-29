import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'حسابداری | مدیریت فاکتور و انبار',
  description: 'سامانه حسابداری تک‌صفحه‌ای با ذخیره‌سازی محلی مرورگر',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'حسابداری',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
