/* AIO-IPTV Service Worker (GitHub Pages, static) */
const CACHE_VERSION = 'aioiptv-v1.0.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './home_modern.css',
  './enhancements.css',
  './enhancements.js',
  './script_modern.js',
  './app_final.js',
  './manifest.json',
  './offline.html',
  './assets/logo-modern.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/brands/enigma2.svg',
  './assets/brands/openatv.svg',
  './assets/brands/openpli.svg',
  './assets/brands/egami.svg',
  './assets/brands/oscam.svg',
  './data/knowledge.json',
  './data/tools.json',
  './data/updates.json',
  './data/systems.json',
  './pliki/QR_buycoffee.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // HTML: network-first with offline fallback
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./offline.html')))
    );
    return;
  }

  // Other assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
      return res;
    }))
  );
});
