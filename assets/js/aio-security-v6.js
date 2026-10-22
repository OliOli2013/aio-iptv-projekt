/* AIO V6 — owner-only blocked accounts list, independent of the main UI. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),api='/api/aio-security-v6';
  const el=(tag,txt,cls)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=String(txt);if(cls)x.className=cls;return x;};
  let state={blocks:[],users:[]},chosen=null;
  const status=(txt,bad=false)=>{const n=$('v6-status');n.textContent=txt;n.classList.toggle('bad',bad)};
  const date=x=>x?new Date(x).toLocaleString('pl-PL'):'—';
  async function call(path='',opts={}){const response=await fetch(api+path,{credentials:'include',cache:'no-store',...opts});const j=await response.json().catch(()=>({ok:false,error:'Brak JSON'}));if(!response.ok||!j.ok)throw new Error(j.error||'Błąd serwera '+response.status);return j;}
  async function action(body){try{const d=await call('',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});status(d.message);await refresh();}catch(e){status(e.message,true)}}
  function render(){const target=$('v6-blocks');target.replaceChildren();
    const active=state.blocks.filter(x=>x.status==='active'),awaiting=active.filter(x=>!x.reviewed_at);
    $('v6-summary').textContent=`Aktywne: ${active.length} • Do przeglądu: ${awaiting.length} • Wszystkie wpisy: ${state.blocks.length}`;
    if(!state.blocks.length)target.append(el('p','Brak zarejestrowanych blokad V6.'));
    for(const b of state.blocks){const card=el('article',undefined,'v6-card');
      const h=el('h3',(b.display_name||'Użytkownik')+' — '+b.status+(b.origin==='auto'?' (automatyczna)':b.origin==='v5'?' (istniejąca V5)':' (ręczna)'));card.append(h);
      card.append(el('p','E-mail: '+(b.email||'brak')+' • ID: '+b.user_id));
      card.append(el('p','Powód: '+b.reason));
      card.append(el('p','Dowody: '+(b.evidence||'—')));
      card.append(el('p','Od '+date(b.created_at)+' do '+date(b.expires_at)));
      if(b.origin==='v5'){const link=el('a','Zarządzaj w panelu kont (V5)');link.href='/owner-hub#panel=users';card.append(link);}
      if(b.status==='active'&&b.origin!=='v5'){
        const row=el('div',undefined,'v6-row');
        if(!b.reviewed_at){const read=el('button','✓ Sprawdzono');read.onclick=()=>void action({action:'review',user_id:b.user_id});row.append(read);}
        const release=el('button','Odblokuj konto','v6-danger');release.onclick=()=>{if(confirm('Odblokować konto '+b.display_name+' (ID '+b.user_id+')?'))void action({action:'release',user_id:b.user_id,confirm:true});};row.append(release);card.append(row);
      }target.append(card);
    }
    const u=$('v6-users');u.replaceChildren();if(state.users.length){u.append(el('p','Wybierz konkretne konto po ID (nie po samej nazwie):'));for(const x of state.users){const b=el('button',(x.display_name||'Konto')+' • '+(x.email||'brak e-maila')+' • '+x.id);b.type='button';b.onclick=()=>{chosen=x;$('v6-selected').textContent='Wybrane: '+x.display_name+' • ID '+x.id;u.replaceChildren();};u.append(b);}}
  }
  async function refresh(){try{const q=$('v6-search').value.trim();state=await call(q.length>=2?'?q='+encodeURIComponent(q):'');render();status('Dane odświeżono: '+date(state.updated_at));}catch(e){status('Nie udało się pobrać danych: '+e.message,true)}}
  let timer;
  $('v6-search').addEventListener('input',()=>{chosen=null;$('v6-selected').textContent='Brak wybranego konta';clearTimeout(timer);timer=setTimeout(()=>void refresh(),300)});
  $('v6-refresh').onclick=()=>void refresh();
  $('v6-export').onclick=()=>{
    const clean=v=>{let x=String(v??'');if(/^[=+@-]/.test(x.trim()))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';};
    const cols=['ID konta','Nazwa','E-mail','Status','Źródło','Powód','Dowody','Utworzono','Wygasa','Przejrzano'];
    const data=state.blocks.map(x=>[x.user_id,x.display_name,x.email,x.status,x.origin,x.reason,x.evidence,x.created_at,x.expires_at,x.reviewed_at]);
    const csv='\ufeff'+[cols,...data].map(r=>r.map(clean).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=el('a');link.href=url;link.download='AIO-V6-blokady-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  $('v6-cleanup').onclick=()=>{void action({action:'cleanup',user_id:'00000000-0000-0000-0000-000000000000'})};
  $('v6-block').onclick=()=>{
    if(!chosen){status('Najpierw wybierz konto z wyszukiwarki.',true);return;}
    const why=$('v6-reason').value.trim();if(why.length<10){status('Wpisz przyczynę — min. 10 znaków.',true);return;}
    const value=$('v6-duration').value,hours=value==='permanent'?null:Number(value);
    if(confirm('Zablokować konto '+chosen.display_name+' (ID '+chosen.id+')?\n'+why))void action({action:'block',user_id:chosen.id,reason:why,hours,confirm:true});
  };
  void refresh();
})();
