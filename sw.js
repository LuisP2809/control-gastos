const CACHE = 'mi-control-gasto-v21';
const CACHE_PREFIX = 'mi-control-gasto-';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './simple-money-v2.css',
  './manifest.webmanifest',
  './js/simple-money-v2.js',
  './js/db.js',
  './js/calculations.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable-512.svg',
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(async keys => {
    const outdated = keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE);
    await Promise.all(outdated.map(key => caches.delete(key)));
    if (outdated.length > 0) await self.clients.claim();
  })
));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy)));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
