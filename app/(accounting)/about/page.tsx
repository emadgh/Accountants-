'use client';

import { Badge } from '@/components/ui/badge';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { capabilities } from '@/lib/app-features';
import packageInfo from '@/package.json';
import {
BadgeCheck,
Database,
Info
} from 'lucide-react';
import { motion,useReducedMotion } from 'motion/react';

const cardsContainerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { delayChildren: 0.05, staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.34, ease: 'easeOut' as const } },
};

export default function AboutPage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <div className="flex items-center gap-2 text-2xl font-black text-slate-900">
          <Info className="h-6 w-6 text-sky-600" /> دربارهٔ برنامه
        </div>
        <p className="mt-1 text-sm text-slate-500">فهرست امکانات نرم‌افزار حسابداری</p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-l from-sky-50 to-white p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/20">
              <Database className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">حسابداری</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                ابزار یکپارچه برای مدیریت فاکتورهای خدماتی و کالایی، پروژه‌ها، دریافت‌ها و هزینه‌های کسب‌وکار.
              </p>
            </div>
          </div>
          <Badge className="gap-1.5 border border-sky-200 bg-white px-3 py-1.5 text-sky-800">
            <BadgeCheck className="h-4 w-4" /> نسخهٔ {packageInfo.version}
          </Badge>
        </CardContent>
      </Card>

      <motion.div
        className="grid gap-4 sm:grid-cols-2"
        variants={cardsContainerVariants}
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
      >
        {capabilities.map(({ title, features, icon: Icon }) => (
          <motion.div key={title} variants={cardVariants}>
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc space-y-1.5 text-sm leading-6 text-slate-600 marker:text-sky-500">
                  {features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card>
        <CardHeader><CardTitle>ذخیره و پشتیبان‌گیری</CardTitle></CardHeader>
        <CardContent className="flex items-start gap-3 text-sm leading-6 text-slate-600">
          <Database className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
          <p>اطلاعات و پیوست‌ها در فضای ذخیره‌سازی سرور برنامه نگهداری می‌شوند. از بخش تنظیمات، نسخهٔ پشتیبان تهیه کنید و امکان بازیابی آن را بررسی کنید.</p>
        </CardContent>
      </Card>
    </div>
  );
}
