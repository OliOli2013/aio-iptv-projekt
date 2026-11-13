/* Owner-only read-only restriction search — no sensitive reason is rendered in public UI. */
(()=>{'use strict';
 const $=id=>document.getElementById(id), ui={results:$('results'),feedback:$('feedback'),summary:$('summary'),prev:$('prev'),next:$('next'),page:$('page-info')};
 let offset=0, seq=0, data=null;
 const fmt=t=>{if(!t)return '—';const d=new Date(t);return Number.isNaN(d.valueOf())?String(t):d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'})};
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n};
 const stat=(label,num)=>{const n=el('div','stat');n.append(el('strong','',num),el('span','muted',label));return n};
 function render(d){
  data=d;ui.summary.replaceChildren(stat('Pasujących wpisów'+(!d.complete?' (częściowe)':''),d.totals.records),stat('Unikalnych kont'+(!d.complete?' (częściowe)':''),d.totals.accounts),stat('Aktywnych wpisów w wynikach',d.totals.active_records));
  ui.results.replaceChildren();const users=new Map();for(const r of d.rows){if(!users.has(r.user_id))users.set(r.user_id,[]);users.get(r.user_id).push(r)}
  for(const rows of users.values()){
   const u=rows[0],box=el('article','user'),head=el('div','userhead'),info=el('div');
   info.append(el('strong','',u.name||'Użytkownik bez nazwy'),el('div','email',u.email||'Brak e-maila'),el('div','meta','ID: '+u.user_id));
   const link=el('a','', 'Otwórz konto w panelu');link.href='/community-admin.html?aio_section=users&aio_user='+encodeURIComponent(u.email||u.name||u.user_id);link.target='_parent';
   head.append(info,link);box.append(head);
   for(const r of rows){const rec=el('div','record '+(r.state==='active'?'active':''));const title=el('strong','',r.source_label);
    const tag=el('span','tag '+(r.state==='active'?'active':''),r.state==='active'?'Aktywna':r.state==='released'?'Zwolniona':'Wygasła');
    const date=el('div','meta','Od: '+fmt(r.started_at)+(r.ends_at?' · Do: '+fmt(r.ends_at):''));
    const reason=el('div','reason',r.reason||'Brak opisu');rec.append(title,tag,date,reason);box.append(rec);
   }ui.results.append(box);
  }
  const issues=[...(d.unavailable||[]).map(x=>x+' (błąd odczytu)'),...(d.truncated_sources||[]).map(x=>x+' (limit wyników)')];
  const report=d.rows.length?'Wyświetlono '+d.rows.length+' wpisów.':'Brak wyników w dostępnych rejestrach.';
  ui.feedback.textContent=(d.complete?'Odczyt kompletny. ':'UWAGA: Wyniki częściowe. Niektórych blokad może brakować. ')+report+
    (issues.length?' Niedostępne/niepełne: '+issues.join(', ')+'.':'')+' Ostatni odczyt: '+fmt(d.checked_at);
  ui.prev.disabled=d.offset<=0;ui.next.disabled=!d.has_more;ui.page.textContent=d.totals.records?(Math.floor(d.offset/d.limit)+1)+' / '+Math.max(1,Math.ceil(d.totals.records/d.limit)):'0 wyników';
 }
 async function load(){const token=++seq,form=$('block-search');const q=$('q').value.trim(),state=$('state').value,source=$('source').value;
  ui.feedback.textContent='Odczyt D1…';ui.prev.disabled=ui.next.disabled=true;
  try{const query=new URLSearchParams({q,state,source,offset:String(offset)}),res=await fetch('/api/aio-owner-block-search?'+query.toString(),{credentials:'same-origin',cache:'no-store'});const d=await res.json();if(!res.ok||!d.ok)throw new Error(d.error||'Błąd serwera');if(token!==seq)return;render(d)}
  catch(e){if(token!==seq)return;ui.feedback.textContent=e?.message||'Nie udało się pobrać danych.';ui.results.replaceChildren();ui.summary.replaceChildren();ui.prev.disabled=ui.next.disabled=true;}
 }
 $('block-search').addEventListener('submit',e=>{e.preventDefault();offset=0;load()});
 ui.prev.addEventListener('click',()=>{offset=Math.max(0,offset-50);load()});ui.next.addEventListener('click',()=>{offset+=50;load()});
 load();
})();
