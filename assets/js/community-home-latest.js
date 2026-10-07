
(function(){
  'use strict';
  const $=(s,c=document)=>c.querySelector(s);
  async function run(){
    const feature=$('[data-community-latest-feature]');if(!feature)return;
    try{
      const r=await fetch('/api/community?action=latest',{cache:'no-store',credentials:'include'}),d=await r.json();
      if(!r.ok||!d.ok||!d.post)return;
      const p=d.post,title=$('[data-community-latest-title]',feature),excerpt=$('[data-community-latest-excerpt]',feature),chip=$('[data-community-latest-chip]',feature),meta=$('[data-community-latest-meta]',feature),image=$('[data-community-latest-image]',feature),open=$('[data-community-latest-open]',feature);
      if(title)title.textContent=p.title||'Najnowszy wpis';
      if(excerpt)excerpt.textContent=String(p.content||'').replace(/\s+/g,' ').slice(0,220)+(String(p.content||'').length>220?'…':'');
      if(chip)chip.textContent=p.kind==='official'?'NAJNOWSZA AKTUALNOŚĆ':'NAJNOWSZY WPIS • SPOŁECZNOŚĆ AIO';
      if(meta)meta.textContent=new Date(p.published_at||p.created_at).toLocaleString('pl-PL');
      if(open)open.href='post.html?id='+encodeURIComponent(p.id);
      const img=p.attachments&&p.attachments[0]?.url;if(image&&img){image.src=img;image.hidden=false;}
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
