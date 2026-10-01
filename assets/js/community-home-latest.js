/* AIO-IPTV.pl — najnowszy wpis Społeczności AIO na stronie głównej
   2026-10-01
   Zasady prywatności pozostają bez zmian:
   - zalogowany użytkownik: najnowszy opublikowany wpis społeczności,
   - gość: najnowszy wpis dostępny publicznie przez aktualne RLS (oficjalny).
*/
(function(){
  'use strict';

  const $=(s,c=document)=>c.querySelector(s);
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
  const mediaPath=(value,bucket)=>{
    const raw=String(value||'').trim();
    if(!raw) return '';
    if(!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
    try{
      const url=new URL(raw);
      const markers=[
        '/storage/v1/object/public/'+bucket+'/',
        '/storage/v1/object/sign/'+bucket+'/',
        '/storage/v1/object/authenticated/'+bucket+'/'
      ];
      for(const marker of markers){
        const idx=url.pathname.indexOf(marker);
        if(idx!==-1) return decodeURIComponent(url.pathname.slice(idx+marker.length));
      }
    }catch(_){ }
    return '';
  };

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
      const configResponse=await fetch('data/community_config.json?v=20260728-community10',{cache:'no-store'});
      if(!configResponse.ok) throw new Error('config');
      const config=await configResponse.json();
      const supa=config.supabase||{};
      if(!supa.url||!supa.anonKey) throw new Error('supabase-config');

      const client=window.supabase.createClient(String(supa.url).replace(/\/+$/,''),supa.anonKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
      });

      // RLS decyduje, który wpis może zobaczyć dana osoba.
      // Zalogowany użytkownik otrzyma najnowszy opublikowany wpis społeczności,
      // a gość wyłącznie wpis dopuszczony publicznie (obecnie oficjalny).
      const result=await client
        .from('community_posts')
        .select('id,kind,post_type,category,title,content,status,attachments,created_at,published_at')
        .eq('status','published')
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle();

      if(result.error) throw result.error;
      const post=result.data;
      if(!post) return; // pozostaje dotychczasowa zawartość awaryjna

      title.textContent=cut(post.title,82);
      excerpt.textContent=cut(post.content,210);
      chip.textContent=typeLabel(post);
      open.href='post.html?id='+encodeURIComponent(post.id);
      open.textContent='Czytaj wpis';

      const sessionResult=await client.auth.getSession();
      const logged=Boolean(sessionResult&&sessionResult.data&&sessionResult.data.session);
      const date=formatDate(post.published_at||post.created_at);
      meta.textContent=(logged?'Najnowszy wpis społeczności':'Najnowszy publiczny wpis')+(date?' • '+date:'');

      const attachments=Array.isArray(post.attachments)?post.attachments:[];
      const first=attachments.find(item=>item&&(item.path||item.url));
      if(first){
        const bucket=String(config.mediaBucket||'community-media');
        const raw=String(first.path||first.url||'');
        const path=mediaPath(raw,bucket);
        let imageUrl='';
        if(path){
          const signed=await client.storage.from(bucket).createSignedUrl(path,3600);
          if(!signed.error&&signed.data&&signed.data.signedUrl) imageUrl=signed.data.signedUrl;
        }else if(/^https?:\/\//i.test(raw)){
          imageUrl=raw;
        }
        if(imageUrl){
          image.src=imageUrl;
          image.alt='Pierwsze zdjęcie z wpisu: '+cut(post.title,90);
        }
      }
    }catch(error){
      console.warn('AIO: nie udało się pobrać najnowszego wpisu społeczności:',error);
      // Celowo nie ukrywamy panelu. Pozostaje statyczna zawartość awaryjna.
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
