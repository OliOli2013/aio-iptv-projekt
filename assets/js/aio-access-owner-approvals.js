/* AIO Access V4.1: owner's private, reviewable approval queue. */
(()=>{'use strict';
 const el=(name,text)=>{const e=document.createElement(name);if(text!==undefined)e.textContent=text;return e;};
 const fmt=v=>{try{return new Date(v).toLocaleString('pl-PL');}catch{return String(v||'');}};
 async function api(body){const admin=!body;const r=await fetch('/api/aio-access-approvals'+(admin?'?scope=admin':''),{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Błąd AIO Access.');return d;}
 let panel,records,info,badge;
 async function refresh(){
   try{const d=await api();const list=d.requests||[];const pending=list.filter(x=>x.status==='pending');badge.textContent=pending.length+' oczekujących';records.replaceChildren();
     for(const m of list){const card=el('article');card.className='aio-approval-owner-card';
       const title=el('strong',(m.display_name||'Użytkownik')+' — '+m.method+(m.priority_sent_at?' · PILNE':''));card.append(title);
       card.append(el('p','Konto: '+(m.email||'brak e-maila')+' · '+fmt(m.created_at)+' · '+m.status));
       card.append(el('p','ID: '+m.id));
       if(m.priority_message)card.append(el('p','Prośba autora: '+m.priority_message));
       if(m.review_reason)card.append(el('p','Decyzja: '+m.review_reason));
       if(m.status==='pending'){
         const controls=el('div');controls.className='aio-approval-actions';
         const yes=el('button','Potwierdź wpłatę i przyznaj 7 dni');yes.className='aio-approval-primary';yes.type='button';
         yes.addEventListener('click',async()=>{
           if(!confirm('Czy sprawdzono w BuyCoffee / Ko-fi / Revolut faktyczną wpłatę dla tego konta?\n\nKliknij OK tylko po weryfikacji.'))return;
           yes.disabled=true;try{const d=await api({action:'approve',id:m.id,verified:true});info.textContent=d.message;await refresh();}catch(e){info.textContent=e.message;}finally{yes.disabled=false;}
         });
         const no=el('button','Odrzuć');no.type='button';no.addEventListener('click',async()=>{
           const reason=prompt('Uzasadnienie odrzucenia:', 'Nie potwierdzono wpłaty. Skontaktuj się z administratorem.');if(reason===null)return;
           try{const d=await api({action:'reject',id:m.id,reason});info.textContent=d.message;await refresh();}catch(e){info.textContent=e.message;}
         });controls.append(yes,no);card.append(controls);
       }records.append(card);
     }
     if(!list.length)records.append(el('p','Brak zgłoszeń o akceptację dostępu.'));
   }catch(e){info.textContent='AIO Access: '+e.message;}
 }
 async function boot(){
   let auth;try{const r=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});auth=await r.json();}catch{return;}
   if(!auth.authenticated||!auth.user?.is_owner)return;
   const hero=document.querySelector('.community-hero');if(!hero)return;
   panel=el('section');panel.className='community-panel community-panel-pad aio-approval-owner';panel.id='aio-access-owner-approvals';
   const head=el('div');head.className='aio-approval-owner-heading';const title=el('h2','AIO Access — akceptacja pobierania');badge=el('span','Ładowanie…');const refreshButton=el('button','Odśwież');refreshButton.className='button';refreshButton.type='button';refreshButton.addEventListener('click',refresh);head.append(title,badge,refreshButton);panel.append(head);
   panel.append(el('p','Zgłoszenia tworzą się automatycznie po zakończeniu ścieżki wsparcia. Zatwierdzaj dopiero po sprawdzeniu faktycznej wpłaty w systemie operatora. Użytkownik otrzymuje 7 dni od zatwierdzenia.'));info=el('p');info.setAttribute('aria-live','polite');records=el('div');records.className='aio-approval-owner-records';panel.append(info,records);hero.insertAdjacentElement('afterend',panel);
   await refresh();
   setInterval(()=>{if(!document.hidden)void refresh();},60000);
 }
 document.addEventListener('DOMContentLoaded',()=>{void boot();});
})();
