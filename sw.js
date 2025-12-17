/* AIO-IPTV Service Worker (offline disabled) */
self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clear any previous caches
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Pass-through fetch: no offline fallback, no caching.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
