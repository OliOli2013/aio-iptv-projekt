/* AIO Homepage PRO V1 — 2026-10-08 */
(function(){
  'use strict';
  if(window.__AIO_HOMEPAGE_PRO_V1__) return;
  window.__AIO_HOMEPAGE_PRO_V1__=true;

  const q=(s,c=document)=>c.querySelector(s);
  const qa=(s,c=document)=>Array.from(c.querySelectorAll(s));
  const fmt=n=>Number(n||0).toLocaleString('pl-PL');

  async function loadSiteStats(){
    const root=q('[data-aio-site-stats]');
    if(!root) return;
    try{
      const res=await fetch('/api/site-stats',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok) return;
      const d=await res.json();
      if(!d?.ok||!d.stats) return;
      const s=d.stats;
      const map={
        pageviews_today:s.pageviews_today,
        visitors_today:s.visitors_today,
        community_users:s.community_users,
        chat_messages_7d:s.chat_messages_7d
      };
      Object.entries(map).forEach(([k,v])=>{
        qa(`[data-home-pro-stat="${k}"]`,root).forEach(el=>el.textContent=fmt(v));
      });
    }catch(_){}
  }

  function bindSearch(){
    qa('[data-home-pro-search]').forEach(btn=>btn.addEventListener('click',()=>{
      const trigger=q('.site-search-trigger');
      if(trigger) trigger.click();
      else location.href='downloads.html';
    }));
  }

  function boot(){
    document.body.classList.add('aio-home-pro');
    loadSiteStats();
    bindSearch();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
