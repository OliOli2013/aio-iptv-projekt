/* AIO Owner Messages V1 — inbox; messages become read only after opening. */
(()=>{'use strict';
 if(window.__aioOwnerMessagesAccountV1)return;window.__aioOwnerMessagesAccountV1=true;
 const API='/api/aio-owner-messages';
 const e=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;};
 const fmt=value=>{const d=new Date(value);return Number.isNaN(+d)?'—':d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'});};
 let root,items,status,unreadTag,page=0,selected=null,busy=false,authenticated=false;
 async function req(url,opts){const r=await fetch(url,{credentials:'include',cache:'no-store',...opts});
   const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true){const err=Error(d.error||'HTTP '+r.status);err.status=r.status;throw err;}return d;}
 function notify(){document.dispatchEvent(new Event('aio-owner-messages-updated'));}
 function setStatus(message,isError=false){status.textContent=message;status.classList.toggle('aom1-error',isError);}
 function render(d){
   items.replaceChildren();
   unreadTag.textContent=d.unread?d.unread+' nieprzeczytanych':'Brak nowych wiadomości';
   const rows=d.rows||[];
   if(!rows.length)items.append(e('p','aom1-muted','Nie ma wiadomości w tej części skrzynki.'));
   for(const msg of rows){
     const item=e('article','aom1-item'+(msg.read_at?'':' aom1-unread'));
     const head=e('div','aom1-item-head');head.append(e('strong','',msg.subject),e('time','',fmt(msg.created_at)));
     const kind=e('div','aom1-muted',msg.kind==='post'?'Nowy post • '+msg.sender_name:(msg.audience==='all'?'Wiadomość do wszystkich • '+msg.sender_name:'Wiadomość indywidualna • '+msg.sender_name));
     const action=e('button','aom1-button',msg.kind==='post'?'📄 Zobacz powiadomienie':(msg.read_at?'Otwórz ponownie':'✉ Otwórz wiadomość'));action.type='button';
     const body=e('div','aom1-body');body.hidden=true;
     action.addEventListener('click',async()=>{
       if(busy)return;busy=true;action.disabled=true;
       try{
         const data=await req(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'open',id:msg.id})});
         body.replaceChildren(e('p','aom1-text',data.message.body));
         if(msg.kind==='post' && /^post\.html\?id=[a-z0-9_-]{8,100}$/i.test(String(data.message.post_url||''))){const link=e('a','apn-post-link','Otwórz pełny post →');link.href=data.message.post_url;body.append(link);}
         body.hidden=false;
         item.classList.remove('aom1-unread');action.textContent='Wiadomość otwarta';
         unreadTag.textContent=data.unread?data.unread+' nieprzeczytanych':'Brak nowych wiadomości';
         notify();setStatus('Wiadomość została otwarta.');
       }catch(err){setStatus('Nie udało się otworzyć wiadomości. Spróbuj ponownie.',true);}finally{busy=false;action.disabled=false;}
     });
     item.append(head,kind,action,body);items.append(item);
   }
   const nav=e('div','aom1-pager');const prev=e('button','aom1-button','← Nowsze');prev.disabled=page===0;
   prev.addEventListener('click',()=>{page=Math.max(0,page-40);void load();});
   const more=e('button','aom1-button','Starsze →');more.disabled=rows.length<40;
   more.addEventListener('click',()=>{page+=40;void load();});nav.append(prev,more);items.append(nav);
 }
 async function load(){
   setStatus('Odczytywanie skrzynki…');
   try{const d=await req(API+'?view=inbox&offset='+page);authenticated=true;render(d);setStatus('Ostatnia aktualizacja: '+new Date().toLocaleTimeString('pl-PL'));}
   catch(err){authenticated=false;items.replaceChildren();unreadTag.textContent='—';
     if(err.status===401||err.status===403){setStatus('Zaloguj się i potwierdź e-mail, aby przeczytać wiadomości od administracji.');}
     else setStatus('Nie udało się pobrać wiadomości. Spróbuj ponownie później.',true);
   }
 }
 function init(){const host=document.querySelector('.aio-account-main');if(!host)return;
   root=e('section','aom1-root aom1-inbox');root.id='aio-messages';
   const top=e('div','aom1-top');const title=e('div');title.append(e('p','aom1-kicker','WIADOMOŚCI PRYWATNE'),e('h2','','✉ Moje wiadomości i powiadomienia'),e('p','aom1-muted','Wiadomości od administracji i informacje o nowych postach. Dopiero otwarcie oznacza je jako przeczytane.'));
   unreadTag=e('span','aom1-count','—');top.append(title,unreadTag);
   const tools=e('div','aom1-actions');const reload=e('button','aom1-button','↻ Odśwież skrzynkę');reload.type='button';reload.addEventListener('click',()=>void load());tools.append(reload);
   status=e('p','aom1-status','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   items=e('div','aom1-list');root.append(top,tools,status,items);
   const before=host.querySelector('.aio-account-panels');if(before)before.before(root);else host.append(root);
   void load();
   document.addEventListener('aio-community-auth',()=>{page=0;void load();});
   if(location.hash==='#aio-messages')setTimeout(()=>root.scrollIntoView({behavior:'smooth',block:'start'}),350);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
