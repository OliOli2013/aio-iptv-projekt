/* Owner-only Security Journal. API enforces permissions independently of the UI. */
(()=>{'use strict';
 const el=(t,cls,txt)=>{const e=document.createElement(t);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
 const date=v=>{const d=new Date(v);return Number.isNaN(+d)?String(v||'—'):d.toLocaleString('pl-PL');};
 const read=async(url,opts={})=>{const r=await fetch(url,{credentials:'include',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d;};
 const names={login_ok:'Udane logowanie',login_failed:'Błędne dane logowania',login_throttled:'Blokada prób logowania',register_ok:'Rejestracja',logout:'Wylogowanie',password_reset_ok:'Reset hasła',shared_ip_historical:'Historyczne wspólne IP (bez blokady)',shared_ip_hold_created:'Wspólne IP — ograniczenie',shared_ip_hold_released:'Ograniczenie zdjęte',download_denied:'Odrzucone pobranie',download_issued:'Wydany plik',download_hold:'Pobieranie wstrzymane'};
 let panel,busy=false,pageOffset=0;
 function table(headers,records){const w=el('div','asj-table-wrap'),t=el('table','asj-table'),h=el('thead'),r=el('tr');headers.forEach(s=>r.append(el('th','',s)));h.append(r);t.append(h);const b=el('tbody');for(const record of records){const tr=el('tr');record.forEach(x=>tr.append(el('td','',String(x??'—'))));b.append(tr);}t.append(b);w.append(t);return w;}
 function render(d){const wrap=panel.querySelector('[data-asj-content]');wrap.replaceChildren();
   const cards=el('div','asj-cards');[['Zdarzenia łącznie',d.stats.total],['Ostatnie 24 h',d.stats.day],['Ostatnie 7 dni',d.stats.week],['Wstrzymane konta',d.stats.active_holds]].forEach(([label,n])=>{const c=el('div','asj-card');c.append(el('strong','',String(n)),el('span','',label));cards.append(c)});wrap.append(cards);
   wrap.append(el('h3','','Wspólne IP — decyzje właściciela'));
   const holdList=el('div','asj-holds');const pending=(d.holds||[]).filter(x=>x.active);
   if(!pending.length)holdList.append(el('p','asj-muted','Brak aktywnych ograniczeń pobierania.'));
   for(const h of pending){const item=el('div','asj-hold');const text=el('div');text.append(el('strong','',h.user_name),el('span','','Wspólne IP z kontem: '+h.peer_name+' • do '+date(h.expires_at)));
     const btn=el('button','asj-release','Odblokuj pobieranie');btn.type='button';btn.addEventListener('click',async()=>{
       if(!confirm('Zdjąć ograniczenie pobierania dla '+h.user_name+'?'))return;
       btn.disabled=true;try{await read('/api/owner-security-journal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'release_hold',id:h.id})});await refresh();}catch(e){alert(e.message);btn.disabled=false;}
     });item.append(text,btn);holdList.append(item);
   }wrap.append(holdList);
   wrap.append(el('h3','','Rodzaje zdarzeń — 7 dni'));
   wrap.append(table(['Zdarzenie','Liczba'],(d.types||[]).map(x=>[names[x.event]||x.event,x.n])));
   wrap.append(el('h3','','Aktywność kont — 7 dni'));
   wrap.append(table(['Konto','Udane logowania','Błędne logowania','Wszystkie zdarzenia'],(d.users||[]).map(x=>[x.name,x.logins,x.failures,x.n])));
   wrap.append(el('h3','','Ostatnie zdarzenia'));
   wrap.append(table(['Data','Rodzaj','Konto','Urządzenie','IP (skrót)','Dodatkowe informacje'],(d.events||[]).map(x=>[date(x.created_at),names[x.event]||x.event,x.user_name,x.device||'—',x.ip_id?('IP-'+x.ip_id):'—',x.detail||'—'])));
   const pager=el('div','asj-actions');const prev=el('button','asj-reload','← Poprzednie');prev.disabled=pageOffset===0;prev.addEventListener('click',()=>{pageOffset=Math.max(0,pageOffset-150);void refresh();});
   const next=el('button','asj-reload','Następne →');next.disabled=!d.pagination?.has_more;next.addEventListener('click',()=>{pageOffset+=150;void refresh();});
   pager.append(prev,el('span','asj-muted','Pozycje '+((d.events||[]).length?(pageOffset+1):0)+'–'+(pageOffset+(d.events||[]).length)+' z '+d.pagination?.total),next);wrap.append(pager);
   wrap.append(el('p','asj-muted','Serwerowy dziennik działa od momentu wdrożenia. Nie jest pełną historią sprzed aktualizacji. Samo wspólne IP nie oznacza nadużycia ani nie jest podstawą globalnego bana.'));
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
