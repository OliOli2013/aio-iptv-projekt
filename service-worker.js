/* AIO-IPTV.pl PWA — Cloudflare cleanup 2026-10-08 */
const CACHE='aio-iptv-pro-20261008-homepro12';
const CORE=[
  './plugin-e2-security.html','./assets/css/e2-security.css?v=20261005','./pliki/e2-security-interface-1.1.0.jpg',
  './','./index.html','./access.html','./start-here.html','./ecosystem.html','./pro.html','./app-aio-channel-editor.html','./android-apps.html','./community.html','./support.html','./downloads.html','./guides.html','./news.html','./plugins.html','./skin-aiohd-next.html','./plugin-aio-panel.html','./systems.html','./updates.html',
  './post.html','./profile.html','./community-admin.html','./community-chat.html','./community-rules.html','./privacy-community.html','./aio-connect-report.html','./studio.html','./ai-chat.html','./offline.html',
  './assets/js/auto-language.js?v=20260729-auto-en1',
  './assets/css/user-premium.css?v=20260911-access21','./assets/js/user-premium.js?v=20261008-accessactivity1',
  './assets/css/aio-home-next.css?v=20261001-home-next2','./assets/js/aio-home-next.js?v=20261001-home-next2',
  './assets/css/access-v21.css?v=20260911-access21','./assets/js/access-v21.js?v=20260911-access21',
  './assets/css/pro-suite.css?v=20260728-community10-aio-connect','./assets/css/community-chat.css?v=20261008-chat41','./assets/css/community.css?v=20261008-authreset2','./assets/js/aio-experience.js?v=20261008-cloudflare-clean1',
  './assets/js/community-core.js?v=20261008-authreset2','./assets/js/community-chat.js?v=20261008-chat41',
  'assets/js/community-chat-promo.js?v=20261008-chatpromo1','./assets/js/community-feed.js?v=20261008-cloudflare1','./assets/js/community-post.js?v=20261008-cloudflare-edit2','./assets/js/community-profile.js?v=20261008-cloudflare1','./assets/js/community-admin.js?v=20261008-accessadmin1','./assets/js/community-home.js?v=20261008-cloudflare1','./assets/js/community-home-latest.js?v=20261008-cloudflare1',
  './assets/js/aio-site-stats.js?v=20261008-stats1','./assets/css/aio-site-stats.css?v=20261008-stats1','./assets/js/aio-homepage-pro.js?v=20261008-homepro12','./assets/css/aio-homepage-pro.css?v=20261008-homepro12','./assets/css/aio-access-admin.css?v=20261008-accessadmin1','./data/community_config.json?v=20261008-authreset2','./data/updates.json','./data/projects.json','./data/downloads.json','./data/search-index.json',
  './pliki/logo.png','./pliki/aio-panel-17.0.0.png','./pliki/aio-channel-editor-portal-promo.png'
];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok) cache.put(request,response.clone());
    return response;
  }catch(error){
    const cached=await cache.match(request);
    if(cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==location.origin) return;

  /* API Społeczności jest dynamiczne i zależne od sesji użytkownika.
     Nigdy nie zapisujemy odpowiedzi /api/* w Service Worker Cache. */
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.method!=='GET') return;

  const protectedDownload=/\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u|m3u8|xml|conf|cfg|backup|sh|py|json|txt|list|tv|radio|bouquet)(?:$|[?#])/i.test(url.pathname+url.search);
  if(url.pathname.startsWith('/pliki/') && protectedDownload){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request).catch(()=>caches.match('./offline.html')));
    return;
  }

  if(/\.(?:js|css)(?:$|\?)/i.test(url.pathname+url.search)){
    event.respondWith(networkFirst(request).catch(()=>caches.match(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy));
      }
      return response;
    }))
  );
});
