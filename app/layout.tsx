import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/components/pwa-register';
import { FeedbackHost } from '@/components/feedback-host';
import { LiquidEtherBackground } from '@/components/react-bits/liquid-ether-background';
import { PageTransition } from '@/components/page-transition';
import '@fontsource-variable/vazirmatn';
import './globals.css';

export const metadata: Metadata = {
  title: 'حسابداری | مدیریت فاکتور و انبار',
  description: 'سامانه حسابداری فارسی با ذخیره‌سازی محلی SQLite',
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
      <body>
        <LiquidEtherBackground />
        <div className="app-content"><PageTransition>{children}</PageTransition><FeedbackHost /><PwaRegister /></div>
      </body>
    </html>
  );
}
