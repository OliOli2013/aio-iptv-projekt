(()=>{'use strict';const api='/api/aio-security-intelligence';const root=document.getElementById('root'),status=document.getElementById('status'),filter=document.getElementById('filter');let current=null;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
const date=s=>{const d=new Date(s);return s&&Number.isFinite(+d)?d.toLocaleString('pl-PL'):'—';};
const labels={network:'Powiązanie sieciowe',history_v2:'Anti-Abuse V2',archive_name:'Nazwa z archiwum',archive_email:'E-mail z archiwum',banned_session:'Sesje zablokowanego konta',paid_hold:'VIP/7D',multi_pending:'Multikonta',strict_hold:'Strict V4',vpn_review:'VPN Guard',quota_invalid:'Limit miesięczny',orphan_claim:'Osierocone przypisanie'};
async function request(body){const r=await fetch(api,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Błąd '+r.status);return d;}
async function load(){try{current=await request();render();}catch(e){current=null;root.replaceChildren();status.textContent=e.message;}}
// Exact UUID is passed to the existing owner-only users search; no email in URLs.
function showAccount(host,id,fallback){
 const info=current?.accounts?.[id],line=el('div',undefined,'identity');
 const p=el('p');
 if(info?.state==='live'){
  p.append(el('strong',info.name||fallback||'Użytkownik'),document.createTextNode(' • '+(info.blocked?'zablokowane':'bez blokady profilu')));
  line.append(p,el('p','E-mail: '+(info.email||'brak zapisanego adresu')));
  const a=el('a','Otwórz konto użytkownika ↗','account-link');a.href='/community-admin.html?aio_section=users&aio_user='+encodeURIComponent(id);a.target='_blank';a.rel='noopener noreferrer';line.append(a);
 }else if(info?.state==='archived'){
  p.append(el('strong',info.name||fallback||'Nazwa niezachowana'),document.createTextNode(' • wpis archiwalny; brak profilu'));line.append(p,el('p','E-mail: niedostępny w archiwum.'));
 }else if(info?.state==='missing'){
  p.append(el('strong',fallback||'Nazwa nieustalona'),document.createTextNode(' • brak istniejącego profilu i wpisu w archiwum 32 kont'));line.append(p,el('p','Nie można otworzyć konta ani odzyskać e-maila z tego źródła.'));
 }else if(info?.state==='protected'){line.append(el('p','Profil uprzywilejowany; nie udostępniono danych.'));}
 else{line.append(el('p',(fallback?fallback+' • ':'')+'Dane konta niedostępne w bieżącym odczycie.'));}
 const code=el('p','ID: ');code.append(el('code',id));line.append(code);host.append(line);
}
function render(){root.replaceChildren();const r=current?.report;if(!r){status.textContent='Brak raportu. Uruchom AIO Security Intelligence w GitHub Actions.';return;}const pending=r.cases.filter(x=>!x.reviewed_at);status.textContent='Ostatni audyt: '+date(r.checked_at)+' • '+r.target+' • '+pending.length+' spraw do przejrzenia w pokazanym zakresie.';
 if(current.stale)root.append(el('p','UWAGA: raport starszy niż 30 godzin. Sprawdź harmonogram i ostatni przebieg Actions.','warning'));
 for(const w of r.warnings)root.append(el('p',w,'warning'));
 if(current.identity_incomplete)root.append(el('p','Niepełny odczyt danych identyfikacyjnych. Odśwież raport.','warning'));
 const m=r.metrics,metrics=el('div',undefined,'metrics');for(const [label,n] of [['Profile',m.profiles],['Sprawy do przejrzenia',pending.length],['Wysoki priorytet',pending.filter(x=>x.severity==='high').length],['Rejestracje / 24 h',m.registrations_24h],['Odmowy rejestracji V2 / 24 h',m.denied_signups_v2_24h],['Odmowy pobrań / 24 h',m.download_denied_24h],['Odmowy VPN Guard / 24 h',m.vpn_denials_24h],['Blokady współdzielenia / 24 h',m.paid_holds_24h],['Archiwum',m.archive_count],['Archiwum z e-mail SHA',m.archive_with_email_hash]]){const box=el('div',undefined,'metric');box.append(el('small',label),el('strong',n??'—'));metrics.append(box);}root.append(metrics);
 if(m.archive_with_email_hash===0)root.append(el('p','Brak skrótów e-mail w archiwum — porównanie e-maili niemożliwe. Porównanie nazw jest tylko sygnałem.','muted'));
 const details=el('details');details.append(el('summary','Zakres audytu i liczniki'),el('p',`Historia IP: ${m.ip_rows}; dziennik: ${m.journal_rows}; konta bez potwierdzonych danych sieciowych: ${m.without_authenticated_network}; grupy ze słabym sygnałem błędnego logowania: ${m.weak_failed_login_groups}. Raport nie jest migawką transakcyjną, nie dowodzi ukończenia pobrania ani tożsamości osoby.`));root.append(details);
 const rows=r.cases.filter(x=>filter.value==='all'||(filter.value==='seen'?x.reviewed_at:!x.reviewed_at&&(filter.value!=='high'||x.severity==='high')));root.append(el('h2','Sprawy ('+rows.length+')'));if(!rows.length)root.append(el('p',r.warnings.length?'Brak spraw w pokazanym zakresie; są ostrzeżenia audytu.':'Brak spraw w wybranym widoku.','muted'));
 for(const x of rows){const a=el('article',undefined,x.severity==='high'?'high':'');a.append(el('strong',(x.severity==='high'?'Wysoki priorytet — ':'Do weryfikacji — ')+(labels[x.kind]||x.kind)),el('p',x.detail));for(const u of (x.users||[]))showAccount(a,u.id,u.name);if(x.kind==='orphan_claim'){const id=x.orphan_id||/^Przypisanie sieci bez profilu: ([0-9a-f-]{36}) \(/i.exec(String(x.detail||''))?.[1];if(id)showAccount(a,id);}if(x.user_count>x.users.length)a.append(el('p','Liczba kont w grupie: '+x.user_count));if(x.at)a.append(el('small',date(x.at)));if(x.reviewed_at)a.append(el('p','Przejrzano '+date(x.reviewed_at),'muted'));else{const b=el('button','Oznacz jako przejrzane');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await request({action:'review',key:x.key,checked_at:r.checked_at});await load();}catch(e){status.textContent=e.message;b.disabled=false;}});a.append(b);}root.append(a);}}
 document.getElementById('refresh').addEventListener('click',load);filter.addEventListener('change',()=>{if(current)render();});load();})();
