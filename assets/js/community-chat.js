/* Społeczność AIO — Czat V4.1 */
(function(){
  'use strict';
  const q=(s,c=document)=>c.querySelector(s);
  let rows=[],replyTo=null,pollTimer=null,busy=false;
  const emojiList=['😀','😃','😄','😁','😂','😊','🙂','😉','😍','🤔','😎','👍','👎','👏','❤️','🔥','💡','✅','❌','⚠️','📺','🔧','🛰️','💻','📱','🎉'];

  function boot(){if(!window.AIOCommunity)return;if(AIOCommunity.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});}
  async function init(){
    const gate=q('[data-chat-gate]'),app=q('[data-chat-app]');
    if(!AIOCommunity.user){if(gate)gate.hidden=false;if(app)app.hidden=true;return;}
    if(gate)gate.hidden=true;if(app)app.hidden=false;
    setupComposer();await loadMessages(true);startPolling();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPolling();else{loadMessages(false);startPolling();}});
    document.addEventListener('aio-community-auth',()=>{if(!AIOCommunity.user){stopPolling();if(gate)gate.hidden=false;if(app)app.hidden=true;}});
  }
  function startPolling(){stopPolling();pollTimer=setInterval(()=>loadMessages(false),15000);}
  function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

  function setupComposer(){
    const form=q('[data-chat-form]'),text=q('[data-chat-text]'),emojiButton=q('[data-chat-emoji-toggle]'),emojiPanel=q('[data-chat-emojis]'),imageInput=q('[data-chat-images]'),preview=q('[data-chat-preview]');
    emojiPanel.innerHTML=emojiList.map(e=>`<button type="button" data-chat-emoji="${e}" aria-label="${e}">${e}</button>`).join('');
    emojiButton.onclick=()=>{emojiPanel.hidden=!emojiPanel.hidden;};
    emojiPanel.onclick=e=>{const b=e.target.closest('[data-chat-emoji]');if(!b)return;const emoji=b.dataset.chatEmoji||'';const start=text.selectionStart??text.value.length,end=text.selectionEnd??start;text.value=text.value.slice(0,start)+emoji+text.value.slice(end);text.focus();text.selectionStart=text.selectionEnd=start+emoji.length;};
    imageInput.onchange=()=>{preview.innerHTML='';Array.from(imageInput.files||[]).slice(0,2).forEach(file=>{const fig=document.createElement('figure'),img=document.createElement('img'),url=URL.createObjectURL(file);img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);fig.appendChild(img);preview.appendChild(fig);});};
    q('[data-chat-reply-cancel]').onclick=()=>setReply(null);
    q('[data-chat-refresh]').onclick=()=>loadMessages(true);
    q('[data-chat-messages]').addEventListener('click',handleMessageClick);

    form.onsubmit=async e=>{
      e.preventDefault();if(busy)return;
      const content=text.value.trim(),files=Array.from(imageInput.files||[]).slice(0,2);
      if(!content&&!files.length){AIOCommunity.showToast('Napisz wiadomość lub dodaj zdjęcie.','error');return;}
      const send=q('[data-chat-send]');busy=true;send.disabled=true;send.textContent='Wysyłam…';const uploaded=[];
      try{
        for(const file of files)uploaded.push(await AIOCommunity.uploadMedia(file,'chat'));
        const attachments=uploaded.map(x=>({key:x.key||x.path||'',path:x.key||x.path||'',name:x.name||'obraz',type:x.type||'image/jpeg',size:Number(x.size||0)}));
        await AIOCommunity.api('chat_send',{content,replyTo:replyTo?.id||'',attachments});
        text.value='';imageInput.value='';preview.innerHTML='';setReply(null);emojiPanel.hidden=true;await loadMessages(true);
      }catch(err){
        for(const item of uploaded){try{await fetch('/api/community-media?key='+encodeURIComponent(item.key),{method:'DELETE',credentials:'include',cache:'no-store'});}catch(_){}}
        AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');
      }finally{busy=false;send.disabled=false;send.textContent='Wyślij';}
    };
  }

  async function loadMessages(scrollToBottom=false){
    if(busy||!AIOCommunity.user)return;
    const status=q('[data-chat-status]');
    try{status.textContent='Aktualizuję…';const d=await AIOCommunity.apiGet('chat');rows=d.rows||[];render();const online=Number(d.online?.count||0);const names=(d.online?.users||[]).map(x=>x.display_name).filter(Boolean);status.textContent=`Czat aktywny • ${online} online • odświeżanie co 15 s`;status.title=names.length?`Online: ${names.join(', ')}`:'';if(scrollToBottom)scrollBottom();}
    catch(err){status.textContent=AIOCommunity.friendlyError(err);}
  }

  function render(){
    const root=q('[data-chat-messages]');
    if(!rows.length){root.innerHTML='<div class="community-empty"><strong>Czat jest jeszcze pusty.</strong><p>Napisz pierwszą wiadomość.</p></div>';return;}
    root.dataset.messageCount=String(rows.filter(m=>m.status!=='deleted').length);
    root.innerHTML=rows.map(m=>{
      if(m.status==='deleted')return `<article class="aio-chat-message is-deleted" data-chat-message="${AIOCommunity.escapeAttr(m.id)}"><div class="aio-chat-bubble"><em>Wiadomość została usunięta.</em></div></article>`;
      const mine=AIOCommunity.user?.id===m.author?.id,canDelete=mine||AIOCommunity.isAdmin(),reactions=m.reactions||{},reply=m.reply_preview;
      return `<article class="aio-chat-message ${mine?'is-mine':''}" data-chat-message="${AIOCommunity.escapeAttr(m.id)}">
        <div class="aio-chat-avatar">${AIOCommunity.avatarHtml(m.author,m.author?.display_name||'Użytkownik')}</div>
        <div class="aio-chat-body">
          <div class="aio-chat-meta"><strong>${AIOCommunity.escape(m.author?.display_name||'Użytkownik')}</strong>${m.author?.role==='admin'?'<span class="aio-chat-role is-admin">Administrator</span>':m.author?.role==='moderator'?'<span class="aio-chat-role is-moderator">Moderator</span>':''}<small>${AIOCommunity.escape(AIOCommunity.formatDate(m.created_at))}</small></div>
          ${reply?`<button class="aio-chat-reply-preview" type="button" data-chat-jump="${AIOCommunity.escapeAttr(reply.id)}"><strong>${AIOCommunity.escape(reply.author_name||'Użytkownik')}</strong><span>${AIOCommunity.escape(reply.status==='deleted'?'Wiadomość usunięta':(reply.content||'Zdjęcie'))}</span></button>`:''}
          <div class="aio-chat-bubble">${AIOCommunity.formatText(m.content||'')}</div>
          ${(m.attachments||[]).length?`<div class="aio-chat-images">${m.attachments.map(a=>`<button type="button" class="aio-chat-image-button"><img src="${AIOCommunity.escapeAttr(a.url)}" alt="${AIOCommunity.escapeAttr(a.name||'Zdjęcie')}" loading="lazy" data-community-image></button>`).join('')}</div>`:''}
          <div class="aio-chat-actions"><button type="button" data-chat-reply>↩ Odpowiedz</button>${['👍','❤️','😂','💡'].map(e=>`<button type="button" class="${reactions.mine?.includes(e)?'active':''}" data-chat-reaction="${e}">${e} ${Number(reactions[e]||0)||''}</button>`).join('')}${canDelete?'<button type="button" class="danger" data-chat-delete>Usuń</button>':''}</div>
        </div></article>`;
    }).join('');
  }

  async function handleMessageClick(e){
    const card=e.target.closest('[data-chat-message]');if(!card)return;const row=rows.find(x=>x.id===card.dataset.chatMessage);if(!row)return;
    if(e.target.closest('[data-chat-reply]')){setReply(row);return;}
    const reaction=e.target.closest('[data-chat-reaction]');
    if(reaction){try{await AIOCommunity.api('chat_reaction',{id:row.id,type:reaction.dataset.chatReaction});await loadMessages(false);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    if(e.target.closest('[data-chat-delete]')){if(!confirm('Usunąć tę wiadomość z czatu?'))return;try{await AIOCommunity.api('chat_delete',{id:row.id});await loadMessages(false);}catch(err){AIOCommunity.showToast(AIOCommunity.friendlyError(err),'error');}return;}
    const jump=e.target.closest('[data-chat-jump]');if(jump){const el=q(`[data-chat-message="${CSS.escape(jump.dataset.chatJump)}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('is-highlighted');setTimeout(()=>el.classList.remove('is-highlighted'),1400);}}
  }

  function setReply(row){replyTo=row||null;const bar=q('[data-chat-reply-bar]'),t=q('[data-chat-reply-text]');if(!row){bar.hidden=true;t.textContent='';return;}bar.hidden=false;t.textContent=`Odpowiadasz: ${row.author?.display_name||'Użytkownik'} — ${(row.content||'Zdjęcie').slice(0,120)}`;q('[data-chat-text]').focus();}
  function scrollBottom(){const root=q('[data-chat-messages]');if(root)root.scrollTop=root.scrollHeight;}
  boot();
})();
