
(function(){
  'use strict';
  async function run(){
    const root=document.querySelector('[data-community-home-stats]');if(!root)return;
    const status=root.querySelector('[data-community-home-status]');
    try{
      const r=await fetch('/api/community?action=stats',{cache:'no-store',credentials:'include'}),d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'Błąd API');
      root.querySelectorAll('[data-community-home-stat]').forEach(el=>{const k=el.dataset.communityHomeStat;el.textContent=Number(d.stats?.[k]||0).toLocaleString('pl-PL');});
      if(status)status.textContent='Dane Społeczności AIO • Cloudflare';
    }catch(e){if(status)status.textContent='Społeczność chwilowo niedostępna';}
  }
  // Site statistics live near the page footer; skip D1 work for short visits.
  function schedule(){
    const target=document.querySelector('[data-community-home-stats]');
    if(!target)return;
    if(typeof IntersectionObserver!=='function'){run();return;}
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      observer.disconnect();
      run();
    },{rootMargin:'220px 0px'});
    observer.observe(target);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
