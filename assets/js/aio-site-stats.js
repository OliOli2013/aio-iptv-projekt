/* AIO-IPTV.pl — lekkie statystyki odwiedzin V1 */
(function(){
  'use strict';
  if(window.__AIO_SITE_STATS_V1__) return;
  window.__AIO_SITE_STATS_V1__=true;

  const VISITOR_KEY='aio_site_visitor_v1';
  const DEDUPE_MS=5*60*1000;

  function visitorId(){
    try{
      let id=localStorage.getItem(VISITOR_KEY);
      if(id) return id;
      id=(crypto.randomUUID?crypto.randomUUID():randomId());
      localStorage.setItem(VISITOR_KEY,id);
      return id;
    }catch(_){ return randomId(); }
  }

  function randomId(){
    const a=new Uint8Array(16);
    if(window.crypto?.getRandomValues) crypto.getRandomValues(a);
    else for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);
    return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
  }

  function normalizedPath(){
    const p=location.pathname||'/';
    return p==='/'?'/index.html':p;
  }

  function shouldTrack(){
    const path=normalizedPath();
    const key='aio_site_last_view_'+path;
    const now=Date.now();
    try{
      const last=Number(sessionStorage.getItem(key)||0);
      if(now-last<DEDUPE_MS) return false;
      sessionStorage.setItem(key,String(now));
    }catch(_){ }
    return true;
  }

  async function track(){
    if(!shouldTrack()) return;
    try{
      await fetch('/api/site-stats',{
        method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,
        headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'visit',path:normalizedPath(),visitorId:visitorId()})
      });
    }catch(_){ }
  }

  function fmt(n){return Number(n||0).toLocaleString('pl-PL');}

  async function homeWidget(){
    if(normalizedPath()!=='/index.html') return;
    if(document.querySelector('[data-aio-site-stats]')) return;
    try{
      const res=await fetch('/api/site-stats',{cache:'no-store',credentials:'same-origin'});
      if(!res.ok) return;
      const d=await res.json();
      if(!d?.ok||!d.stats) return;
      const s=d.stats;
      const box=document.createElement('section');
      box.className='aio-site-stats-card portal-panel';
      box.setAttribute('data-aio-site-stats','');
      box.innerHTML=`
        <div class="aio-site-stats-head"><div><p class="aio-kicker">AIO-IPTV.PL W LICZBACH</p><h2>Aktywność strony i Społeczności</h2><p>Liczby aktualizowane automatycznie. „Unikalni” oznacza unikalne przeglądarki, nie dane osobowe.</p></div></div>
        <div class="aio-site-stats-grid">
          <div><strong>${fmt(s.pageviews_today)}</strong><span>odsłon dzisiaj</span></div>
          <div><strong>${fmt(s.visitors_today)}</strong><span>unikalnych przeglądarek dzisiaj</span></div>
          <div><strong>${fmt(s.community_users)}</strong><span>profili Społeczności AIO</span></div>
          <div><strong>${fmt(s.chat_messages_7d)}</strong><span>wiadomości czatu / 7 dni</span></div>
        </div>`;
      const main=document.querySelector('main');
      if(!main) return;
      const bridge=main.querySelector('.portal-community-bridge');
      if(bridge) bridge.insertAdjacentElement('afterend',box);
      else main.appendChild(box);
    }catch(_){ }
  }

  function boot(){track();window.setTimeout(homeWidget,250);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
