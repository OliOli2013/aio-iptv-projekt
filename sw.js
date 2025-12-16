// sw.js - Service Worker dla trybu offline

const CACHE_NAME = 'aio-iptv-v3-fix1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './home.css',
  './enhancements.css',
  './script.js',
  './script_modern.js',
  './enhancements.js',
  './pliki/logo.png'
];

// Instalacja Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: Instalacja');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Aktywacja i usuwanie starych cache
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Aktywacja');
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
      })
    )).then(() => self.clients.claim())
  );
});

// Interceptowanie requestów
self.addEventListener('fetch', event => {
  // Pomiń requesty do zewnętrznych API
  if (event.request.url.includes('api.') ||
      event.request.url.includes('analytics') ||
      event.request.url.includes('googletagmanager') ||
      event.request.url.includes('google-analytics') ||
      event.request.url.includes('gtag/js')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;

      return fetch(event.request).then(netResponse => {
        if (!netResponse || netResponse.status !== 200 || netResponse.type !== 'basic') return netResponse;

        const responseToCache = netResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return netResponse;
      }).catch(() => {
        if (event.request.destination === 'document') return caches.match('./index.html');

        if (event.request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" font-family="Arial" font-size="14" fill="#94a3b8" text-anchor="middle" dy=".3em">AIO-IPTV</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      });
    })
  );
});
