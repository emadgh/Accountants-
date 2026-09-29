'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function PwaRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const syncStatus = () => setOffline(!navigator.onLine);
    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);

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
    };
  }, []);

  return offline ? <div className="screen-only fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xl" role="status" aria-live="polite"><WifiOff className="h-4 w-4" /> حالت آفلاین</div> : null;
}
