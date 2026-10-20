/* Owner-only user-card extension. Existing moderation actions are unchanged. */
(()=>{'use strict';
 const root=document.querySelector('[data-community-admin]');if(!root)return;
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
 const dt=v=>v?(new Date(v).toLocaleString('pl-PL')):'—';
 const call=async(url,body)=>{
   const r=await fetch(url,{method:body?'POST':'GET',credentials:'include',cache:'no-store',
     ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||('HTTP '+r.status));return d;
 };
 const notify=(msg,kind)=>{if(window.AIOCommunity?.showToast)AIOCommunity.showToast(msg,kind);};
 let activeCard=null;
 function button(text,cls,fn){const b=el('button','aou-btn '+(cls||''),text);b.type='button';b.addEventListener('click',fn);return b;}
 async function read(card,box){
   const id=card.dataset.adminUser;
   box.replaceChildren(el('p','aou-muted','Odczyt danych konta…'));
   try{
     const d=await call('/api/owner-user-access?user_id='+encodeURIComponent(id));
     if(!box.isConnected)return;
     show(card,box,d);
   }catch(e){box.replaceChildren(el('p','aou-error','Nie można odczytać uprawnień: '+e.message));}
 }
 function line(label,value){const x=el('div','aou-info'),a=el('span','',label),b=el('strong','',value);x.append(a,b);return x;}
 function show(card,box,d){
   box.replaceChildren();const u=d.user||{},access=d.entitlement||{},vip=d.vip||{},grant=d.grant||{};
   const h=el('div','aou-title');h.append(el('h3','','Dostępy i bezpieczeństwo'),button('Zamknij','secondary',()=>{box.remove();activeCard=null;}));box.append(h);
   const status=el('div','aou-stats');
   status.append(line('E-mail',access.email_verified?'Zweryfikowany':'Niezweryfikowany'),
     line('VIP',vip.active?'Aktywny do '+dt(vip.expires_at):'Nieaktywny'),
     line('Dostęp 7 dni',grant.active?((grant.source==='owner_manual_grant'?'Ręczny':grant.source==='verified_receipt'||grant.source==='owner_verified_support'?'Potwierdzone wsparcie':'Inny')+' • do '+dt(grant.expires_at)):'Brak aktywnego'),
     line('Darmowy limit',access.free_remaining===null?'Bez limitu':(access.free_remaining===undefined?'—':access.free_remaining+' / '+(access.free_limit||3))),
     line('Sesje',String(d.active_sessions??0)),
     line('Ostatnie logowanie',dt(u.last_login_at)));
   box.append(status);
   const sub=el('p','aou-muted','VIP obejmuje 30 dni od aktywacji. Dostęp ręczny obejmuje 7 dni i nie jest potwierdzeniem wpłaty. Nie omija blokad bezpieczeństwa ani wymaganej weryfikacji e-mail.');box.append(sub);
   const feedback=el('p','aou-feedback');feedback.setAttribute('role','status');box.append(feedback);
   const actions=el('div','aou-actions');box.append(actions);
   const run=async(label,fn)=>{try{if(!box.isConnected)return;feedback.textContent=label+'…';actions.querySelectorAll('button').forEach(x=>x.disabled=true);const r=await fn();notify(r.message||'Zapisano zmianę','success');await read(card,box);}catch(e){feedback.textContent='Błąd: '+e.message;actions.querySelectorAll('button').forEach(x=>x.disabled=false);notify(e.message,'error');}};
   if(vip.active){
     actions.append(button('Wyłącz VIP','danger',()=>{
       if(!confirm('Wyłączyć VIP dla '+u.name+' ('+u.email+')? Inne dostępy pozostaną.'))return;
       void run('Wyłączanie VIP',()=>call('/api/owner-vip',{action:'revoke',user_id:u.id,confirm:true}));
     }));
   }else{
     actions.append(button('Aktywuj VIP — 30 dni','primary',()=>{
       const note=prompt('Powód / notatka właściciela dla '+u.name+':','Ręczna aktywacja VIP');if(note===null)return;
       if(!confirm('Nadać VIP na 30 dni dla '+u.name+' ('+u.email+')?'))return;
       void run('Aktywowanie VIP',()=>call('/api/owner-vip',{action:'activate',email:u.email,note,confirm:true}));
     }));
   }
   if(grant.active&&grant.source==='owner_manual_grant'){
     actions.append(button('Cofnij ręczne 7 dni','danger',()=>{
       const reason=prompt('Powód cofnięcia dostępu 7-dniowego:','Decyzja właściciela');if(reason===null||reason.trim().length<5)return;
       if(!confirm('Cofnąć ręczny dostęp 7-dniowy dla '+u.name+'?'))return;
       void run('Cofanie dostępu',()=>call('/api/owner-user-access',{action:'revoke_manual_grant',user_id:u.id,reason,confirm:true}));
     }));
   }else{
     const paid=grant.active&&['owner_verified_support','verified_receipt'].includes(grant.source);
     if(!paid)actions.append(button('Przyznaj 7 dni bez limitu','primary',()=>{
       const reason=prompt('Powód ręcznego nadania dostępu (np. nagroda, pomoc, testy):','Ręczne przyznanie przez właściciela');if(reason===null||reason.trim().length<5)return;
       if(!confirm('Nadać 7 dni nielimitowanego pobierania dla '+u.name+' ('+u.email+')?'))return;
       void run('Nadawanie 7 dni',()=>call('/api/owner-user-access',{action:'grant_7_days',user_id:u.id,reason,confirm:true}));
     }));
   }
   if(Number(d.active_sessions||0)>0)actions.append(button('Wyloguj wszystkie sesje','secondary',()=>{
     const reason=prompt('Powód zakończenia sesji (np. podejrzenie udostępniania konta):','Kontrola bezpieczeństwa konta');if(reason===null||reason.trim().length<5)return;
     if(!confirm('Zakończyć wszystkie sesje ('+d.active_sessions+') dla '+u.name+'? Użytkownik będzie musiał zalogować się ponownie.'))return;
     void run('Zakończenie sesji',()=>call('/api/owner-user-access',{action:'revoke_user_sessions',user_id:u.id,reason,confirm:true}));
   }));
 }
 async function open(card){const existing=card.querySelector('.aou-detail');if(existing){existing.remove();activeCard=null;return;}
   if(activeCard&&activeCard!==card)activeCard.querySelector('.aou-detail')?.remove();activeCard=card;
   const panel=el('section','aou-detail');panel.setAttribute('aria-label','Uprawnienia konta');card.append(panel);await read(card,panel);
 }
 function enhance(){if(!window.AIOCommunity?.isAdmin?.())return;
   root.querySelectorAll('[data-admin-user]').forEach(card=>{if(card.dataset.aouReady)return;
     const actions=card.querySelector('.community-admin-actions');if(!actions)return;
     const b=button('★ Dostępy i bezpieczeństwo','aou-open',()=>void open(card));actions.prepend(b);card.dataset.aouReady='1';
   });
 }
 function init(){if(!window.AIOCommunity?.isAdmin?.())return;
   const observer=new MutationObserver(enhance);observer.observe(root,{childList:true,subtree:true});enhance();
   document.addEventListener('aio-community-auth',()=>{if(!window.AIOCommunity?.isAdmin?.()){observer.disconnect();root.querySelectorAll('.aou-detail').forEach(e=>e.remove());}});
 }
 if(window.AIOCommunity?.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});
})();
