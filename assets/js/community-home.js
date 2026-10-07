/* AIO-IPTV.pl — publiczne statystyki Społeczności AIO
   2026-10-07 — cache przeglądarki ograniczający zbędne zapytania Supabase. */
(function(){
  'use strict';

  const CACHE_KEY='aio:community-public-stats:v2';
  const CACHE_TTL=30*60*1000;

  function readCache(){
    try{
      const row=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(row&&row.at&&row.stats&&(Date.now()-Number(row.at)<CACHE_TTL)) return row.stats;
    }catch(_){}
    return null;
  }

  function writeCache(stats){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),stats}));}catch(_){}
  }

  function render(root,status,stats,cached){
    root.querySelectorAll('[data-community-home-stat]').forEach(el=>{
      const key=el.dataset.communityHomeStat;
      el.textContent=Number(stats[key]||0).toLocaleString('pl-PL');
    });
    if(status){
      status.textContent=cached?'Aktualne dane ze Społeczności AIO • cache':'Aktualne dane ze Społeczności AIO';
      status.classList.remove('error');
      status.classList.add('ready');
    }
  }

  async function boot(){
    const root=document.querySelector('[data-community-home-stats]');
    if(!root)return;
    const status=root.querySelector('[data-community-home-status]');

    const cached=readCache();
    if(cached){
      render(root,status,cached,true);
      return;
    }

    try{
      const configResponse=await fetch('data/community_config.json?v=20261007-egress1');
      if(!configResponse.ok)throw new Error('Brak konfiguracji społeczności.');
      const config=await configResponse.json();
      const supa=config.supabase||{};
      if(!supa.url||!supa.anonKey)throw new Error('Brak konfiguracji Supabase.');

      const response=await fetch(String(supa.url).replace(/\/+$/,'')+'/rest/v1/rpc/community_public_stats',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':supa.anonKey,'Authorization':'Bearer '+supa.anonKey},
        body:'{}'
      });

      if(!response.ok){
        const detail=await response.text().catch(()=> '');
        const err=new Error('HTTP '+response.status+' '+detail.slice(0,300));
        err.status=response.status;
        throw err;
      }

      const raw=await response.json();
      const stats=Array.isArray(raw)?(raw[0]||{}):raw;
      writeCache(stats);
      render(root,status,stats,false);
    }catch(error){
      if(status){
        const message=String(error&&error.message||error||'');
        status.textContent=/402|egress|restricted|fair use/i.test(message)
          ? 'Społeczność AIO chwilowo niedostępna — limit usługi'
          : 'Społeczność działa — zaloguj się, aby zobaczyć wpisy';
        status.classList.add('error');
      }
      console.warn('Nie udało się pobrać publicznych statystyk społeczności:',error);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
