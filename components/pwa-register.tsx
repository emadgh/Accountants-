'use client';

import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaRegister() {
  const [offline, setOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const syncStatus = () => setOffline(!navigator.onLine);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);

    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          const worker = registration.active;
          if (!worker) return;

          const resources = performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => url.startsWith(window.location.origin));
          worker.postMessage({
            type: 'CACHE_URLS',
            urls: [window.location.href, ...resources],
          });
        })
        .catch(() => {
          // The application still works online if service worker registration is unavailable.
        });
    }

    return () => {
      window.removeEventListener('online', syncStatus);
      window.removeEventListener('offline', syncStatus);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return <>
    {offline && <Alert role="status" aria-live="polite" className="screen-only fixed bottom-3 left-1/2 z-[100] w-fit -translate-x-1/2 rounded-full border-slate-700 bg-slate-900 py-2 text-xs font-bold text-white shadow-xl [&>svg]:left-3 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:text-white [&>svg+div]:translate-y-0 [&>svg~*]:pl-6"><WifiOff className="size-4" aria-hidden="true" /><AlertDescription className="text-xs leading-none text-white">ارتباط قطع است؛ ثبت و ذخیره سند تا وصل‌شدن سرور ممکن نیست.</AlertDescription></Alert>}
    {installPrompt && !offline && <Button type="button" variant="outline" size="sm" onClick={() => void install()} className="screen-only fixed bottom-3 left-3 z-[100] rounded-full border-sky-200 bg-white px-4 py-2 text-xs font-black text-sky-700 shadow-xl hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-300" aria-label="نصب برنامه روی دستگاه"><Download className="size-4" aria-hidden="true" /> نصب برنامه</Button>}
  </>;
}
