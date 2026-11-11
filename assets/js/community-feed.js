
/* Społeczność AIO — Cloudflare feed, 2026-10-08 */
(function(){
  'use strict';
  // AIO_TOPICS_V4_20261111: server-side filters, shareable URLs.
  const urlFilters=new URLSearchParams(location.search);
  const state={page:0,search:'',category:urlFilters.get('category')||'',subcategory:urlFilters.get('subcategory')||'',brand:urlFilters.get('brand')||'',model:urlFilters.get('model')||'',listingStatus:urlFilters.get('listingStatus')||'',mode:'latest',loading:false,rows:[],pageSize:12,requestSeq:0,activeController:null};
  const q=(s,c=document)=>c.querySelector(s), qa=(s,c=document)=>Array.from(c.querySelectorAll(s));
  let news=false;

  function boot(){
    if(!window.AIOCommunity)return;
    if(AIOCommunity.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});
  }
  async function init(){
    const feed=q('[data-community-feed]');if(!feed)return;
    news=document.body.dataset.communityPage==='news';
    state.pageSize=Number(AIOCommunity.config?.postsPerPage||12);
    const requested=new URLSearchParams(location.search).get('mode');
    const allowed=new Set(['latest','questions','unanswered','solved','popular','official','mine']);
    state.mode=news?'official':(allowed.has(requested)?requested:'latest');
    fillCategories();syncTabs();bind();renderAccess();renderCompose();
    if(!AIOCommunity.backendReady){feed.innerHTML='<div class="community-error">Społeczność jest chwilowo niedostępna. Spróbuj ponownie później.</div>';return;}
    await load(true);await loadStats();
  }
  function fillCategories(){
    const select=q('[data-community-category]');
    const opts=(AIOCommunity.config?.categories||[]).map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');
    if(select){select.innerHTML='<option value="">Wszystkie kategorie</option>'+opts;select.value=state.category;}
    const compose=q('[data-compose-category]');if(compose)compose.innerHTML=opts;
  }
  function syncTabs(){qa('[data-community-mode]').forEach(b=>b.classList.toggle('active',b.dataset.communityMode===state.mode));}
  function bind(){
    const search=q('[data-community-search]'),cat=q('[data-community-category]'),more=q('[data-community-more]');
    if(search){let t;search.oninput=()=>{clearTimeout(t);t=setTimeout(()=>{state.search=search.value.trim();load(true);},300);};}
    if(cat)cat.onchange=()=>{
      state.category=cat.value;
      state.subcategory='';state.brand='';state.model='';state.listingStatus='';
      document.dispatchEvent(new CustomEvent('aio:topics-category-changed',{detail:{category:cat.value}}));
      load(true);
    };
    document.addEventListener('aio:topics-filter',e=>{
      const d=e.detail||{};
      // Nowy kafelek pokazuje caly dzial, bez odziedziczonych filtrow 'Pytania' lub szukania.
      if(d.resetContext&&!news){
        state.mode='latest';syncTabs();state.search='';
        if(search)search.value='';
      }
      state.category=d.category||'';state.subcategory=d.subcategory||'';
      state.brand=d.brand||'';state.model=d.model||'';state.listingStatus=d.listingStatus||'';
      if(cat)cat.value=state.category;
      load(true);
    });
    qa('[data-community-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.communityMode;syncTabs();load(true);});
    if(more)more.onclick=()=>load(false);
    document.addEventListener('aio-community-auth',async()=>{renderAccess();renderCompose();await load(true);await loadStats();});
    document.addEventListener('click',handleAction);
    const form=q('[data-compose-form]');if(form)form.addEventListener('submit',submitPost);
    const images=q('[data-compose-images]');if(images)images.onchange=previewImages;
    qa('[data-compose-template]').forEach(b=>b.onclick=()=>applyTemplate(b.dataset.composeTemplate));
    const open=q('[data-open-compose]');if(open)open.onclick=()=>{
      if(!AIOCommunity.requireAuth('Zaloguj się, aby opublikować wpis.'))return;
      q('[data-compose-title]')?.focus();q('[data-community-compose]')?.scrollIntoView({behavior:'smooth'});
    };
    const content=q('[data-compose-content]'),count=q('[data-compose-count]');
    if(content&&count){const max=Number(AIOCommunity.config?.maxPostLength||50000);const upd=()=>count.textContent=AIOCommunity.characterLabel(content.value.length,max);content.oninput=upd;upd();}
  }
  function renderAccess(){
    const gate=q('[data-community-access-gate]'),content=q('[data-community-private-content]');
    const allowed=news||Boolean(AIOCommunity.user);
    if(gate)gate.hidden=allowed;if(content)content.hidden=false;
    qa('[data-community-mode="mine"]').forEach(b=>b.hidden=!AIOCommunity.user);
    if(!AIOCommunity.user && state.mode==='mine'){state.mode='latest';syncTabs();}
  }
  function renderCompose(){
    const wrap=q('[data-community-compose]');if(!wrap)return;
    q('[data-compose-guest]',wrap)?.toggleAttribute('hidden',Boolean(AIOCommunity.user));
    q('[data-compose-form]',wrap)?.toggleAttribute('hidden',!AIOCommunity.user);
    const official=q('[data-compose-official-wrap]',wrap);if(official)official.hidden=!AIOCommunity.isAdmin();
    const note=q('[data-compose-approval]',wrap);if(note&&AIOCommunity.user)note.textContent=(AIOCommunity.isAdmin()||AIOCommunity.profile?.trusted)?'Twój wpis zostanie opublikowany od razu.':'Pierwszy wpis może wymagać zatwierdzenia.';
  }
  async function load(reset){
    const feed=q('[data-community-feed]'),more=q('[data-community-more]');
    if(!feed||(!reset&&state.loading))return;
    // AIO AUDIT FIX V1: a new filter/search cancels any obsolete request.
    // Older responses must never overwrite a newer filter or login state.
    if(reset){
      state.requestSeq++;
      if(state.activeController)state.activeController.abort();
      state.page=0;state.rows=[];
      feed.innerHTML='<div class="community-loading">Ładuję wpisy…</div>';
      if(more)more.hidden=true;
    }
    const seq=state.requestSeq;
    const page=state.page;
    const controller=new AbortController();
    state.activeController=controller;
    state.loading=true;
    try{
      const d=await AIOCommunity.apiGet('feed',{
        mode:state.mode,category:state.category,subcategory:state.subcategory,brand:state.brand,model:state.model,listingStatus:state.listingStatus,search:state.search,page,pageSize:state.pageSize
      },{signal:controller.signal});
      if(controller.signal.aborted||seq!==state.requestSeq)return;
      // AIO Topics V4.2: fail-closed guard. A post from another category never appears.
      const received=Array.isArray(d.rows)?d.rows:[];
      const matching=state.category?received.filter(post=>post&&post.category===state.category):received;
      const mismatch=matching.length!==received.length;
      state.rows=reset?matching:state.rows.concat(matching);
      render();
      document.dispatchEvent(new CustomEvent('aio:topics-results',{
        detail:{category:state.category,shown:state.rows.length,hasMore:Boolean(d.hasMore)&&!mismatch}
      }));
      if(more)more.hidden=!d.hasMore||mismatch;
      if(d.hasMore)state.page=page+1;
    }catch(e){
      if(controller.signal.aborted||seq!==state.requestSeq)return;
      feed.innerHTML=`<div class="community-error"><strong>Nie udało się pobrać wpisów.</strong><p>${AIOCommunity.escape(AIOCommunity.friendlyError(e))}</p></div>`;
    }finally{
      if(seq===state.requestSeq){
        state.loading=false;
        if(state.activeController===controller)state.activeController=null;
      }
    }
  }
  function render(){
    const feed=q('[data-community-feed]');
    if(!state.rows.length){
      const cat=(AIOCommunity.config?.categories||[]).find(x=>x.id===state.category);
      const title=cat?`Brak wpisów w dziale „${AIOCommunity.escape(cat.label)}”.`:'Brak opublikowanych wpisów.';
      const narrowed=Boolean(state.search||state.subcategory||state.brand||state.model||state.listingStatus||state.mode!=='latest');
      const message=cat
        ?(narrowed?'Żaden wpis nie spełnia wybranych filtrów. Zmień filtry lub wybierz inny dział.':'W tym dziale nie opublikowano jeszcze żadnego postu. Możesz dodać pierwszy wpis.')
        :'Na razie nie ma wpisów do wyświetlenia.';
      feed.innerHTML=`<div class="community-empty" role="status"><strong>${title}</strong><p>${message}</p></div>`;
      return;
    }
    feed.innerHTML=state.rows.map(card).join('');
  }
  function card(post){
    if(post.teaser){
      const image=post.attachments?.[0]?.url||'assets/branding/aio-iptv-share-20261010.png';
      const photo=image?`<img src="${AIOCommunity.escapeAttr(image)}" alt="Grafika wpisu" loading="lazy" decoding="async" data-community-image>`:'';
      return `<article class="community-post-card aio-community-teaser" data-post-id="${AIOCommunity.escapeAttr(post.id)}">
        <div class="community-post-content"><span class="aio-teaser-eyebrow">PODGLĄD WPISU</span>
        <h2><a href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">${AIOCommunity.escape(post.title)}</a></h2>
        ${photo?`<div class="aio-teaser-photo">${photo}</div>`:''}
        <div class="aio-teaser-gate"><strong>🔒 Pozostała treść dla zarejestrowanych</strong>
          <p>Zarejestruj się lub zaloguj, aby przeczytać cały wpis i odpowiedzi.</p>
          <button class="button primary" type="button" data-community-login>Zarejestruj się / Zaloguj</button>
          <a class="aio-teaser-link" href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">Otwórz podgląd →</a>
        </div></div></article>`;
    }
    const a=post.author||{},cat=AIOCommunity.category(post.category),type=AIOCommunity.postType(post.post_type);
    const allImages=(post.attachments||[]).filter(x=>x?.url);
     const images=allImages.slice(0,4);
    const canDelete=AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin();
    const limit=Number(post.kind==='official'?(AIOCommunity.config?.officialPreviewLength||3200):(AIOCommunity.config?.postPreviewLength||1400));
    return `<article class="community-post-card ${post.pinned?'pinned ':''}${post.kind==='official'?'official':''}${post.featured?' featured':''}" data-post-id="${AIOCommunity.escapeAttr(post.id)}">
      <header class="community-post-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div class="community-post-author"><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(post.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a>${a.role&&a.role!=='user'?` <span class="community-role ${AIOCommunity.escapeAttr(a.role)}">${AIOCommunity.escape(AIOCommunity.roleLabel(a.role))}</span>`:''}</strong><small>${AIOCommunity.escape([a.tuner_model,a.system_name].filter(Boolean).join(' • ')||(post.kind==='official'?'Oficjalny wpis AIO TunerHub':'Użytkownik Społeczności AIO'))}</small></div><div class="community-post-meta">${AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at))}</div></header>
      <div class="community-post-content"><div class="community-post-tags">${post.kind==='official'?'<span class="community-status-pill official">✓ Oficjalne</span>':''}${post.pinned?'<span class="community-status-pill pinned">📌 Przypięte</span>':''}${post.featured?'<span class="community-status-pill featured">★ Wyróżnione</span>':''}<span class="community-status-pill post-type ${AIOCommunity.escapeAttr(type.id)}">${AIOCommunity.escape(type.icon+' '+type.label)}</span>${post.solved?'<span class="community-status-pill solved">✅ Rozwiązane</span>':''}<span class="community-category">${AIOCommunity.escape(cat.icon+' '+cat.label)}</span></div>
      <div class="aio-topic-meta">${window.AIOTopicsV4?.badge(post)||''}</div><h2><a href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">${AIOCommunity.escape(post.title)}</a></h2>
      <div class="community-post-text">${AIOCommunity.formatText(post.content,limit)}</div>${images.length?`<div class="community-media-grid ${images.length===1?'one':''}">${images.map(x=>`<img src="${AIOCommunity.escapeAttr(x.url)}" alt="Zdjęcie do wpisu" loading="lazy" decoding="async" data-community-image>`).join('')}${allImages.length>4?`<a class="aio-media-more" href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">+${allImages.length-4} zdjęć · Zobacz galerię</a>`:''}</div>`:''}</div>
      <footer class="community-post-footer">${reaction(post,'helpful','👍 Pomocne')}${reaction(post,'works','✅ Działa')}${reaction(post,'thanks','❤️ Dziękuję')}<a class="community-action community-open" href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">${AIOCommunity.user?'💬 '+Number(post.comment_count||0)+' odpowiedzi':'🔐 Dyskusja po zalogowaniu'}</a>${AIOCommunity.user?'<button class="community-action" type="button" data-report-post>⚑ Zgłoś</button>':''}${AIOCommunity.isAdmin()?`<button class="community-action" type="button" data-pin-post>${post.pinned?'📌 Odepnij':'📌 Przypnij'}</button><button class="community-action" type="button" data-feature-post>${post.featured?'★ Usuń wyróżnienie':'★ Wyróżnij'}</button>`:''}${canDelete?'<button class="community-action danger" type="button" data-delete-post>Usuń</button>':''}</footer>
    </article>`;
  }
  function reaction(post,type,label){const r=post.reactions||{};return `<button class="community-reaction ${r.mine===type?'active':''}" type="button" data-reaction="${type}">${label} <span>${Number(r[type]||0)}</span></button>`;}
  async function handleAction(e){
    const row=e.target.closest('[data-post-id]');if(!row)return;const id=row.dataset.postId;
    const pin=e.target.closest('[data-pin-post],[data-feature-post]');
     if(pin){if(!AIOCommunity.isAdmin())return;try{await AIOCommunity.api('admin_action',{target:'post',id,op:pin.hasAttribute('data-pin-post')?'pin':'feature'});await load(true);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
     const react=e.target.closest('[data-reaction]');if(react){if(!AIOCommunity.requireAuth())return;try{await AIOCommunity.api('reaction',{postId:id,type:react.dataset.reaction});await load(true);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    if(e.target.closest('[data-delete-post]')){if(!confirm('Usunąć ten wpis?'))return;try{await AIOCommunity.api('delete_post',{id});await load(true);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    if(e.target.closest('[data-report-post]')){const reason=prompt('Powód zgłoszenia:');if(!reason)return;try{await AIOCommunity.api('report',{targetType:'post',targetId:id,reason});AIOCommunity.showToast('Zgłoszenie wysłane.','success');}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}}
  }
  async function submitPost(e){
    e.preventDefault();if(!AIOCommunity.requireAuth())return;
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const files=Array.from(q('[data-compose-images]',form)?.files||[]);
       const limit=12;
       if(files.length>limit)throw new Error(`Możesz dodać maksymalnie ${limit} zdjęć do wpisu.`);
      const attachments=[];
       // Clean uploaded-but-unlinked files only if upload itself failed.
       // Do not remove them after an ambiguous create timeout: the post may exist.
       try{
         for(let i=0;i<files.length;i++){
           button.textContent=`Przesyłanie zdjęć ${i+1}/${files.length}…`;
           attachments.push(await AIOCommunity.uploadMedia(files[i],'post'));
         }
       }catch(uploadError){
         for(const a of attachments){
           try{await fetch('/api/community-media?key='+encodeURIComponent(a.key),{method:'DELETE',credentials:'include'});}catch(_){}
         }
         throw uploadError;
       }
       button.textContent='Publikuję…';
      const d=await AIOCommunity.api('create_post',{
        title:q('[data-compose-title]',form).value.trim(),content:q('[data-compose-content]',form).value.trim(),
        category:q('[data-compose-category]',form).value,postType:q('[data-compose-post-type]',form)?.value||'problem',
        ...(window.AIOTopicsV4?.fields(form)||{}),
        official:Boolean(q('[data-compose-official]',form)?.checked),attachments
      });
      form.reset();q('[data-compose-preview]',form).innerHTML='';AIOCommunity.showToast(d.status==='pending'?'Wpis oczekuje na zatwierdzenie.':'Wpis opublikowany.','success');await load(true);await loadStats();
    }catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}
    finally{button.disabled=false;button.textContent='Opublikuj wpis';}
  }
  function previewImages(e){
    const root=q('[data-compose-preview]');if(!root)return;root.innerHTML='';
    const files=Array.from(e.target.files||[]);
     if(files.length>12)AIOCommunity.showToast('Maksymalnie 12 zdjęć. Usuń nadmiarowe pliki przed publikacją.','warning');
     files.slice(0,12).forEach(f=>{const img=document.createElement('img');const url=URL.createObjectURL(f);img.src=url;img.alt='Podgląd '+f.name;img.onload=img.onerror=()=>URL.revokeObjectURL(url);root.appendChild(img);});
  }
  function applyTemplate(type){
    const content=q('[data-compose-content]'),cat=q('[data-compose-category]'),pt=q('[data-compose-post-type]');if(!content)return;
    const map={
      tuner:['pomoc','problem','Model tunera:\nSystem i wersja:\nWersja Pythona:\n\nCo nie działa:\n\nDokładny komunikat błędu:\n'],
      plugin:['wtyczki','problem','Model tunera:\nSystem i wersja:\nNazwa i wersja wtyczki:\n\nOpis problemu:\n\nTreść błędu / crashlog:\n'],
      channels:['kanaly','problem','Model tunera:\nSystem i wersja:\nPozycje satelitarne / rodzaj listy:\n\nOpis problemu:\n'],
      iptv:['iptv','problem','Model tunera:\nSystem i wersja:\nRodzaj źródła: M3U / Xtream / MAC Portal:\n\nOpis problemu:\n'],
      solution:['inne','guide','Temat poradnika:\n\nRozwiązanie krok po kroku:\n1. \n2. \n3. \n'],
      update:['wtyczki','update','Nazwa projektu i wersja:\nData wydania:\n\nNajważniejsze zmiany:\n✅ \n✅ \n✅ \n'],
      information:['inne','information','Temat informacji:\n\nNajważniejsze szczegóły:\n'],
      'system-update':['systemy','update','Nazwa systemu i wersja:\nModel tunera:\n\nNajważniejsze elementy konfiguracji:\n✅ \n✅ \n✅ \n']
    };
    const x=map[type];if(!x)return;if(content.value.trim()&&!confirm('Zastąpić obecną treść szablonem?'))return;cat.value=x[0];if(pt)pt.value=x[1];content.value=x[2];content.dispatchEvent(new Event('input'));
  }
  async function loadStats(){
    try{const d=await AIOCommunity.apiGet('stats');Object.entries(d.stats||{}).forEach(([k,v])=>qa(`[data-community-stat="${k}"]`).forEach(el=>el.textContent=Number(v||0).toLocaleString('pl-PL')));}catch(_){}
  }
  boot();
})();
