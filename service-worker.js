/* AIO-IPTV.pl PWA — community2 */
const CACHE='aio-iptv-pro-20260725-community2';
const CORE=[
  './','./index.html','./downloads.html','./plugins.html','./guides.html','./systems.html',
  './community.html','./news.html','./community-rules.html','./privacy-community.html',
  './studio.html','./ai-chat.html','./offline.html',
  './assets/css/user-premium.css?v=20260724-v14',
  './assets/css/pro-suite.css?v=20260724-pro3',
  './assets/css/community.css?v=20260725-community2',
  './assets/js/user-premium.js?v=20260725-v15',
  './assets/js/community-core.js?v=20260725-community2',
  './assets/js/community-feed.js?v=20260725-community2',
  './data/community_config.json?v=20260725-community2',
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
