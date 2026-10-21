/* AIO Owner Bell Header V1 — header-wide indicator, owner authorization enforced in D1 API.
   Only appears after /api/community-auth confirms the unique verified owner.
   Read-only, no client-side assumptions about payments or security actions. */
(()=>{'use strict';
  if(window.__aioOwnerBellHeaderV1)return;
  window.__aioOwnerBellHeaderV1=true;
  const AUTH='/api/community-auth';
  const API='/api/aio-owner-attention';
  const HEALTH='/api/aio-health';
  const TARGET='/konto.html#aio-owner-attention-panel';
  let owner=false,busy=false,epoch=0,lastRefresh=0,link=null,pill=null,attempt=0,lastTotal=0,rerun=false;
  const cssHref='/assets/css/aio-owner-bell-v1.css?v=20261022-owner-bell-v1';
  const $=s=>document.querySelector(s);
  const capped=n=>n>99?'99+':String(n);

  async function get(url){
    const c=new AbortController();
    const timeout=window.setTimeout(()=>c.abort(),12000);
    try{const r=await fetch(url,{credentials:'include',cache:'no-store',signal:c.signal});
      const data=await r.json().catch(()=>null);
      return {status:r.status,ok:r.ok,data};
    }finally{window.clearTimeout(timeout);}
  }
  function remove(){
    link?.remove();link=null;pill=null;lastRefresh=0;lastTotal=0;
  }
  function loadCss(){
    if(document.querySelector('link[data-aio-owner-bell-style]'))return;
    const l=document.createElement('link');l.rel='stylesheet';l.href=cssHref;
    l.dataset.aioOwnerBellStyle='1';document.head.append(l);
  }
  function ensureUI(){
    const bar=$('.portal-topbar .portal-topbar-links');
    if(!bar)return null;
    const existing=bar.querySelector('a.aio-owner-bell');
    if(existing){link=existing;pill=link.querySelector('.aob1-count');return link;}
    loadCss();
    link=document.createElement('a');link.href=TARGET;
    link.className='aio-owner-bell';link.title='Sprawy wymagające uwagi właściciela';
    link.setAttribute('aria-label','Sprawy wymagające uwagi właściciela');
    const bell=document.createElement('span');bell.className='aob1-icon';bell.setAttribute('aria-hidden','true');bell.textContent='🔔';
    pill=document.createElement('span');pill.className='aob1-count';pill.hidden=true;pill.setAttribute('aria-hidden','true');
    link.append(bell,pill);
    const account=bar.querySelector('a.aio-topbar-account, a[href="konto.html"]');
    if(account)bar.insertBefore(link,account);else bar.append(link);
    link.addEventListener('click',event=>{
      const path=location.pathname.replace(/\/$/,'');
      if(!/\/(?:konto|konto\.html)$/i.test(path))return;
      const panel=document.getElementById('aio-owner-attention-panel');
      if(!panel)return;
      event.preventDefault();
      if(panel.hidden)document.querySelector('.aoa1-trigger')?.click();
      if(location.hash!=='#aio-owner-attention-panel')history.replaceState(history.state,'',TARGET);
      panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    });
    return link;
  }
  function paint(total,partial){
    if(!owner||!ensureUI())return;
    const count=Math.max(0,Math.floor(Number(total)||0));
    const label=count?`${count} spraw wymagających uwagi`:'Brak spraw wymagających uwagi';
    const text=label+(partial?' — część źródeł chwilowo niedostępna':'');
    link.dataset.aobState=count?'pending':partial?'unknown':'clear';
    link.setAttribute('aria-label','Sprawy właściciela: '+text);
    link.title='Sprawy właściciela: '+text;
    pill.hidden=!count&&!partial;
    pill.textContent=count?capped(count):'!';
    // If some source failed, the count is a minimum, not a definitive total.
    link.dataset.aobPartial=partial?'1':'0';
  }
  async function refresh(force=false){
    if(!owner||document.hidden)return;
    if(busy){rerun=true;return;}
    if(!force&&Date.now()-lastRefresh<25000)return;
    busy=true;const current=epoch;
    try{
      const [a,h]=await Promise.allSettled([get(API),get(HEALTH)]);
      if(!owner||current!==epoch)return;
      if(a.status!=='fulfilled'){
        paint(lastTotal,true);return;
      }
      const result=a.value;
      if(result.status===401||result.status===403){owner=false;epoch++;remove();return;}
      if(!result.ok||result.data?.ok!==true){paint(lastTotal,true);return;}
      let total=Number(result.data.total)||0;
      let partial=result.data.complete===false||(Array.isArray(result.data.unavailable)&&result.data.unavailable.length>0);
      if(h.status==='fulfilled'){
        if(h.value.status>=500)total+=1;
        else if(!h.value.ok||h.value.data?.ok===false)partial=true;
      }else partial=true;
      lastTotal=total;paint(total,partial);
      lastRefresh=Date.now();attempt=0;
    }catch(_){if(owner&&current===epoch)paint(lastTotal,true);}
    finally{busy=false;if(rerun&&owner){rerun=false;void refresh(true);}}
  }
  async function sync(){
    const current=++epoch;owner=false;remove();
    try{
      const auth=await get(AUTH);
      if(current!==epoch)return;
      if(!auth.ok||auth.data?.authenticated!==true||auth.data?.email_verified!==true||auth.data?.user?.is_owner!==true)return;
      owner=true;ensureUI();void refresh(true);
    }catch(_){if(current===epoch){owner=false;remove();}}
  }
  function boot(){
    void sync();
    document.addEventListener('aio-community-auth',()=>void sync());
    document.addEventListener('aio-community-ready',()=>{if(!owner&&attempt++<2)void sync();});
    window.addEventListener('focus',()=>{if(owner)void refresh();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(owner)void refresh();else void sync();}});
    window.setInterval(()=>{if(owner&&!document.hidden)void refresh(true);},90000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
