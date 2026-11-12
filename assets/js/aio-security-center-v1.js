/* AIO Unified Security Center V1 — owner-only, no client-side privileges. */
(()=>{'use strict';
 const API='/api/aio-security-center',root=document.getElementById('aio-sec-center');if(!root)return;
 const $=id=>document.getElementById(id);
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
 const fmt=x=>{if(!x)return '—';const d=new Date(x);return Number.isNaN(+d)?String(x):d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'});};
 const number=n=>Number(n||0).toLocaleString('pl-PL');
 const sourceReady=(d,name)=>Array.isArray(d[name]);
 const sourceNum=(d,name)=>sourceReady(d,name)?(d[name][0]?.n??0):'—';
 const sourceLen=(d,name)=>sourceReady(d,name)?d[name].length:'—';
 const metricSafe=(host,title,count,note)=>{const b=make('div','sec-metric');b.append(make('small','',title),make('strong','',count==='—'?'—':number(count)),make('span','',note));host.append(b);};
 const metric=(host,title,count,note)=>{const box=make('div','sec-metric');box.append(make('small','',title),make('strong','',number(count)),make('span','',note||''));host.append(box);};
 const title=(host,text)=>host.append(make('h2','',text));
 const row=(host,head,detail,date,badge)=>{const e=make('div','sec-row'),inside=make('div');inside.append(make('strong','',head),make('p','',detail));e.append(inside,make('time','',fmt(date)));if(badge)e.append(make('span','sec-pill',badge));host.append(e);return e;};
 async function get(){const r=await fetch(API,{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Błąd HTTP '+r.status);return d;}
 async function review(id,kind='anonymous'){if(!confirm('Oznaczyć incydent(y) jako przejrzane? Nie odblokowuje to ruchu ani kont.'))return;
  const action=kind==='distributed'?(id?'review_distributed':'review_all_distributed'):(id?'review_anonymous':'review_all_anonymous');
  const body={action,confirm:true};if(id)body.id=id;
  try{const r=await fetch(API,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);$('sec-feedback').textContent=d.message||'Zapisano.';await refresh();}
  catch(e){$('sec-feedback').textContent='Błąd: '+e.message;}
 }
 function block(host,label){const wrapper=make('section','sec-block'),heading=make('div','sec-block-head');heading.append(make('h2','',label));wrapper.append(heading);host.append(wrapper);return wrapper;}
 function collection(host,items,handler,empty='Brak wpisów w odczytanym zakresie.'){
  if(!items||!items.length){host.append(make('p','sec-muted',empty));return;}
  items.forEach(x=>handler(x));
 }
 function render(data){root.replaceChildren();const d=data.data||{};
  const totals=Object.fromEntries((d.kinds||[]).map(x=>[x.event,Number(x.n)]));
  const metrics=make('div','sec-metrics');root.append(metrics);
  metricSafe(metrics,'Odmowy pobrań / 7 dni',sourceReady(d,'kinds')?(totals.download_denied||0):'—','Rejestr zdarzeń D1');
  metricSafe(metrics,'Błędne logowania / 7 dni',sourceReady(d,'kinds')?(totals.login_failed||0):'—','Nie utożsamiać z osobami');
  metricSafe(metrics,'Blokady anonimów — aktywne',sourceNum(d,'active_anonymous'),'Tylko /pliki/, czasowe 15 min');
  metricSafe(metrics,'Fale do zapoznania',sourceNum(d,'unread_anonymous'),'Anonimowe jedno-IP');
  metricSafe(metrics,'Rozproszone fale — do przeglądu',sourceNum(d,'unread_distributed'),'Jedna kategoria w dzwonku');
  metricSafe(metrics,'Aktywne V6',sourceLen(d,'v6'),'Wyniki: maksymalnie 80 kont');
  metricSafe(metrics,'Aktywne ograniczenia IP V8.2',sourceLen(d,'ip'),'Wyniki: maksymalnie 80 wpisów');
  metricSafe(metrics,'Multikonta V4 — konta wstrzymane',sourceNum(d,'strict_v4_count'),'Wszystkie aktywne blokady V4');
  metricSafe(metrics,'Konta z ograniczeniami — unikalne',sourceNum(d,'restricted_unique'),'V4, V8.2, V6, starsze, VIP i blokady profilu');
  const bar=make('p','sec-muted','Dane z serwera: '+fmt(data.checked_at)+' • analiza dziennika: 7 dni • '+data.note);
  root.append(bar);
  if(data.unavailable?.length)root.append(make('p','sec-warning','Część źródeł jest niedostępna: '+data.unavailable.join(', ')+'. Liczniki mogą być niepełne.'));
  const bursts=block(root,'Anonimowe fale żądań /pliki/');
  const top=make('div','sec-block-head');top.append(make('span','sec-muted','Zapis jednego incydentu na okres ograniczenia; nie pokazujemy surowych adresów IP.'));
  const ack=make('button','','✓ Zapoznaj się ze wszystkimi');ack.type='button';ack.disabled=!Number(d.unread_anonymous?.[0]?.n||0);ack.addEventListener('click',()=>review(null));top.append(ack);bursts.append(top);
  const active=(d.incidents||[]).filter(x=>!x.reviewed_at),closed=(d.incidents||[]).filter(x=>!!x.reviewed_at);
  collection(bursts,active,x=>{const e=row(bursts,'Sieć '+x.network,'Szczyt w 10 s: '+x.hits_10s+' • licznik w minucie: '+x.hits_60s+' • do: '+fmt(x.blocked_until),x.created_at,'Do zapoznania');const btn=make('button','sec-small','Przejrzano');btn.type='button';btn.addEventListener('click',()=>review(x.id));e.append(btn);},'Brak nowych anonimowych incydentów.');
  const hist=make('details','sec-history'),sum=make('summary','','Przejrzane fale — historia ('+closed.length+')');hist.append(sum);collection(hist,closed,x=>row(hist,'Sieć '+x.network,'Ograniczenie czasowe • potwierdzono: '+fmt(x.reviewed_at),x.created_at));bursts.append(hist);
  const spread=block(root,'Rozproszone fale anonimowych żądań — wiele sieci');
  spread.append(make('p','sec-muted','Sygnał: co najmniej 20 odmów z 3 różnych skrótów IP w maksymalnie 15 sekund. Nie jest dowodem wspólnej tożsamości; sam nie blokuje sieci.'));
  const spreadTools=make('div','sec-block-head');
  const spreadAck=make('button','','✓ Zapoznaj się ze wszystkimi');spreadAck.type='button';
  spreadAck.disabled=!Number(d.unread_distributed?.[0]?.n||0);
  spreadAck.addEventListener('click',()=>review(null,'distributed'));
  spreadTools.append(spreadAck);spread.append(spreadTools);
  const fresh=(d.distributed_incidents||[]).filter(x=>!x.reviewed_at),old=(d.distributed_incidents||[]).filter(x=>x.reviewed_at);
  collection(spread,fresh,x=>{const el=row(spread,'Zbiorcza fala rozproszona',x.requests+' odmów / maks. '+x.window_seconds+' s • skrótów sieci: '+x.networks,x.created_at,'Do przejrzenia');
    const b=make('button','sec-small','Przejrzano');b.type='button';b.addEventListener('click',()=>review(x.id,'distributed'));el.append(b);},'Brak nowych fal rozproszonych.');
  const archive=make('details','sec-history');archive.append(make('summary','','Przejrzane fale rozproszone — historia ('+old.length+')'));
  collection(archive,old,x=>row(archive,'Zbiorcza fala',x.requests+' odmów • '+x.networks+' skrótów sieci',x.created_at));spread.append(archive);
  const auth=block(root,'Blokady kont i dostępu');
  const v6=make('details','sec-history');v6.open=true;v6.append(make('summary','','Security V6 ('+(d.v6||[]).length+')'));
  collection(v6,d.v6,x=>row(v6,x.name||'Konto','Powód: '+x.reason+' • do '+fmt(x.expires_at),x.created_at,x.origin));auth.append(v6);
  const ip=make('details','sec-history');ip.append(make('summary','','Polityka IP V8.2 ('+(d.ip||[]).length+')'));
  collection(ip,d.ip,x=>row(ip,x.name||'Konto',x.reason,x.created_at,x.reviewed?'Przejrzana':'Do przejrzenia'));auth.append(ip);
  const v4=make('details','sec-history');v4.open=true;v4.append(make('summary','','Multikonta V4 — wstrzymane konta ('+(sourceReady(d,'strict_v4_count')?sourceNum(d,'strict_v4_count'):'brak odczytu')+')'));
  if(sourceReady(d,'strict_v4'))collection(v4,d.strict_v4,x=>row(v4,x.name||x.user_id,x.reason||'Wstrzymano do wyjaśnienia',x.created_at,'Do wyjaśnienia'));
  else v4.append(make('p','sec-warning','Nie udało się odczytać listy blokad V4.'));
  auth.append(v4);
  for(const [key,label] of [['shared_holds','Starsze — wspólna sieć'],['paid_holds','Starsze — płatne/VIP']]){
    const panel=make('details','sec-history');panel.append(make('summary','',label+' ('+sourceLen(d,key)+')'));
    if(sourceReady(d,key))collection(panel,d[key],x=>row(panel,x.name||x.user_id,'Czasowe ograniczenie do '+fmt(x.expires_at),x.created_at));
    else panel.append(make('p','sec-warning','Odczyt tej kategorii nie powiódł się.'));
    auth.append(panel);
  }
  const tools=make('p','sec-muted');const toV4=make('a','','Otwórz zarządzanie Multikontami V4');toV4.href='/aio-jeden-ip.html';tools.append(toV4);auth.append(tools);
  const patterns=block(root,'Wzorce z dziennika — do weryfikacji');
  patterns.append(make('p','sec-muted','Duża liczba żądań, błędów lub wiele kont za jedną siecią stanowią sygnał do analizy. NIE są dowodem tożsamości ani podstawą automatycznej blokady.'));
  collection(patterns,d.fingerprint_patterns,x=>row(patterns,'Skrót sieci: '+x.network,'Zdarzenia: '+x.requests+' • odmowy: '+x.denied+' • błędne logowania: '+x.failed+' • limit logowania: '+x.throttled+' • ID kont: '+x.accounts,x.last_seen));
  const events=block(root,'Rodzaje zdarzeń (7 dni)');collection(events,d.kinds,x=>row(events,x.event,'Liczba zapisów: '+number(x.n)));
 }
 let working=false;
 async function refresh(){if(working)return;working=true;$('sec-reload').disabled=true;$('sec-status').textContent='Odczytuję D1…';
  try{const d=await get();render(d);$('sec-status').textContent='Ostatni odczyt: '+fmt(d.checked_at);}
  catch(e){$('sec-status').textContent='Nie udało się odczytać: '+e.message;root.replaceChildren(make('p','sec-warning','Centrum dostępne tylko dla zalogowanego, zweryfikowanego właściciela.'));}
  finally{working=false;$('sec-reload').disabled=false;}
 }
 $('sec-reload').addEventListener('click',refresh);
 document.addEventListener('aio-community-auth',refresh);void refresh();
})();
