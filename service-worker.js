/* AIO-IPTV.pl PWA — Access 2.1 + Home UX 4 • 2026-09-11 */
const CACHE='aio-iptv-pro-20260911-access21-homeux4';
const CORE=[
  './','./index.html','./access.html','./start-here.html','./ecosystem.html','./pro.html','./app-aio-channel-editor.html','./android-apps.html','./community.html','./support.html','./downloads.html','./guides.html','./news.html','./plugins.html','./systems.html','./updates.html',
  './post.html','./profile.html','./community-admin.html','./community-rules.html','./privacy-community.html','./aio-connect-report.html','./studio.html','./ai-chat.html','./offline.html',
  './assets/js/auto-language.js?v=20260729-auto-en1',
  './assets/css/user-premium.css?v=20260911-access21','./assets/js/user-premium.js?v=20260911-access21',
  './assets/css/aio-2026.css?v=20260911-homeux4','./assets/js/portal-ux3.js?v=20260911-homeux4',
  './assets/css/access-v21.css?v=20260911-access21','./assets/js/access-v21.js?v=20260911-access21',
  './assets/css/pro-suite.css?v=20260728-community10-aio-connect','./assets/css/community.css?v=20260728-community10-aio-connect','./assets/js/aio-experience.js?v=20260816-community-first',
  './assets/js/community-core.js?v=20260728-community10-aio-connect','./assets/js/community-feed.js?v=20260728-community10-aio-connect','./assets/js/community-post.js?v=20260728-community10-aio-connect','./assets/js/community-profile.js?v=20260728-community10-aio-connect','./assets/js/community-admin.js?v=20260728-community10-aio-connect','./assets/js/community-home.js?v=20260728-community10-aio-connect',
  './data/community_config.json?v=20260728-community10-aio-connect','./data/updates.json','./pliki/logo.png','./pliki/aio-iptv-zbiorka-celowa-2026.webp','./pliki/aio-channel-editor-portal-promo.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{const response=await fetch(request,{cache:'no-store'});if(response&&response.ok)cache.put(request,response.clone());return response;}
  catch(error){const cached=await cache.match(request);if(cached)return cached;throw error;}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request).catch(()=>caches.match('./offline.html')));
    return;
  }
  if(/\.(?:js|css)(?:$|\?)/i.test(url.pathname+url.search)){
    event.respondWith(networkFirst(event.request).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});
