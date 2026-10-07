
/* Społeczność AIO — Cloudflare post view, 2026-10-08 */
(function(){
  'use strict';
  const q=(s,c=document)=>c.querySelector(s);
  let post=null,comments=[],replyTo=null;
  function boot(){if(!window.AIOCommunity)return;if(AIOCommunity.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});}
  async function init(){
    bind();
    document.addEventListener('aio-community-auth',load);
    await load();
  }
  function bind(){
    const form=q('[data-comment-form]');if(form)form.addEventListener('submit',submitComment);
    const input=q('[data-comment-content]'),count=q('[data-comment-count]');
    if(input&&count){const max=Number(AIOCommunity.config?.maxCommentLength||10000);input.oninput=()=>count.textContent=AIOCommunity.characterLabel(input.value.length,max);input.dispatchEvent(new Event('input'));}
    document.addEventListener('click',handle);
  }
  async function load(){
    const id=new URLSearchParams(location.search).get('id')||'',root=q('[data-community-post]'),commentsRoot=q('[data-community-comments]');
    if(!id){root.innerHTML='<div class="community-error">Brak identyfikatora wpisu.</div>';return;}
    try{
      const d=await AIOCommunity.apiGet('post',{id});post=d.post;comments=d.comments||[];renderPost();renderComments();renderForm();
    }catch(err){
      const msg=AIOCommunity.friendlyError(err);
      if(/Zaloguj/i.test(msg)&&!AIOCommunity.user){
        root.innerHTML='<section class="community-access-gate compact"><div class="community-access-icon">🔒</div><h1>Zaloguj się, aby przeczytać ten wpis</h1><button class="button primary" type="button" data-community-login>Zaloguj się / utwórz konto</button></section>';
        if(commentsRoot)commentsRoot.innerHTML='';
      }else root.innerHTML=`<div class="community-error">${AIOCommunity.escape(msg)}</div>`;
    }
  }
  function renderPost(){
    const root=q('[data-community-post]');if(!root||!post)return;
    const a=post.author||{},cat=AIOCommunity.category(post.category),type=AIOCommunity.postType(post.post_type),imgs=(post.attachments||[]).filter(x=>x.url);
    const canDelete=AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin();
    const canSolve=AIOCommunity.user&&(AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin())&&post.post_type==='problem';
    root.innerHTML=`<article class="community-post-card ${post.kind==='official'?'official':''}">
      <header class="community-post-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div class="community-post-author"><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(post.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a></strong><small>${AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at))}</small></div></header>
      <div class="community-post-content"><div class="community-post-tags">${post.kind==='official'?'<span class="community-status-pill official">✓ Oficjalne</span>':''}<span class="community-status-pill post-type ${AIOCommunity.escapeAttr(type.id)}">${AIOCommunity.escape(type.icon+' '+type.label)}</span>${post.solved?'<span class="community-status-pill solved">✅ Rozwiązane</span>':''}<span class="community-category">${AIOCommunity.escape(cat.icon+' '+cat.label)}</span></div><h1>${AIOCommunity.escape(post.title)}</h1><div class="community-post-text">${AIOCommunity.formatText(post.content)}</div>${imgs.length?`<div class="community-media-grid ${imgs.length===1?'one':''}">${imgs.map(x=>`<img src="${AIOCommunity.escapeAttr(x.url)}" alt="Zdjęcie do wpisu" loading="lazy" data-community-image>`).join('')}</div>`:''}</div>
      <footer class="community-post-footer">${reaction('helpful','👍 Pomocne')}${reaction('works','✅ Działa')}${reaction('thanks','❤️ Dziękuję')}${canSolve?`<button class="community-action solution-action" type="button" data-toggle-solved>${post.solved?'↩ Otwórz ponownie':'✅ Oznacz jako rozwiązane'}</button>`:''}${AIOCommunity.user?`<button class="community-action" type="button" data-follow-post>${post.following?'🔔 Obserwujesz':'🔕 Obserwuj'}</button><button class="community-action" type="button" data-report-current-post>⚑ Zgłoś</button>`:''}${canDelete?'<button class="community-action danger" type="button" data-delete-current-post>Usuń wpis</button>':''}</footer>
    </article>`;
  }
  function reaction(type,label){const r=post.reactions||{};return `<button class="community-reaction ${r.mine===type?'active':''}" type="button" data-post-reaction="${type}">${label} <span>${Number(r[type]||0)}</span></button>`;}
  function renderComments(){
    const root=q('[data-community-comments]');if(!root)return;
    if(!AIOCommunity.user){root.innerHTML='<div class="community-access-gate compact"><h2>Zaloguj się, aby zobaczyć komentarze</h2><button class="button primary" data-community-login>Zaloguj się</button></div>';return;}
    if(!comments.length){root.innerHTML='<div class="community-empty"><strong>Brak odpowiedzi.</strong></div>';return;}
    root.innerHTML=comments.map(c=>{
      const a=c.author||{},best=post.best_comment_id===c.id,canDelete=AIOCommunity.isOwner(c.author_id)||AIOCommunity.isAdmin(),canBest=(AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin())&&!best;
      return `<article class="community-comment ${c.parent_id?'reply ':''}${best?'best-answer':''}" id="comment-${AIOCommunity.escapeAttr(c.id)}">${best?'<div class="community-best-answer-badge">✅ Najlepsza odpowiedź</div>':''}<header class="community-comment-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(c.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a></strong><small>${AIOCommunity.escape(AIOCommunity.timeAgo(c.created_at))}</small></div></header><div class="community-comment-body">${AIOCommunity.formatText(c.content)}</div><div class="community-comment-actions"><button class="community-action" type="button" data-comment-reply="${AIOCommunity.escapeAttr(c.id)}">Odpowiedz</button>${canBest?`<button class="community-action solution-action" data-best-answer="${AIOCommunity.escapeAttr(c.id)}">✅ Oznacz jako rozwiązanie</button>`:''}<button class="community-action" data-report-comment="${AIOCommunity.escapeAttr(c.id)}">Zgłoś</button>${canDelete?`<button class="community-action danger" data-delete-comment="${AIOCommunity.escapeAttr(c.id)}">Usuń</button>`:''}</div></article>`;
    }).join('');
  }
  function renderForm(){
    const guest=q('[data-comment-guest]'),form=q('[data-comment-form]'),locked=q('[data-comment-locked]');
    if(guest)guest.hidden=Boolean(AIOCommunity.user);if(form)form.hidden=!AIOCommunity.user||Boolean(post?.locked);if(locked)locked.hidden=!post?.locked;
  }
  async function submitComment(e){
    e.preventDefault();const input=q('[data-comment-content]',e.currentTarget);if(!input.value.trim())return;
    const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;
    try{await AIOCommunity.api('create_comment',{postId:post.id,content:input.value.trim(),parentId:replyTo?.id||null});input.value='';replyTo=null;await load();AIOCommunity.showToast('Odpowiedź dodana.','success');}
    catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}finally{b.disabled=false;}
  }
  async function handle(e){
    if(!post)return;
    const r=e.target.closest('[data-post-reaction]');if(r){if(!AIOCommunity.requireAuth())return;await safe(()=>AIOCommunity.api('reaction',{postId:post.id,type:r.dataset.postReaction}));await load();return;}
    const rep=e.target.closest('[data-comment-reply]');if(rep){replyTo=comments.find(x=>x.id===rep.dataset.commentReply)||null;q('[data-comment-content]')?.focus();return;}
    const report=e.target.closest('[data-report-current-post]');if(report){await reportTarget('post',post.id);return;}
    const reportC=e.target.closest('[data-report-comment]');if(reportC){await reportTarget('comment',reportC.dataset.reportComment);return;}
    const del=e.target.closest('[data-delete-current-post]');if(del&&confirm('Usunąć wpis?')){await safe(()=>AIOCommunity.api('delete_post',{id:post.id}));location.href='community.html';return;}
    const delC=e.target.closest('[data-delete-comment]');if(delC&&confirm('Usunąć komentarz?')){await safe(()=>AIOCommunity.api('delete_comment',{id:delC.dataset.deleteComment}));await load();return;}
    const follow=e.target.closest('[data-follow-post]');if(follow){await safe(()=>AIOCommunity.api('subscribe',{postId:post.id}));await load();return;}
    const solved=e.target.closest('[data-toggle-solved]');if(solved){await safe(()=>AIOCommunity.api('toggle_solved',{id:post.id}));await load();return;}
    const best=e.target.closest('[data-best-answer]');if(best){await safe(()=>AIOCommunity.api('best_answer',{postId:post.id,commentId:best.dataset.bestAnswer}));await load();}
  }
  async function reportTarget(type,id){const reason=prompt('Powód zgłoszenia:');if(!reason)return;await safe(()=>AIOCommunity.api('report',{targetType:type,targetId:id,reason}));}
  async function safe(fn){try{await fn();}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}}
  boot();
})();
