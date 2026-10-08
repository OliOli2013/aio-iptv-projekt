/* Społeczność AIO — Cloudflare post view + edycja wpisów/zdjęć, 2026-10-08 */
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
    if(input&&count){
      const max=Number(AIOCommunity.config?.maxCommentLength||10000);
      input.oninput=()=>count.textContent=AIOCommunity.characterLabel(input.value.length,max);
      input.dispatchEvent(new Event('input'));
    }
    document.addEventListener('click',handle);
  }

  async function load(){
    const id=new URLSearchParams(location.search).get('id')||'',root=q('[data-community-post]'),commentsRoot=q('[data-community-comments]');
    if(!id){root.innerHTML='<div class="community-error">Brak identyfikatora wpisu.</div>';return;}
    try{
      const d=await AIOCommunity.apiGet('post',{id});
      post=d.post;comments=d.comments||[];
      renderPost();renderComments();renderForm();
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
    const canManage=AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin();
    const canSolve=AIOCommunity.user&&canManage&&post.post_type==='problem';

    root.innerHTML=`<article class="community-post-card ${post.kind==='official'?'official':''}">
      <header class="community-post-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div class="community-post-author"><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(post.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a></strong><small>${AIOCommunity.escape(AIOCommunity.timeAgo(post.created_at))}</small></div></header>
      <div class="community-post-content"><div class="community-post-tags">${post.kind==='official'?'<span class="community-status-pill official">✓ Oficjalne</span>':''}<span class="community-status-pill post-type ${AIOCommunity.escapeAttr(type.id)}">${AIOCommunity.escape(type.icon+' '+type.label)}</span>${post.solved?'<span class="community-status-pill solved">✅ Rozwiązane</span>':''}<span class="community-category">${AIOCommunity.escape(cat.icon+' '+cat.label)}</span></div><h1>${AIOCommunity.escape(post.title)}</h1><div class="community-post-text">${AIOCommunity.formatText(post.content)}</div>${post.edited_at?`<p class="community-edit-note">✏️ Wpis edytowany ${AIOCommunity.escape(AIOCommunity.timeAgo(post.edited_at))}${post.edit_reason?' • '+AIOCommunity.escape(post.edit_reason):''}</p>`:''}${imgs.length?`<div class="community-media-grid ${imgs.length===1?'one':''}">${imgs.map(x=>`<img src="${AIOCommunity.escapeAttr(x.url)}" alt="Zdjęcie do wpisu" loading="lazy" data-community-image>`).join('')}</div>`:''}</div>
      <footer class="community-post-footer">${reaction('helpful','👍 Pomocne')}${reaction('works','✅ Działa')}${reaction('thanks','❤️ Dziękuję')}${canSolve?`<button class="community-action solution-action" type="button" data-toggle-solved>${post.solved?'↩ Otwórz ponownie':'✅ Oznacz jako rozwiązane'}</button>`:''}${AIOCommunity.user?`<button class="community-action" type="button" data-follow-post>${post.following?'🔔 Obserwujesz':'🔕 Obserwuj'}</button><button class="community-action" type="button" data-report-current-post>⚑ Zgłoś</button>`:''}${canManage?'<button class="community-action" type="button" data-edit-current-post>✏️ Edytuj wpis</button><button class="community-action danger" type="button" data-delete-current-post>Usuń wpis</button>':''}</footer>
    </article>`;
  }

  function reaction(type,label){
    const r=post.reactions||{};
    return `<button class="community-reaction ${r.mine===type?'active':''}" type="button" data-post-reaction="${type}">${label} <span>${Number(r[type]||0)}</span></button>`;
  }

  function renderComments(){
    const root=q('[data-community-comments]');if(!root)return;
    if(!AIOCommunity.user){
      root.innerHTML='<div class="community-access-gate compact"><h2>Zaloguj się, aby zobaczyć komentarze</h2><button class="button primary" data-community-login>Zaloguj się</button></div>';
      return;
    }
    if(!comments.length){root.innerHTML='<div class="community-empty"><strong>Brak odpowiedzi.</strong></div>';return;}
    root.innerHTML=comments.map(c=>{
      const a=c.author||{},best=post.best_comment_id===c.id,canDelete=AIOCommunity.isOwner(c.author_id)||AIOCommunity.isAdmin(),canBest=(AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin())&&!best;
      return `<article class="community-comment ${c.parent_id?'reply ':''}${best?'best-answer':''}" id="comment-${AIOCommunity.escapeAttr(c.id)}">${best?'<div class="community-best-answer-badge">✅ Najlepsza odpowiedź</div>':''}<header class="community-comment-head">${AIOCommunity.avatarHtml(a,a.display_name)}<div><strong><a href="profile.html?id=${AIOCommunity.escapeAttr(c.author_id)}">${AIOCommunity.escape(a.display_name||'Użytkownik')}</a></strong><small>${AIOCommunity.escape(AIOCommunity.timeAgo(c.created_at))}</small></div></header><div class="community-comment-body">${AIOCommunity.formatText(c.content)}</div><div class="community-comment-actions"><button class="community-action" type="button" data-comment-reply="${AIOCommunity.escapeAttr(c.id)}">Odpowiedz</button>${canBest?`<button class="community-action solution-action" data-best-answer="${AIOCommunity.escapeAttr(c.id)}">✅ Oznacz jako rozwiązanie</button>`:''}<button class="community-action" data-report-comment="${AIOCommunity.escapeAttr(c.id)}">Zgłoś</button>${canDelete?`<button class="community-action danger" data-delete-comment="${AIOCommunity.escapeAttr(c.id)}">Usuń</button>`:''}</div></article>`;
    }).join('');
  }

  function renderForm(){
    const guest=q('[data-comment-guest]'),form=q('[data-comment-form]'),locked=q('[data-comment-locked]');
    if(guest)guest.hidden=Boolean(AIOCommunity.user);
    if(form)form.hidden=!AIOCommunity.user||Boolean(post?.locked);
    if(locked)locked.hidden=!post?.locked;
  }

  async function submitComment(e){
    e.preventDefault();
    const input=q('[data-comment-content]',e.currentTarget);
    if(!input.value.trim())return;
    const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;
    try{
      await AIOCommunity.api('create_comment',{postId:post.id,content:input.value.trim(),parentId:replyTo?.id||null});
      input.value='';replyTo=null;await load();
      AIOCommunity.showToast('Odpowiedź dodana.','success');
    }catch(err){
      AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');
    }finally{b.disabled=false;}
  }

  function buildEditDialog(){
    let dialog=q('[data-community-edit-dialog]');
    if(dialog)return dialog;

    dialog=document.createElement('dialog');
    dialog.className='community-dialog';
    dialog.setAttribute('data-community-edit-dialog','');
    dialog.innerHTML=`
      <form class="community-dialog-card community-form" data-community-edit-form style="max-width:860px;width:min(94vw,860px);max-height:90vh;overflow:auto">
        <button class="community-dialog-close" type="button" aria-label="Zamknij">✕</button>
        <p class="eyebrow">Społeczność AIO</p>
        <h2>Edytuj wpis</h2>

        <div class="community-form-row">
          <div class="community-field">
            <label>Rodzaj wpisu</label>
            <select data-edit-post-type required></select>
          </div>
          <div class="community-field">
            <label>Kategoria</label>
            <select data-edit-category required></select>
          </div>
        </div>

        <label class="community-field">
          <span>Tytuł</span>
          <input data-edit-title maxlength="140" minlength="6" required>
        </label>

        <label class="community-field">
          <span>Treść</span>
          <textarea data-edit-content maxlength="50000" minlength="20" rows="14" required></textarea>
          <small data-edit-count></small>
        </label>

        <div class="community-field">
          <label>Obecne zdjęcia</label>
          <div data-edit-existing-images></div>
          <small>Odznacz zdjęcia, które mają zostać usunięte z wpisu.</small>
        </div>

        <div class="community-field">
          <label>Dodaj nowe zdjęcia</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-edit-new-images>
          <small>Łącznie po zapisaniu wpis może mieć maksymalnie 4 zdjęcia.</small>
          <div class="community-image-preview" data-edit-preview></div>
        </div>

        <label class="community-notice success" data-edit-official-wrap hidden>
          <input type="checkbox" data-edit-official> Oficjalny wpis AIO-IPTV.pl
        </label>

        <div class="community-field" data-edit-reason-wrap hidden>
          <label>Powód edycji administracyjnej</label>
          <input data-edit-reason maxlength="500" placeholder="Np. aktualizacja linku, uzupełnienie zdjęć">
        </div>

        <div class="community-form-actions">
          <button class="button primary" type="submit" data-edit-save>Zapisz zmiany</button>
          <button class="button" type="button" data-edit-cancel>Anuluj</button>
        </div>
      </form>`;

    document.body.appendChild(dialog);

    dialog.querySelector('.community-dialog-close').addEventListener('click',()=>dialog.close());
    dialog.querySelector('[data-edit-cancel]').addEventListener('click',()=>dialog.close());
    dialog.querySelector('[data-community-edit-form]').addEventListener('submit',saveEdit);
    dialog.querySelector('[data-edit-new-images]').addEventListener('change',previewEditImages);

    const textarea=dialog.querySelector('[data-edit-content]');
    textarea.addEventListener('input',()=>{
      dialog.querySelector('[data-edit-count]').textContent=AIOCommunity.characterLabel(textarea.value.length,50000);
    });

    return dialog;
  }

  function openEditDialog(){
    if(!post||!(AIOCommunity.isOwner(post.author_id)||AIOCommunity.isAdmin()))return;
    const dialog=buildEditDialog();

    const typeSelect=dialog.querySelector('[data-edit-post-type]');
    const categorySelect=dialog.querySelector('[data-edit-category]');
    typeSelect.innerHTML=(AIOCommunity.config?.postTypes||[]).map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');
    categorySelect.innerHTML=(AIOCommunity.config?.categories||[]).map(x=>`<option value="${AIOCommunity.escapeAttr(x.id)}">${AIOCommunity.escape(x.icon+' '+x.label)}</option>`).join('');

    typeSelect.value=post.post_type||'problem';
    categorySelect.value=post.category||'inne';
    dialog.querySelector('[data-edit-title]').value=post.title||'';
    dialog.querySelector('[data-edit-content]').value=post.content||'';
    dialog.querySelector('[data-edit-content]').dispatchEvent(new Event('input'));

    const officialWrap=dialog.querySelector('[data-edit-official-wrap]');
    const officialInput=dialog.querySelector('[data-edit-official]');
    officialWrap.hidden=!AIOCommunity.isAdmin();
    officialInput.checked=post.kind==='official';

    const reasonWrap=dialog.querySelector('[data-edit-reason-wrap]');
    reasonWrap.hidden=!(AIOCommunity.isAdmin()&&!AIOCommunity.isOwner(post.author_id));
    dialog.querySelector('[data-edit-reason]').value='';

    const existing=dialog.querySelector('[data-edit-existing-images]');
    const attachments=Array.isArray(post.attachments)?post.attachments:[];
    if(!attachments.length){
      existing.innerHTML='<p class="community-muted">Ten wpis nie ma obecnie zdjęć.</p>';
    }else{
      existing.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">${attachments.map((item,index)=>`
        <label style="display:block;border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:10px">
          ${item.url?`<img src="${AIOCommunity.escapeAttr(item.url)}" alt="Zdjęcie ${index+1}" loading="lazy" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px">`:''}
          <span style="display:flex;gap:8px;align-items:center">
            <input type="checkbox" data-keep-attachment="${index}" checked>
            <span>Zachowaj: ${AIOCommunity.escape(item.name||('zdjęcie '+(index+1)))}</span>
          </span>
        </label>`).join('')}</div>`;
    }

    dialog.querySelector('[data-edit-new-images]').value='';
    dialog.querySelector('[data-edit-preview]').innerHTML='';

    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }

  function previewEditImages(e){
    const dialog=q('[data-community-edit-dialog]');
    if(!dialog)return;
    const root=dialog.querySelector('[data-edit-preview]');
    root.innerHTML='';
    const files=Array.from(e.target.files||[]).slice(0,4);
    files.forEach(file=>{
      const figure=document.createElement('figure');
      const img=document.createElement('img');
      const url=URL.createObjectURL(file);
      img.src=url;img.alt=file.name;
      img.onload=()=>URL.revokeObjectURL(url);
      figure.appendChild(img);root.appendChild(figure);
    });
  }

  async function deleteUploadedMedia(key){
    if(!key)return;
    try{
      await fetch('/api/community-media?key='+encodeURIComponent(key),{
        method:'DELETE',credentials:'include',cache:'no-store'
      });
    }catch(_){}
  }

  async function saveEdit(e){
    e.preventDefault();
    if(!post)return;

    const form=e.currentTarget;
    const dialog=form.closest('[data-community-edit-dialog]');
    const save=form.querySelector('[data-edit-save]');
    const title=form.querySelector('[data-edit-title]').value.trim();
    const content=form.querySelector('[data-edit-content]').value.trim();

    if(title.length<6){AIOCommunity.showToast('Tytuł musi mieć co najmniej 6 znaków.','error');return;}
    if(content.length<20){AIOCommunity.showToast('Treść musi mieć co najmniej 20 znaków.','error');return;}

    const oldAttachments=Array.isArray(post.attachments)?post.attachments:[];
    const kept=oldAttachments.filter((_,index)=>{
      const box=form.querySelector(`[data-keep-attachment="${index}"]`);
      return !box||box.checked;
    });

    const files=Array.from(form.querySelector('[data-edit-new-images]').files||[]);
    if(kept.length+files.length>4){
      AIOCommunity.showToast(`Po zapisaniu wpis może mieć maksymalnie 4 zdjęcia. Obecnie wybrano ${kept.length+files.length}.`,'error');
      return;
    }

    save.disabled=true;
    save.textContent='Zapisuję…';
    const uploaded=[];

    try{
      for(const file of files){
        const item=await AIOCommunity.uploadMedia(file,'post');
        uploaded.push(item);
      }

      const response=await fetch('/api/community-edit',{
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          action:'edit_post',
          id:post.id,
          title,
          content,
          category:form.querySelector('[data-edit-category]').value,
          postType:form.querySelector('[data-edit-post-type]').value,
          official:Boolean(form.querySelector('[data-edit-official]')?.checked),
          reason:form.querySelector('[data-edit-reason]')?.value.trim()||'',
          attachments:kept.concat(uploaded).map(x=>({
            key:x.key||x.path||'',
            path:x.key||x.path||'',
            name:x.name||'obraz',
            type:x.type||'image/jpeg',
            size:Number(x.size||0)
          }))
        })
      });

      const data=await response.json().catch(()=>({ok:false,error:'Nieprawidłowa odpowiedź serwera.'}));
      if(!response.ok||data.ok===false)throw new Error(data.error||('HTTP '+response.status));

      dialog.close();
      AIOCommunity.showToast('Wpis został zaktualizowany.','success');
      await load();
    }catch(err){
      for(const item of uploaded)await deleteUploadedMedia(item.key);
      AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');
    }finally{
      save.disabled=false;
      save.textContent='Zapisz zmiany';
    }
  }

  async function handle(e){
    if(!post)return;

    const r=e.target.closest('[data-post-reaction]');
    if(r){if(!AIOCommunity.requireAuth())return;await safe(()=>AIOCommunity.api('reaction',{postId:post.id,type:r.dataset.postReaction}));await load();return;}

    const rep=e.target.closest('[data-comment-reply]');
    if(rep){replyTo=comments.find(x=>x.id===rep.dataset.commentReply)||null;q('[data-comment-content]')?.focus();return;}

    const edit=e.target.closest('[data-edit-current-post]');
    if(edit){e.preventDefault();openEditDialog();return;}

    const report=e.target.closest('[data-report-current-post]');
    if(report){await reportTarget('post',post.id);return;}

    const reportC=e.target.closest('[data-report-comment]');
    if(reportC){await reportTarget('comment',reportC.dataset.reportComment);return;}

    const del=e.target.closest('[data-delete-current-post]');
    if(del&&confirm('Usunąć wpis?')){await safe(()=>AIOCommunity.api('delete_post',{id:post.id}));location.href='community.html';return;}

    const delC=e.target.closest('[data-delete-comment]');
    if(delC&&confirm('Usunąć komentarz?')){await safe(()=>AIOCommunity.api('delete_comment',{id:delC.dataset.deleteComment}));await load();return;}

    const follow=e.target.closest('[data-follow-post]');
    if(follow){await safe(()=>AIOCommunity.api('subscribe',{postId:post.id}));await load();return;}

    const solved=e.target.closest('[data-toggle-solved]');
    if(solved){await safe(()=>AIOCommunity.api('toggle_solved',{id:post.id}));await load();return;}

    const best=e.target.closest('[data-best-answer]');
    if(best){await safe(()=>AIOCommunity.api('best_answer',{postId:post.id,commentId:best.dataset.bestAnswer}));await load();}
  }

  async function reportTarget(type,id){
    const reason=prompt('Powód zgłoszenia:');
    if(!reason)return;
    await safe(()=>AIOCommunity.api('report',{targetType:type,targetId:id,reason}));
  }

  async function safe(fn){
    try{await fn();}
    catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}
  }

  boot();
})();
