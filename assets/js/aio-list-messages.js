/* AIO List V1.4 — message author to owner, including moderation notifications. */
(()=>{'use strict';
 const $=id=>document.getElementById(id), fmt=(s)=>String(s||'');
 const msg=(p,t,cls)=>{const e=document.createElement('p');e.className=cls||'';e.textContent=t;p.append(e);};
 async function api(url,opt={}){const r=await fetch(url,{credentials:'include',cache:'no-store',...opt});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||`HTTP ${r.status}`);return d;}
 async function refresh(){const wrap=$('aluMessages');if(!wrap)return;try{
   const auth=await api('/api/community-auth');wrap.hidden=!auth.authenticated;
   if(!auth.authenticated)return;
   const data=await api('/api/list-inbox');const list=$('aluMyMessages');list.replaceChildren();
   if(!data.items.length)msg(list,'Nie wysyłano jeszcze wiadomości.');
   for(const m of data.items){const c=document.createElement('article');c.className='alu-record';
      const h=document.createElement('strong');h.textContent=(m.kind==='submission'?'Zgłoszenie: ':m.kind==='update'?'Aktualizacja: ':'Wiadomość: ')+fmt(m.subject);c.append(h);
      msg(c,fmt(m.created_at).slice(0,16)+' · '+(m.status==='replied'?'Odpowiedziano':'Przyjęta'), 'alu-small');
      msg(c,m.body);
      if(m.admin_reply)msg(c,'Odpowiedź administratora: '+m.admin_reply,'alu-owner-reply');list.append(c);
   }
 }catch(e){msg($('aluMyMessages'),'Nie udało się odświeżyć wiadomości: '+e.message,'alu-error');}}
 document.addEventListener('DOMContentLoaded',()=>{
   const f=$('aluContactForm');if(!f)return;
   f.addEventListener('submit',async e=>{e.preventDefault();const status=$('aluContactStatus');status.replaceChildren();
     if(!f.reportValidity())return;const b=f.querySelector('button[type=submit]');b.disabled=true;
     try{const d=await api('/api/list-inbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'send',subject:f.elements.subject.value,body:f.elements.message.value})});msg(status,d.message,'alu-success');f.reset();await refresh();}
     catch(x){msg(status,x.message,'alu-error');}finally{b.disabled=false;}
   });
   document.addEventListener('aio-community-ready',refresh);
   document.addEventListener('aio-community-auth',refresh);
   document.addEventListener('aio-list-updated',refresh);
   refresh();
 });
})();
