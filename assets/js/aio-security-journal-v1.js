/* Owner-only Security Journal. API enforces permissions independently of the UI. */
(()=>{'use strict';
 const el=(t,cls,txt)=>{const e=document.createElement(t);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
 const date=v=>{const d=new Date(v);return Number.isNaN(+d)?String(v||'—'):d.toLocaleString('pl-PL');};
 const read=async(url,opts={})=>{const r=await fetch(url,{credentials:'include',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d;};
 const names={login_ok:'Udane logowanie',login_failed:'Błędne dane logowania',login_throttled:'Blokada prób logowania',register_ok:'Rejestracja',logout:'Wylogowanie',password_reset_ok:'Reset hasła',shared_ip_historical:'Historyczne wspólne IP (bez blokady)',shared_ip_hold_created:'Wspólne IP — ograniczenie',shared_ip_hold_released:'Ograniczenie zdjęte',download_denied:'Odrzucone pobranie',download_issued:'Wydany plik',download_hold:'Pobieranie wstrzymane',paid_account_sharing_hold:'Podejrzenie udostępniania płatnego konta',paid_account_sharing_released:'Płatne konto — ręczne odblokowanie',shared_ip_approved:'Zatwierdzona wspólna sieć',shared_ip_approval_revoked:'Cofnięcie zatwierdzenia sieci'};
 let panel,busy=false,pageOffset=0;
 function table(headers,records){const w=el('div','asj-table-wrap'),t=el('table','asj-table'),h=el('thead'),r=el('tr');headers.forEach(s=>r.append(el('th','',s)));h.append(r);t.append(h);const b=el('tbody');for(const record of records){const tr=el('tr');record.forEach(x=>tr.append(el('td','',String(x??'—'))));b.append(tr);}t.append(b);w.append(t);return w;}
 function render(d){const wrap=panel.querySelector('[data-asj-content]');wrap.replaceChildren();
   const cards=el('div','asj-cards');[['Zdarzenia łącznie',d.stats.total],['Ostatnie 24 h',d.stats.day],['Ostatnie 7 dni',d.stats.week],['Wstrzymane konta',d.stats.active_holds]].forEach(([label,n])=>{const c=el('div','asj-card');c.append(el('strong','',String(n)),el('span','',label));cards.append(c)});wrap.append(cards);
   wrap.append(el('h3','','Wspólne IP i płatne konta — decyzje właściciela'));
   const holdList=el('div','asj-holds');const pending=(d.holds||[]).filter(x=>x.active);
   if(!pending.length)holdList.append(el('p','asj-muted','Brak aktywnych ograniczeń pobierania.'));
   for(const h of pending){const item=el('div','asj-hold'),text=el('div');
     const paid=h.kind==='paid';
     text.append(el('strong','',(paid?'Płatne konto • ':'Wspólne IP • ')+h.user_name),
       el('span','',paid?'Różne sieci i urządzenia w 15 minut • do '+date(h.expires_at):'Wspólne IP z kontem: '+h.peer_name+' • do '+date(h.expires_at)));
     if(h.details)text.append(el('span','',h.details));
     const actions=el('div','asj-hold-actions');
     function actionBtn(label,verb,confirmText){const btn=el('button','asj-release',label);btn.type='button';btn.addEventListener('click',async()=>{
       if(!confirm(confirmText))return;
       btn.disabled=true;try{await read('/api/owner-security-journal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:verb,id:h.id})});await refresh();}catch(e){alert(e.message);btn.disabled=false;}
     });actions.append(btn);}
     actionBtn(paid?'Odblokuj (7 dni przerwy)':'Odblokuj (7 dni wyjątku)',paid?'release_paid_hold':'release_hold','Odblokować pobieranie dla '+h.user_name+'?');
     if(!paid)actionBtn('Zatwierdź wspólną sieć (365 dni)','approve_shared_network','Potwierdzasz po weryfikacji, że to konto może korzystać z tej wspólnej sieci przez 365 dni?');
     item.append(text,actions);holdList.append(item);
   }wrap.append(holdList);
   wrap.append(el('h3','','Zatwierdzone wspólne sieci'));
   const approved=(d.allowances||[]);
   if(!approved.length)wrap.append(el('p','asj-muted','Brak zatwierdzonych wyjątków.'));
   for(const a of approved){const row=el('div','asj-hold asj-allow'),caption=el('div');
     caption.append(el('strong','',a.user_name),el('span','','Sieć: IP-'+a.fingerprint+' • wyjątek do '+date(a.expires_at)));
     const btn=el('button','asj-release','Cofnij wyjątek');btn.type='button';btn.addEventListener('click',async()=>{
       if(!confirm('Cofnąć wyjątek dla '+a.user_name+'?'))return;
       btn.disabled=true;try{await read('/api/owner-security-journal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'revoke_shared_network',user_id:a.user_id,fingerprint:a.fingerprint_full})});await refresh();}catch(e){alert(e.message);btn.disabled=false;}
     });row.append(caption,btn);wrap.append(row);
   }
   wrap.append(el('h3','','Rodzaje zdarzeń — 7 dni'));
   wrap.append(table(['Zdarzenie','Liczba'],(d.types||[]).map(x=>[names[x.event]||x.event,x.n])));
   wrap.append(el('h3','','Aktywność kont — 7 dni'));
   wrap.append(table(['Konto','Udane logowania','Błędne logowania','Wszystkie zdarzenia'],(d.users||[]).map(x=>[x.name,x.logins,x.failures,x.n])));
   wrap.append(el('h3','','Ostatnie zdarzenia'));
   wrap.append(table(['Data','Rodzaj','Konto','Urządzenie','IP (skrót)','Dodatkowe informacje'],(d.events||[]).map(x=>[date(x.created_at),names[x.event]||x.event,x.user_name,x.device||'—',x.ip_id?('IP-'+x.ip_id):'—',x.detail||'—'])));
   const pager=el('div','asj-actions');const prev=el('button','asj-reload','← Poprzednie');prev.disabled=pageOffset===0;prev.addEventListener('click',()=>{pageOffset=Math.max(0,pageOffset-150);void refresh();});
   const next=el('button','asj-reload','Następne →');next.disabled=!d.pagination?.has_more;next.addEventListener('click',()=>{pageOffset+=150;void refresh();});
   pager.append(prev,el('span','asj-muted','Pozycje '+((d.events||[]).length?(pageOffset+1):0)+'–'+(pageOffset+(d.events||[]).length)+' z '+d.pagination?.total),next);wrap.append(pager);
   wrap.append(el('p','asj-muted','Dziennik działa od wdrożenia. Wspólne IP ogranicza pobieranie na drugim koncie. Płatne konto jest dodatkowo monitorowane pod kątem równocześnie aktywnych sesji w różnych sieciach i na różnych urządzeniach. Ograniczenia wymagają weryfikacji właściciela.'));
 }
 async function refresh(){if(busy)return;busy=true;const state=panel.querySelector('[data-asj-status]');state.textContent='Pobieranie danych…';try{const d=await read('/api/owner-security-journal?offset='+pageOffset);render(d);state.textContent='Odczyt: '+new Date().toLocaleString('pl-PL');}catch(e){state.textContent='Nie udało się odczytać dziennika: '+e.message;}finally{busy=false;}}
 async function init(){const host=document.querySelector('.aio-account-main')||document.querySelector('.oh-content');if(!host)return;
  // UI is a convenience only; server enforces owner role on all API actions.
  let auth;try{auth=await read('/api/community-auth')}catch(_){return;}
  if(!auth.authenticated||auth.user?.is_owner!==true||auth.email_verified!==true)return;
  panel=el('section','asj-root');panel.id='aio-security-journal';panel.append(el('h2','','Dziennik bezpieczeństwa i logowań'));
  panel.append(el('p','asj-description','Trwałe zdarzenia z serwera, analiza logowań i ostrzeżenia o współdzielonym IP. Tylko dla właściciela AIO.'));
  const actions=el('div','asj-actions'),status=el('span','asj-muted');status.dataset.asjStatus='';const reload=el('button','asj-reload','Odśwież');reload.type='button';reload.addEventListener('click',refresh);actions.append(reload,status);panel.append(actions);const content=el('div','');content.dataset.asjContent='';panel.append(content);
  if(host.classList.contains('oh-content')){const tools=host.querySelector('.oh-tools');host.insertBefore(panel,tools||null)}else{const cards=host.querySelector('.aio-account-panels');host.insertBefore(panel,cards||null)}
  await refresh();
  if(location.hash==='#aio-security-journal')panel.scrollIntoView({block:'start',behavior:'smooth'});
  document.addEventListener('aio-community-auth',async()=>{const s=await read('/api/community-auth').catch(()=>null);if(!s?.user?.is_owner)panel?.remove();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();
