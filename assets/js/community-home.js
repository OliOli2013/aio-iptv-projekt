/* AIO-IPTV.pl — publiczne statystyki Społeczności AIO, community9 */
(function(){
  'use strict';
  async function boot(){
    const root=document.querySelector('[data-community-home-stats]');
    if(!root)return;
    const status=root.querySelector('[data-community-home-status]');
    try{
      const configResponse=await fetch('data/community_config.json?v=20260727-community9',{cache:'no-store'});
      if(!configResponse.ok)throw new Error('Brak konfiguracji społeczności.');
      const config=await configResponse.json();
      const supa=config.supabase||{};
      if(!supa.url||!supa.anonKey)throw new Error('Brak konfiguracji Supabase.');
      const response=await fetch(String(supa.url).replace(/\/+$/,'')+'/rest/v1/rpc/community_public_stats',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':supa.anonKey,'Authorization':'Bearer '+supa.anonKey},
        body:'{}'
      });
      if(!response.ok)throw new Error('Statystyki nie są jeszcze aktywne.');
      const raw=await response.json();
      const stats=Array.isArray(raw)?(raw[0]||{}):raw;
      root.querySelectorAll('[data-community-home-stat]').forEach(el=>{
        const key=el.dataset.communityHomeStat;
        el.textContent=Number(stats[key]||0).toLocaleString('pl-PL');
      });
      if(status){status.textContent='Aktualne dane ze Społeczności AIO';status.classList.add('ready');}
    }catch(error){
      if(status){status.textContent='Społeczność działa — zaloguj się, aby zobaczyć wpisy';status.classList.add('error');}
      console.warn('Nie udało się pobrać publicznych statystyk społeczności:',error);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
