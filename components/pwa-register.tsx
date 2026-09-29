'use client';

import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';

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
    {offline && <div className="screen-only fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xl" role="status" aria-live="polite"><WifiOff className="h-4 w-4" /> حالت آفلاین</div>}
    {installPrompt && !offline && <button type="button" onClick={() => void install()} className="screen-only fixed bottom-3 left-3 z-[100] flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-black text-sky-700 shadow-xl hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label="نصب برنامه روی دستگاه"><Download className="h-4 w-4" /> نصب برنامه</button>}
  </>;
}
