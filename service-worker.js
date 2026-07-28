/* AIO-IPTV.pl PWA — community10-aio-connect 2026-07-28 */
const CACHE='aio-iptv-pro-20260728-community10-aio-connect';
const CORE=[
  './','./index.html','./downloads.html','./plugins.html','./guides.html','./systems.html',
  './community.html','./post.html','./profile.html','./news.html','./community-admin.html','./community-rules.html','./privacy-community.html',
  './aio-connect-report.html','./assets/css/aio-connect-report.css?v=20260728-aio1','./assets/js/aio-connect-report.js?v=20260728-aio1',
  './studio.html','./ai-chat.html','./offline.html',
  './assets/css/user-premium.css?v=20260728-community10-aio-connect',
  './assets/css/pro-suite.css?v=20260728-community10-aio-connect',
  './assets/css/community.css?v=20260728-community10-aio-connect',
  './assets/js/user-premium.js?v=20260728-community10-aio-connect',
  './assets/js/community-core.js?v=20260728-community10-aio-connect',
  './assets/js/community-feed.js?v=20260728-community10-aio-connect',
  './assets/js/community-post.js?v=20260728-community10-aio-connect','./assets/js/community-profile.js?v=20260728-community10-aio-connect','./assets/js/community-admin.js?v=20260728-community10-aio-connect',
  './data/community_config.json?v=20260728-community10-aio-connect',
  './assets/js/community-home.js?v=20260728-community10-aio-connect',
  './pliki/logo.png'
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
