/* AIO List V1.4 — only owner can see inbox data. No credentials in browser JS. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const paragraph=(node,txt,cls)=>{const el=document.createElement('p');el.textContent=txt;el.className=cls||'';node.append(el);return el;};
 let loading=false;
 async function call(url,opts={}){const r=await fetch(url,{credentials:'include',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||('HTTP '+r.status));return d;}
 async function post(action,id,reply=''){return call('/api/list-inbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id,reply})});}
 async function refresh(){const pane=$('aio-list-inbox');if(!pane||loading)return;loading=true;
   try{const owner=await call('/api/community-auth');if(!owner.authenticated||!owner.user?.is_owner){pane.hidden=true;return;}
      const data=await call('/api/list-inbox?scope=admin');pane.hidden=false;
      $('aioListInboxBadge').textContent=data.unread+' nowych';
      $('aioListEmailStatus').textContent=data.email_configured?'Powiadomienia e-mail: skonfigurowane (doręczenie zależy od usługi).':'Powiadomienia e-mail: NIEAKTYWNE. Skonfiguruj AIO_RESEND_API_KEY, AIO_NOTIFY_FROM i AIO_NOTIFY_TO w Cloudflare, aby nie zaglądać do skrzynki.';
      const root=$('aioListInboxItems');root.replaceChildren();
      if(!data.items.length){paragraph(root,'Brak wiadomości i zgłoszeń.');return;}
      for(const m of data.items){const item=document.createElement('article');item.className='aio-list-inbox-record';
        const head=document.createElement('div');head.className='aio-list-inbox-head';const strong=document.createElement('strong');strong.textContent=m.subject;
        const flag=document.createElement('span');flag.textContent=m.status==='new'?'Nowa':m.status==='replied'?'Odpowiedziano':'Przeczytana';head.append(strong,flag);item.append(head);
        paragraph(item,(m.sender_name||'Użytkownik')+' · '+String(m.created_at).slice(0,16)+' · '+m.kind,'aio-list-inbox-small');
        paragraph(item,m.body);
        if(m.email_status==='failed')paragraph(item,'Uwaga: nie udało się wysłać e-maila. Wiadomość została zapisana w skrzynce.','aio-list-inbox-warning');
        if(m.admin_reply)paragraph(item,'Twoja odpowiedź: '+m.admin_reply,'aio-list-inbox-reply');
        const controls=document.createElement('div');controls.className='aio-list-inbox-buttons';
        if(m.list_id){const a=document.createElement('a');a.href='aio-list-upload.html#aluAdmin';a.textContent='Przejdź do moderacji';a.className='button';controls.append(a);}
        if(m.status==='new'){const b=document.createElement('button');b.type='button';b.textContent='Oznacz jako przeczytane';b.className='button';b.onclick=async()=>{try{await post('read',m.id);await refresh();}catch(e){alert(e.message);}};controls.append(b);}
        const reply=document.createElement('button');reply.type='button';reply.textContent='Odpowiedz';reply.className='button';reply.onclick=async()=>{const t=prompt('Odpowiedź dla autora:',m.admin_reply||'');if(t===null)return;if(t.trim().length<2)return alert('Wpisz treść odpowiedzi.');try{await post('reply',m.id,t.trim());await refresh();}catch(e){alert(e.message);}};controls.append(reply);item.append(controls);root.append(item);
      }
   }catch(e){const label=$('aioListInboxBadge');if(label)label.textContent='Błąd połączenia';console.warn('AIO inbox:',e.message);}
   finally{loading=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>{if(!$('aio-list-inbox'))return;$('aioListInboxRefresh').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('aio-community-auth',refresh);document.addEventListener('aio-community-ready',refresh);});
})();
