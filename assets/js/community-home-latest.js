/* AIO-IPTV.pl — najnowszy wpis Społeczności AIO na stronie głównej
   2026-10-07 — wersja oszczędzająca transfer Supabase.
   Zasady prywatności bez zmian:
   - zalogowany użytkownik: najnowszy widoczny dla niego wpis,
   - gość: wyłącznie wpis dopuszczony przez aktualne RLS.
   Pełne zdjęcie NIE jest pobierane na stronę główną. Używana jest tylko
   mała miniatura nowych wpisów; dla starszych wpisów pozostaje lokalne tło HTML.
*/
(function(){
  'use strict';

  const $=(s,c=document)=>c.querySelector(s);
  const META_TTL=15*60*1000;
  const CACHE_PREFIX='aio:community-home-latest:v2:';

  const cut=(value,max)=>{
    const s=String(value||'').replace(/\s+/g,' ').trim();
    if(s.length<=max) return s;
    const short=s.slice(0,max-1);
    const last=short.lastIndexOf(' ');
    return (last>max*.62?short.slice(0,last):short).trim()+'…';
  };

  const formatDate=value=>{
    if(!value) return '';
    try{
      return new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
    }catch(_){return ''}
  };

  const typeLabel=post=>{
    if(post.kind==='official') return 'OFICJALNE • SPOŁECZNOŚĆ AIO';
    const map={problem:'PYTANIE / PROBLEM',information:'INFORMACJA',update:'AKTUALIZACJA',guide:'PORADNIK / ROZWIĄZANIE',discussion:'DYSKUSJA'};
    return (map[post.post_type]||'NAJNOWSZY WPIS')+' • SPOŁECZNOŚĆ AIO';
  };

  function readCache(key){
    try{
      const row=JSON.parse(localStorage.getItem(key)||'null');
      if(row&&row.at&&row.post&&(Date.now()-Number(row.at)<META_TTL)) return row.post;
    }catch(_){}
    return null;
  }

  function writeCache(key,post){
    try{localStorage.setItem(key,JSON.stringify({at:Date.now(),post}));}catch(_){}
  }

  function mediaPath(value,bucket){
    if(window.AIOEgress&&typeof window.AIOEgress.mediaPath==='function') return window.AIOEgress.mediaPath(value,bucket);
    const raw=String(value||'').trim();
    if(!raw) return '';
    if(!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/,'');
    try{
      const u=new URL(raw);
      for(const marker of [
        '/storage/v1/object/public/'+bucket+'/',
        '/storage/v1/object/sign/'+bucket+'/',
        '/storage/v1/object/authenticated/'+bucket+'/'
      ]){
        const idx=u.pathname.indexOf(marker);
        if(idx!==-1) return decodeURIComponent(u.pathname.slice(idx+marker.length));
      }
    }catch(_){}
    return '';
  }

  async function boot(){
    const feature=$('[data-community-latest-feature]');
    if(!feature || !window.supabase || typeof window.supabase.createClient!=='function') return;

    const title=$('[data-community-latest-title]',feature);
    const excerpt=$('[data-community-latest-excerpt]',feature);
    const chip=$('[data-community-latest-chip]',feature);
    const meta=$('[data-community-latest-meta]',feature);
    const image=$('[data-community-latest-image]',feature);
    const open=$('[data-community-latest-open]',feature);

    try{
      const configResponse=await fetch('data/community_config.json?v=20261007-egress1');
      if(!configResponse.ok) throw new Error('config');
      const config=await configResponse.json();
      const supa=config.supabase||{};
      if(!supa.url||!supa.anonKey) throw new Error('supabase-config');

      const client=window.supabase.createClient(String(supa.url).replace(/\/+$/,''),supa.anonKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      });

      const sessionResult=await client.auth.getSession();
      const session=sessionResult&&sessionResult.data?sessionResult.data.session:null;
      const userId=session&&session.user?session.user.id:'anon';
      const cacheKey=CACHE_PREFIX+userId;

      let post=readCache(cacheKey);
      if(!post){
        const result=await client
          .from('community_posts')
          .select('id,kind,post_type,category,title,content,status,attachments,created_at,published_at')
          .eq('status','published')
          .order('created_at',{ascending:false})
          .limit(1)
          .maybeSingle();
        if(result.error) throw result.error;
        post=result.data;
        if(post) writeCache(cacheKey,post);
      }

      if(!post) return;

      title.textContent=cut(post.title,82);
      excerpt.textContent=cut(post.content,210);
      chip.textContent=typeLabel(post);
      open.href='post.html?id='+encodeURIComponent(post.id);
      open.textContent='Czytaj wpis';

      const date=formatDate(post.published_at||post.created_at);
      meta.textContent=(session?'Najnowszy wpis społeczności':'Najnowszy publiczny wpis')+(date?' • '+date:'');

      // Nie zastępuj lokalnego obrazu pełnym zdjęciem ze Storage.
      // Tylko nowe wpisy z małą miniaturą mogą zmienić tło.
      const saveData=Boolean(navigator.connection&&navigator.connection.saveData);
      const slow=Boolean(navigator.connection&&/2g/.test(String(navigator.connection.effectiveType||'')));
      if(!saveData&&!slow){
        const attachments=Array.isArray(post.attachments)?post.attachments:[];
        const first=attachments.find(item=>item&&(item.preview_path||item.previewPath||item.thumbnail_path));
        if(first){
          const bucket=String(config.mediaBucket||'community-media');
          const preview=String(first.preview_path||first.previewPath||first.thumbnail_path||'');
          const path=mediaPath(preview,bucket);
          let imageUrl='';
          if(path && window.AIOEgress && typeof window.AIOEgress.getSignedUrl==='function'){
            const eg=config.egress||{};
            imageUrl=await window.AIOEgress.getSignedUrl({
              client,
              userId,
              bucket,
              value:path,
              ttl:Number(eg.previewSignedUrlTtlSeconds||43200),
              cacheSeconds:Number(eg.previewSignedUrlCacheSeconds||39600),
              maxEntries:Number(eg.signedCacheMaxEntries||260)
            });
          }else if(path){
            const signed=await client.storage.from(bucket).createSignedUrl(path,43200);
            if(!signed.error&&signed.data&&signed.data.signedUrl) imageUrl=signed.data.signedUrl;
          }
          if(imageUrl){
            image.loading='lazy';
            image.decoding='async';
            image.src=imageUrl;
            image.alt='Miniatura wpisu: '+cut(post.title,90);
          }
        }
      }
    }catch(error){
      console.warn('AIO: nie udało się pobrać najnowszego wpisu społeczności:',error);
      // Zostaje pełna statyczna zawartość awaryjna strony głównej.
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
