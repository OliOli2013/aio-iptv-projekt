/* AIO-IPTV.pl PWA — Community First • 2026-08-16 */
const CACHE='aio-iptv-pro-20260816-community-first';
const CORE=[
  './assets/js/auto-language.js?v=20260729-auto-en1',
  './','./index.html','./community.html','./support.html','./downloads.html','./guides.html','./news.html','./plugins.html','./systems.html','./updates.html',
  './post.html','./profile.html','./community-admin.html','./community-rules.html','./privacy-community.html',
  './aio-connect-report.html','./assets/css/aio-connect-report.css?v=20260728-aio1','./assets/js/aio-connect-report.js?v=20260728-aio1',
  './studio.html','./ai-chat.html','./offline.html',
  './assets/css/user-premium.css?v=20260801-fundraiser1',
  './assets/css/user-premium.css?v=20260728-community10-aio-connect',
  './assets/css/pro-suite.css?v=20260728-community10-aio-connect',
  './assets/css/community.css?v=20260728-community10-aio-connect',
  './assets/css/aio-2026.css?v=20260816-community-first',
  './assets/js/user-premium.js?v=20260816-community-first',
  './assets/js/aio-experience.js?v=20260816-community-first',
  './assets/js/community-core.js?v=20260728-community10-aio-connect',
  './assets/js/community-feed.js?v=20260728-community10-aio-connect',
  './assets/js/community-post.js?v=20260728-community10-aio-connect','./assets/js/community-profile.js?v=20260728-community10-aio-connect','./assets/js/community-admin.js?v=20260728-community10-aio-connect',
  './data/community_config.json?v=20260728-community10-aio-connect',
  './assets/js/community-home.js?v=20260728-community10-aio-connect',
  './data/updates.json','./pliki/logo.png','./pliki/aio-iptv-zbiorka-celowa-2026.webp'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});
