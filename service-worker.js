/* AIO-IPTV.pl — wycofanie starego cache PWA, 2026-10-10
   Serwis nie rejestruje już Service Workera. Ten plik służy wyłącznie
   do bezpiecznego usunięcia wcześniejszych cache i rejestracji u powracających użytkowników.
*/
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => /^aio-iptv-/i.test(key))
        .map(key => caches.delete(key)));
    } catch (_) {}

    try {
      await self.registration.unregister();
    } catch (_) {}

    try {
      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      for (const client of clients) {
        client.postMessage({type:'AIO_SERVICE_WORKER_RETIRED'});
      }
    } catch (_) {}
  })());
});
