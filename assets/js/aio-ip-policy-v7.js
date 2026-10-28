/* IP Policy V7 owner dashboard; no third-party dependencies. */
(()=>{'use strict';
 const $=x=>document.getElementById(x),api='/api/aio-ip-policy';let groups=[],holds=[],offset=0,hasMore=false,busy=false,permitTotal=0,globalUnread=0,denials=[],globalDenials=0,historyPending={groups:0,accounts:0};
 function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
 function status(t,err=false){const n=$('ip7-status');if(n){n.textContent=t;n.classList.toggle('ip7-error',err);}}
 async function req(o={}){const r=await fetch(api,{credentials:'include',cache:'no-store',...o});const d=await r.json().catch(()=>({ok:false,error:'Błąd odpowiedzi serwera'}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d;}
 async function action(x){if(busy)return;busy=true;status('Zapisywanie decyzji…');try{const data=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...x,confirm:true})});await refresh();status(data.message);}catch(e){status(e.message,true)}finally{busy=false}}
 const local=x=>x?new Date(x).toLocaleString('pl-PL'):'—';
 function groupCard(group){
  const card=el('article',undefined,'ip7-card');
  card.append(el('h3','Sieć '+group.ip_masked+' • '+group.accounts.length+' zwykłych kont'));
  card.append(el('p','Ostatnia aktywność: '+local(group.last_seen)));
  const ul=el('ul');for(const u of group.accounts){
    if(u.protected||u.owner)continue;
    ul.append(el('li',(u.name||'Konto')+' • ID: '+u.id+
      (u.primary?' • podstawowe':' • dodatkowe')+
      (u.blocked?' • ZABLOKOWANE NA TYM IP':'')+(u.approved?' • ZGODA WŁAŚCICIELA':'')));
  }card.append(ul);
  const pending=Math.max(0,Number(group.pending||0));
  const unread=Math.max(0,Number(group.unreviewed_holds||0));
  const active=Math.max(0,Number(group.active_holds||0));
  card.append(el('p',pending?'Do decyzji: '+pending+' dodatkowe konto/a.':'Brak nowych kont do zablokowania.'));
  card.append(el('p',unread?'🔔 Do zapoznania: '+unread+' aktywnych blokad.':
    active?'✓ Przejrzano '+active+' aktywnych blokad.':'Brak nowych zdarzeń bezpieczeństwa.'));
  const available=Math.max(0,Number(group.signup_permits||0));
  if(available){
    card.append(el('p','Niewykorzystane zgody na nowe rejestracje: '+available));
    const revoke=el('button','↩ Cofnij '+available+' zgodę/y na rejestrację','ip7-danger');
    revoke.type='button';revoke.onclick=()=>{
      if(confirm('Cofnąć niewykorzystane zgody w tej sieci? Konta pozostaną bez zmian.'))
        void action({action:'revoke_signup_permits',ip_key:group.ip_key});
    };card.append(revoke);
  }
  if(unread){const review=el('button','✓ Oznacz '+unread+' blokad/y jako przejrzane');
    review.type='button';review.onclick=()=>{
      if(confirm('Potwierdzić '+unread+' blokad/y z tej sieci? Nie odblokuje to kont.'))
        void action({action:'review_group',ip_key:group.ip_key,ip:group.ip});
    };card.append(review);
  }
  if(pending){const block=el('button','⛔ Zablokuj '+pending+' dodatkowe konto/a','ip7-danger');
    block.type='button';block.onclick=()=>{
      if(confirm('Zablokować dodatkowe zwykłe konta na tym IP?'))
        void action({action:'apply_group',ip_key:group.ip_key,ip:group.ip});
    };card.append(block);
  }
  card.append(el('p','Nowa polityka: żadnych dodatkowych rejestracji ani wyjątków na zajętym IP.'));
  return card;
 }
 function holdCard(h){
  const blocked=h.status==='active',ack=!!h.reviewed;
  const box=el('article',undefined,'ip7-card');
  box.append(el('h3',(h.display_name||'Użytkownik')+' • '+(blocked?'blokada aktywna':'blokada zakończona')));
  box.append(el('p','E-mail: '+(h.email||'brak')+' • ID: '+h.user_id));
  box.append(el('p',h.reason||'Blokada wspólnego IP'));
  box.append(el('p','Zarejestrowano: '+local(h.created_at)));
  if(ack)box.append(el('p','✓ Zapoznano się: '+local(h.reviewed_at)));
  if(!blocked)box.append(el('p','Odblokowano: '+local(h.released_at)+' • decyzja: '+(h.released_by||'system')));
  if(blocked&&!ack){
    const review=el('button','✓ Oznacz jako przejrzane — BEZ odblokowania');review.type='button';
    review.onclick=()=>{if(confirm('Oznaczyć blokadę jako przejrzaną? Konto NADAL będzie zablokowane.'))
      void action({action:'review_hold',user_id:h.user_id,ip_key:h.ip_key});};box.append(review);
  }
  if(blocked)box.append(el('p','Przypisanie IP do pierwszego konta pozostaje aktywne. Zgody na drugie konto są wyłączone.'));
  return box;
 }
 function archiveSection(title,id,items,renderOne){
  const details=el('details',undefined,'ip7-archive');details.id=id;
  const summary=el('summary',title+' ('+items.length+')');details.append(summary);
  const body=el('div',undefined,'ip7-archive-body');
  for(const item of items)body.append(renderOne(item));
  details.append(body);return details;
 }
 function render(){
  const root=$('ip7-groups');
  const openGroups=document.getElementById('ip7-reviewed-groups')?.open===true;
  const openHolds=document.getElementById('ip7-reviewed-holds')?.open===true;
  root.replaceChildren();
  const denialRoot=$('ip7-denials');if(denialRoot){
    denialRoot.replaceChildren();
    const pending=denials.filter(d=>!d.reviewed_at),done=denials.filter(d=>!!d.reviewed_at);
    if(!pending.length)denialRoot.append(el('p','Brak nowych odrzuconych prób w monitoringu V10.'));
    for(const d of pending){
      const card=el('article',undefined,'ip7-card');
      card.append(el('h3',(d.kind==='register'?'Odmowy kolejnej rejestracji':'Odmowy logowania z zajętego IP')+' • sieć '+d.ip_key.slice(0,12)));
      card.append(el('p','Próby: '+Number(d.attempts||0)+' • ostatnia: '+local(d.last_at)));
      if(d.last_user_name)card.append(el('p','Ostatnio sprawdzane konto: '+d.last_user_name));
      if(d.kind==='register')card.append(el('p','Odmówiono utworzenia konta — profil użytkownika nie został utworzony.'));
      const b=el('button','✓ Zapoznano się — bez odblokowania');b.type='button';
      b.onclick=()=>{if(confirm('Oznaczyć próbę jako przejrzaną? Nie zmienia to blokad ani kont.'))void action({action:'review_denial',ip_key:d.ip_key,kind:d.kind});};
      card.append(b);denialRoot.append(card);
    }
    if(done.length){const history=archiveSection('✓ Przejrzane próby — historia','ip7-denial-archive',done,d=>{
      const c=el('article',undefined,'ip7-card');
      c.append(el('h3',(d.kind==='register'?'Rejestracja':'Logowanie')+' • sieć '+d.ip_key.slice(0,12)));
      c.append(el('p','Łącznie prób: '+Number(d.attempts||0)+' • ostatnia: '+local(d.last_at)+' • zapoznano: '+local(d.reviewed_at)));return c;});
      history.open=window.__ip7DenialOpen===true;
      history.addEventListener('toggle',()=>{window.__ip7DenialOpen=history.open;});denialRoot.append(history);
    }
  }
  const unreadTotal=Math.max(0,Number(globalUnread||0));
  const activeHolds=holds.filter(h=>h.status==='active');
  const pendingGroups=groups.filter(g=>Number(g.pending||0)>0||Number(g.unreviewed_holds||0)>0);
  const doneGroups=groups.filter(g=>Number(g.pending||0)===0&&Number(g.unreviewed_holds||0)===0);
  $('ip7-summary').textContent='Widoczne sieci: '+groups.length+' • Do obsługi na tej stronie: '+pendingGroups.length+
    ' • Aktywne blokady: '+activeHolds.length+' • Nieprzejrzane blokady (wszystkie sieci): '+unreadTotal+
    ' • Nowe próby odrzucone: '+globalDenials+' • Sieci do decyzji: '+Number(historyPending.groups||0)+' • Niewykorzystane zgody: '+permitTotal;
  $('ip7-revoke-all').disabled=permitTotal<=0;
  const all=$('ip7-review-all');all.disabled=unreadTotal<=0;
  all.textContent=unreadTotal?'✓ Zapoznaj się ze wszystkimi '+unreadTotal+' nowymi blokadami':'✓ Brak nieprzejrzanych blokad';
  if(!groups.length)root.append(el('p','Brak wspólnych sieci zwykłych użytkowników na tej stronie.'));
  pendingGroups.forEach(g=>root.append(groupCard(g)));
  if(doneGroups.length){const box=archiveSection('✓ Rozpatrzone sieci — rozwiń historię','ip7-reviewed-groups',doneGroups,groupCard);
    box.open=openGroups;root.append(box);}
  $('ip7-next').hidden=!hasMore;
  const list=$('ip7-holds');list.replaceChildren();
  const unread=holds.filter(h=>h.status==='active'&&!h.reviewed);
  const archived=holds.filter(h=>h.status!=='active'||!!h.reviewed);
  if(!unread.length)list.append(el('p','Brak nieprzejrzanych blokad w załadowanej historii.'));
  unread.forEach(h=>list.append(holdCard(h)));
  if(archived.length){const d=archiveSection('✓ Zapoznane i zakończone sprawy — rozwiń historię','ip7-reviewed-holds',archived,holdCard);
    d.open=openHolds;list.append(d);}
 }
 async function refresh(){try{const d=await req();offset=0;groups=d.groups||[];holds=d.holds||[];hasMore=!!d.has_more;permitTotal=Number(d.total_signup_permits||0);globalUnread=Number(d.unreviewed_total||0);denials=d.denial_attempts||[];globalDenials=Number(d.unread_denials||0);historyPending=d.historical_pending||{groups:0,accounts:0};render();status('Odczyt D1: '+local(new Date().toISOString()));}catch(e){status(e.message,true)}}
  $('ip7-revoke-all').onclick=()=>{
    if(busy||permitTotal<1)return;
    if(prompt('Cofniesz WSZYSTKIE '+permitTotal+' niewykorzystane zgody na dodatkową rejestrację. Wpisz COFNIJ, aby potwierdzić:')!=='COFNIJ')return;
    void action({action:'revoke_all_signup_permits'});
  };
  $('ip7-review-all').onclick=()=>{
    if(busy||globalUnread<1)return;
    if(confirm('Potwierdzić wszystkie '+globalUnread+' aktywne nieprzejrzane blokady IP?\nŻadne konto NIE zostanie odblokowane.'))
      void action({action:'review_all_unread'});
  };
  $('ip7-bulk').onclick=async()=>{
   const pendingGroups=groups.filter(g=>Number(g.pending||0)>0);
   if(busy||!pendingGroups.length){status('Nie ma na tej stronie dodatkowych kont wymagających blokady.');return;}
   if(!confirm('Zablokować dodatkowe konta w '+pendingGroups.length+' nierozpatrzonych sieciach? Konto właściciela pozostaje chronione.'))return;
   busy=true;let ok=0,errors=0;
   try{for(const group of pendingGroups){try{const d=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apply_group',ip_key:group.ip_key,ip:group.ip,confirm:true})});ok+=Number(d.held||0);}catch(e){errors++;}status('Przetworzono grupy. Nowe blokady: '+ok+'. Błędy: '+errors+'.');}
     await refresh();status('Zapisano blokady: '+ok+'. Grupy wymagające dodatkowej weryfikacji: '+errors,errors>0);
   }finally{busy=false;}
 };
 $('ip7-refresh').onclick=()=>void refresh();$('ip7-next').onclick=async()=>{try{offset+=5;const r=await fetch(api+'?offset='+offset,{credentials:'include',cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd stronicowania');groups=j.groups||[];holds=j.holds||[];hasMore=!!j.has_more;permitTotal=Number(j.total_signup_permits||0);globalUnread=Number(j.unreviewed_total||0);denials=j.denial_attempts||[];globalDenials=Number(j.unread_denials||0);historyPending=j.historical_pending||{groups:0,accounts:0};render();}catch(e){status(e.message,true)}};
 void refresh();
})();
