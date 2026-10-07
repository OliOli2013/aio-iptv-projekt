
/* Społeczność AIO — Cloudflare profile, 2026-10-08 */
(function(){
  'use strict';
  const q=(s,c=document)=>c.querySelector(s);
  let data=null;
  function boot(){if(!window.AIOCommunity)return;if(AIOCommunity.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});}
  async function init(){document.addEventListener('aio-community-auth',load);q('[data-profile-form]')?.addEventListener('submit',save);q('[data-profile-avatar-file]')?.addEventListener('change',preview);await load();}
  async function load(){
    const root=q('[data-community-profile]');if(!root)return;
    if(!AIOCommunity.user){root.innerHTML='<section class="community-access-gate compact"><div class="community-access-icon">👤</div><h1>Zaloguj się, aby zobaczyć profile</h1><button class="button primary" data-community-login>Zaloguj się / utwórz konto</button></section>';q('[data-profile-edit-panel]')?.setAttribute('hidden','');return;}
    const id=new URLSearchParams(location.search).get('id')||AIOCommunity.user.id;
    try{data=await AIOCommunity.apiGet('profile',{id});render();}catch(e){root.innerHTML=`<div class="community-error">${AIOCommunity.escape(AIOCommunity.friendlyError(e))}</div>`;}
  }
  function render(){
    const p=data.profile,root=q('[data-community-profile]'),posts=data.posts||[];
    root.innerHTML=`<section class="community-panel community-panel-pad"><div class="community-profile-head">${AIOCommunity.avatarHtml(p,p.display_name)}<div><p class="eyebrow">${AIOCommunity.escape(AIOCommunity.roleLabel(p.role))}</p><h1>${AIOCommunity.escape(p.display_name)}</h1><p>${AIOCommunity.escape([p.tuner_model,p.system_name,p.system_version].filter(Boolean).join(' • ')||'Profil Społeczności AIO')}</p>${p.bio?`<p>${AIOCommunity.formatText(p.bio)}</p>`:''}</div></div></section><section class="community-panel community-panel-pad"><h2>Wpisy użytkownika</h2>${posts.length?posts.map(x=>`<p><a href="post.html?id=${AIOCommunity.escapeAttr(x.id)}"><strong>${AIOCommunity.escape(x.title)}</strong></a> <small>• ${AIOCommunity.escape(AIOCommunity.timeAgo(x.created_at))}</small></p>`).join(''):'<p>Brak widocznych wpisów.</p>'}</section>`;
    const panel=q('[data-profile-edit-panel]');if(panel)panel.hidden=!data.own;
    if(data.own){const f=q('[data-profile-form]');for(const n of ['display_name','tuner_model','system_name','system_version','python_version','bio'])if(f?.elements[n])f.elements[n].value=p[n]||'';const prev=q('[data-profile-avatar-preview]');if(prev)prev.innerHTML=AIOCommunity.avatarHtml(p,p.display_name,false);}
  }
  function preview(e){const f=e.target.files?.[0],prev=q('[data-profile-avatar-preview]');if(f&&prev){const u=URL.createObjectURL(f);prev.innerHTML=`<img class="community-avatar" src="${u}" alt="Podgląd">`;}}
  async function save(e){
    e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type="submit"]');b.disabled=true;
    try{let avatar_key=data.profile.avatar_key||'';const file=q('[data-profile-avatar-file]',f)?.files?.[0];if(file){const up=await AIOCommunity.uploadMedia(file,'avatar');avatar_key=up.key;}
      const payload={avatar_key};for(const n of ['display_name','tuner_model','system_name','system_version','python_version','bio'])payload[n]=f.elements[n].value.trim();
      await AIOCommunity.api('update_profile',payload);const s=await AIOCommunity.authSession();AIOCommunity.user=s.user;AIOCommunity.profile=s.profile||s.user;AIOCommunity.renderAccountBars();await load();AIOCommunity.showToast('Profil zapisany.','success');
    }catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}finally{b.disabled=false;}
  }
  boot();
})();
