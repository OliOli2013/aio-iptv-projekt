/* AIO Owner Messages V1 — owner-only compose form; backend rechecks ownership. */
(()=>{'use strict';
 if(window.__aioOwnerMessagesAdminV1)return;window.__aioOwnerMessagesAdminV1=true;
 const API='/api/aio-owner-messages';
 const e=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;};
 const fmt=v=>{const d=new Date(v);return Number.isNaN(+d)?'—':d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'});};
 async function api(url,opts){const r=await fetch(url,{credentials:'include',cache:'no-store',...opts});const data=await r.json().catch(()=>({}));if(!r.ok||data.ok!==true)throw Error(data.error||'HTTP '+r.status);return data;}
 let root,mode,recipient,selectedUser=null,searchField,resultsBox,selection,allCheck,subject,content,sendBtn,status,sent,searchTick=0,busy=false;
 const message=(s,err=false)=>{status.textContent=s;status.classList.toggle('aom1-error',err);};
 function choose(row){selectedUser=row;selection.textContent='Odbiorca: '+row.display_name+' • ID '+row.id+(row.email?' • '+row.email:'');searchField.value=row.display_name;resultsBox.replaceChildren();}
 async function searchUsers(){
   const q=searchField.value.trim();const seq=++searchTick;resultsBox.replaceChildren();
   if(q.length<2){if(!selectedUser)resultsBox.append(e('p','aom1-muted','Wpisz co najmniej 2 znaki nazwy, e-maila lub ID konta.'));return;}
   try{const d=await api(API+'?view=users&q='+encodeURIComponent(q));if(seq!==searchTick)return;
     if(!d.rows?.length){resultsBox.append(e('p','aom1-muted','Nie znaleziono pasujących kont.'));return;}
     for(const user of d.rows){const b=e('button','aom1-search-result',user.display_name+' • ID: '+user.id+(user.email?' • '+user.email:''));b.type='button';b.addEventListener('click',()=>choose(user));resultsBox.append(b);}
   }catch(err){if(seq===searchTick)resultsBox.append(e('p','aom1-error','Błąd wyszukiwania: '+err.message));}
 }
 function setMode(){const all=mode.value==='all';recipient.hidden=all;allCheck.closest('.aom1-all-confirm').hidden=!all;if(!all)allCheck.checked=false;}
 async function send(){
   if(busy)return;
   const audience=mode.value;
   if(audience==='user'&&!selectedUser){message('Wybierz konkretne konto z wyników wyszukiwania.',true);return;}
   if(audience==='all'&&!allCheck.checked){message('Zaznacz potwierdzenie wysyłki do wszystkich.',true);return;}
   const subj=subject.value.trim(),body=content.value.trim();
   if(subj.length<3||subj.length>120||body.length<3||body.length>4000){message('Temat 3–120 znaków; treść 3–4000 znaków.',true);return;}
   const description=audience==='all'?'WSZYSTKICH obecnych kont AIO':selectedUser.display_name+' (ID '+selectedUser.id+')';
   if(!confirm('Wysłać wiadomość do: '+description+'?\n\nTemat: '+subj))return;
   busy=true;sendBtn.disabled=true;message('Wysyłanie wiadomości…');
   const requestId=crypto.randomUUID();
   try{
     const result=await api(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'send',audience,user_id:audience==='user'?selectedUser.id:null,subject:subj,content:body,confirm_all:audience==='all',request_id:requestId})});
     message('✓ Wysłano. Odbiorcy: '+result.recipients+'. Wiadomość będzie widoczna w „Moje konto”.');
     subject.value='';content.value='';allCheck.checked=false;await loadSent();
   }catch(err){message('Nie udało się wysłać wiadomości: '+err.message,true);}
   finally{busy=false;sendBtn.disabled=false;}
 }
 async function loadSent(){
   sent.replaceChildren(e('p','aom1-muted','Odczytywanie wysłanych wiadomości…'));
   try{const d=await api(API+'?view=sent');sent.replaceChildren();
     if(!d.rows?.length){sent.append(e('p','aom1-muted','Nie wysłano jeszcze żadnej wiadomości.'));return;}
     for(const item of d.rows){
       const row=e('article','aom1-sent-row');
       const head=e('div','aom1-item-head');head.append(e('strong','',item.subject),e('time','',fmt(item.created_at)));
       const caption=item.audience==='all'?'Wszyscy użytkownicy (zarejestrowani w chwili wysłania)':item.recipient_name+' • ID '+item.recipient_user_id;
       row.append(head,e('div','aom1-muted',caption+' • przeczytano: '+item.read_count));
       if(item.revoked_at)row.append(e('span','aom1-error','Cofnięto '+fmt(item.revoked_at)));
       else{
         const undo=e('button','aom1-button aom1-undo','Cofnij wiadomość');undo.type='button';
         undo.addEventListener('click',async()=>{
           if(!confirm('Cofnąć tę wiadomość? Przestanie być widoczna nawet u osób, które jeszcze jej nie przeczytały.'))return;
           undo.disabled=true;
           try{await api(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'revoke',id:item.id,confirm:true})});message('Wiadomość została cofnięta.');await loadSent();}
           catch(err){message('Nie udało się cofnąć: '+err.message,true);undo.disabled=false;}
         });row.append(undo);
       }sent.append(row);
     }
   }catch(err){sent.replaceChildren(e('p','aom1-error','Błąd odczytu historii: '+err.message));}
 }
 function init(){const host=document.querySelector('.oh-content');if(!host)return;
   root=e('section','aom1-root aom1-admin');root.id='aio-admin-messages';
   root.append(e('p','aom1-kicker','CENTRUM WŁAŚCICIELA'),e('h2','','✉ Wiadomości do użytkowników'),e('p','aom1-muted','Wysyłaj wiadomości indywidualne lub ogłoszenia do wszystkich obecnych kont. Odczyt jest liczony osobno dla każdego użytkownika.'));
   const form=e('div','aom1-form');
   const label=e('label','aom1-label','Odbiorcy');mode=e('select','aom1-input');
   for(const [value,labelText] of [['user','Wybrane konto'],['all','Wszyscy obecni użytkownicy']]){const opt=e('option','',labelText);opt.value=value;mode.append(opt);}label.append(mode);form.append(label);
   recipient=e('div','aom1-recipient');const pick=e('label','aom1-label','Znajdź użytkownika (nazwa, e-mail lub ID)');
   searchField=e('input','aom1-input');searchField.type='search';searchField.autocomplete='off';searchField.placeholder='Wpisz minimum 2 znaki';
   let debounce;searchField.addEventListener('input',()=>{selectedUser=null;selection.textContent='Nie wybrano odbiorcy';clearTimeout(debounce);debounce=setTimeout(()=>void searchUsers(),320);});
   pick.append(searchField);selection=e('p','aom1-muted','Nie wybrano odbiorcy');resultsBox=e('div','aom1-search-results');recipient.append(pick,selection,resultsBox);form.append(recipient);
   const confirmAll=e('label','aom1-all-confirm');confirmAll.hidden=true;allCheck=e('input');allCheck.type='checkbox';confirmAll.append(allCheck,e('span','','Potwierdzam, że ogłoszenie trafi do wszystkich kont istniejących w momencie wysłania (również tych, które nie są dziś zalogowane).'));form.append(confirmAll);
   mode.addEventListener('change',setMode);
   const sl=e('label','aom1-label','Temat wiadomości');subject=e('input','aom1-input');subject.type='text';subject.maxLength=120;subject.placeholder='Np. Ważna informacja dla użytkowników';sl.append(subject);
   const bl=e('label','aom1-label','Treść wiadomości');content=e('textarea','aom1-input aom1-textarea');content.rows=6;content.maxLength=4000;content.placeholder='Wpisz wiadomość…';bl.append(content);
   sendBtn=e('button','aom1-button aom1-primary','✉ Wyślij wiadomość');sendBtn.type='button';sendBtn.addEventListener('click',()=>void send());
   status=e('p','aom1-status','');status.setAttribute('role','status');form.append(sl,bl,sendBtn,status);root.append(form);
   root.append(e('h3','','Ostatnio wysłane wiadomości'));
   const reload=e('button','aom1-button','↻ Odśwież historię');reload.type='button';reload.addEventListener('click',()=>void loadSent());
   sent=e('div','aom1-sent-list');root.append(reload,sent);
   const before=host.querySelector('.oh-tools');if(before)before.before(root);else host.append(root);
   setMode();void loadSent();
   if(location.hash==='#aio-admin-messages')setTimeout(()=>root.scrollIntoView({behavior:'smooth',block:'start'}),350);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
