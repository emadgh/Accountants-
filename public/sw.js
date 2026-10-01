const CACHE_NAME = 'accountants-shell-v3';
const CORE_URLS = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return false;
  return url.pathname.startsWith('/_next/static/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/icon.svg'
    || url.pathname === '/icon-maskable.svg';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => {
    try {
      return isCacheableAsset(new URL(url, self.location.origin));
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(urls.map(async (url) => {
        try {
          const request = new Request(url, { credentials: 'same-origin' });
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
        } catch {
          // A failed warmup does not block service worker activation.
        }
      }));
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Authenticated API responses must never enter the offline cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')) || Response.error())
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error())
  );
});
