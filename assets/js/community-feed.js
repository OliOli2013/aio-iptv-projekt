
/* Społeczność AIO — Cloudflare feed, 2026-10-08 */
(function(){
  'use strict';
  const state={page:0,search:'',category:'',mode:'latest',loading:false,rows:[],pageSize:12};
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
    if(!AIOCommunity.backendReady){feed.innerHTML='<div class="community-error">Backend Społeczności jest niedostępny.</div>';return;}
    if(news||AIOCommunity.user){await load(true);await loadStats();}
  }
  function fillCategories(){
    const select=q('[data-community-category]');
    const opts=(AIOCommunity.config?.categories||[]).map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');
    if(select)select.innerHTML='<option value="">Wszystkie kategorie</option>'+opts;
    const compose=q('[data-compose-category]');if(compose)compose.innerHTML=opts;
  }
  function syncTabs(){qa('[data-community-mode]').forEach(b=>b.classList.toggle('active',b.dataset.communityMode===state.mode));}
  function bind(){
    const search=q('[data-community-search]'),cat=q('[data-community-category]'),more=q('[data-community-more]');
    if(search){let t;search.oninput=()=>{clearTimeout(t);t=setTimeout(()=>{state.search=search.value.trim();load(true);},300);};}
    if(cat)cat.onchange=()=>{state.category=cat.value;load(true);};
    qa('[data-community-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.communityMode;syncTabs();load(true);});
    if(more)more.onclick=()=>load(false);
    document.addEventListener('aio-community-auth',async()=>{renderAccess();renderCompose();if(news||AIOCommunity.user){await load(true);await loadStats();}});
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
    if(gate)gate.hidden=allowed;if(content)content.hidden=!allowed;
  }
  function renderCompose(){
    const wrap=q('[data-community-compose]');if(!wrap)return;
    q('[data-compose-guest]',wrap)?.toggleAttribute('hidden',Boolean(AIOCommunity.user));
    q('[data-compose-form]',wrap)?.toggleAttribute('hidden',!AIOCommunity.user);
    const official=q('[data-compose-official-wrap]',wrap);if(official)official.hidden=!AIOCommunity.isAdmin();
    const note=q('[data-compose-approval]',wrap);if(note&&AIOCommunity.user)note.textContent=(AIOCommunity.isAdmin()||AIOCommunity.profile?.trusted)?'Twój wpis zostanie opublikowany od razu.':'Pierwszy wpis może wymagać zatwierdzenia.';
  }
  async function load(reset){
    const feed=q('[data-community-feed]'),more=q('[data-community-more]');if(!feed||state.loading)return;
    if(!news&&!AIOCommunity.user){feed.innerHTML='';return;}
    state.loading=true;if(reset){state.page=0;state.rows=[];feed.innerHTML='<div class="community-loading">Ładuję wpisy…</div>';}
    try{
      const d=await AIOCommunity.apiGet('feed',{mode:state.mode,category:state.category,search:state.search,page:state.page,pageSize:state.pageSize});
      state.rows=reset?d.rows:state.rows.concat(d.rows||[]);
      render();if(more)more.hidden=!d.hasMore;if(d.hasMore)state.page++;
    }catch(e){feed.innerHTML=`<div class="community-error"><strong>Nie udało się pobrać wpisów.</strong><p>${AIOCommunity.escape(AIOCommunity.friendlyError(e))}</p></div>`;}
    finally{state.loading=false;}
  }
  function render(){
    const feed=q('[data-community-feed]');
    if(!state.rows.length){feed.innerHTML='<div class="community-empty"><strong>Brak wpisów.</strong><p>Dodaj pierwszy wpis albo zmień filtr.</p></div>';return;}
    feed.innerHTML=state.rows.map(card).join('');
  }
  function card(post){
    const a=post.author||{},cat=AIOCommunity.category(post.category),type=AIOCommunity.postType(post.post_type);
    const images=(post.attachments||[]).filter(x=>x?.url).slice(0,4);
    const canDelete=AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin();
    const limit=Number(post.kind==='official'?(AIOCommunity.config?.officialPreviewLength||3200):(AIOCommunity.config?.postPreviewLength||1400));
    return `<article class="community-post-card ${post.pinned?'pinned ':''}${post.kind==='official'?'official':''}" data-post-id="${AIOCommunity.escapeAttr(post.id)}">
      <header class="community-post-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div class="community-post-author"><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(post.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a>${a.role&&a.role!=='user'?` <span class="community-role ${AIOCommunity.escapeAttr(a.role)}">${AIOCommunity.escape(AIOCommunity.roleLabel(a.role))}</span>`:''}</strong><small>${AIOCommunity.escape([a.tuner_model,a.system_name].filter(Boolean).join(' • ')||(post.kind==='official'?'Oficjalny wpis AIO-IPTV.pl':'Użytkownik Społeczności AIO'))}</small></div><div class="community-post-meta">${AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at))}</div></header>
      <div class="community-post-content"><div class="community-post-tags">${post.kind==='official'?'<span class="community-status-pill official">✓ Oficjalne</span>':''}${post.pinned?'<span class="community-status-pill pinned">📌 Przypięte</span>':''}<span class="community-status-pill post-type ${AIOCommunity.escapeAttr(type.id)}">${AIOCommunity.escape(type.icon+' '+type.label)}</span>${post.solved?'<span class="community-status-pill solved">✅ Rozwiązane</span>':''}<span class="community-category">${AIOCommunity.escape(cat.icon+' '+cat.label)}</span></div>
      <h2><a href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">${AIOCommunity.escape(post.title)}</a></h2>
      <div class="community-post-text">${AIOCommunity.formatText(post.content,limit)}</div>${images.length?`<div class="community-media-grid ${images.length===1?'one':''}">${images.map(x=>`<img src="${AIOCommunity.escapeAttr(x.url)}" alt="Zdjęcie do wpisu" loading="lazy" data-community-image>`).join('')}</div>`:''}</div>
      <footer class="community-post-footer">${reaction(post,'helpful','👍 Pomocne')}${reaction(post,'works','✅ Działa')}${reaction(post,'thanks','❤️ Dziękuję')}<a class="community-action community-open" href="post.html?id=${AIOCommunity.escapeAttr(post.id)}">${AIOCommunity.user?'💬 '+Number(post.comment_count||0)+' odpowiedzi':'🔐 Dyskusja po zalogowaniu'}</a>${AIOCommunity.user?'<button class="community-action" type="button" data-report-post>⚑ Zgłoś</button>':''}${canDelete?'<button class="community-action danger" type="button" data-delete-post>Usuń</button>':''}</footer>
    </article>`;
  }
  function reaction(post,type,label){const r=post.reactions||{};return `<button class="community-reaction ${r.mine===type?'active':''}" type="button" data-reaction="${type}">${label} <span>${Number(r[type]||0)}</span></button>`;}
  async function handleAction(e){
    const row=e.target.closest('[data-post-id]');if(!row)return;const id=row.dataset.postId;
    const react=e.target.closest('[data-reaction]');if(react){if(!AIOCommunity.requireAuth())return;try{await AIOCommunity.api('reaction',{postId:id,type:react.dataset.reaction});await load(true);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    if(e.target.closest('[data-delete-post]')){if(!confirm('Usunąć ten wpis?'))return;try{await AIOCommunity.api('delete_post',{id});await load(true);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    if(e.target.closest('[data-report-post]')){const reason=prompt('Powód zgłoszenia:');if(!reason)return;try{await AIOCommunity.api('report',{targetType:'post',targetId:id,reason});AIOCommunity.showToast('Zgłoszenie wysłane.','success');}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}}
  }
  async function submitPost(e){
    e.preventDefault();if(!AIOCommunity.requireAuth())return;
    const form=e.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const files=Array.from(q('[data-compose-images]',form)?.files||[]).slice(0,Number(AIOCommunity.config?.maxImagesPerPost||4));
      const attachments=[];for(const f of files)attachments.push(await AIOCommunity.uploadMedia(f,'post'));
      const d=await AIOCommunity.api('create_post',{
        title:q('[data-compose-title]',form).value.trim(),content:q('[data-compose-content]',form).value.trim(),
        category:q('[data-compose-category]',form).value,postType:q('[data-compose-post-type]',form)?.value||'problem',
        official:Boolean(q('[data-compose-official]',form)?.checked),attachments
      });
      form.reset();q('[data-compose-preview]',form).innerHTML='';AIOCommunity.showToast(d.status==='pending'?'Wpis oczekuje na zatwierdzenie.':'Wpis opublikowany.','success');await load(true);await loadStats();
    }catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}
    finally{button.disabled=false;}
  }
  function previewImages(e){
    const root=q('[data-compose-preview]');if(!root)return;root.innerHTML='';
    Array.from(e.target.files||[]).slice(0,4).forEach(f=>{const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt='Podgląd';root.appendChild(img);});
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
