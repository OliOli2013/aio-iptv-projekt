/* AIO owner-only queue client. Render untrusted account names using textContent only. */
(()=>{'use strict';
  const $=id=>document.getElementById(id), el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text??'');return x;};
  const status=$('status'),list=$('list'),msg=$('message'),scan=$('scan'),refresh=$('refresh'),search=$('search');
  const fmt=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('pl-PL'):'—';
  const pending=v=>Boolean(v&&Date.parse(v)>Date.now());
  async function request(method,body=null,q=''){
    const response=await fetch('/api/aio-account-similarity'+q,{method,credentials:'include',cache:'no-store',
      ...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({ok:false,error:'Niepoprawna odpowiedź serwera.'}));
    if(!response.ok||!data.ok){const e=new Error(data.error||'Błąd '+response.status);e.status=response.status;throw e;}
    return data;
  }
  function account(name,email,id,banned){
    const box=el('div','account');box.append(el('strong','',name),el('span','',email),el('small','','ID: '+id));
    if(pending(banned))box.append(el('p','muted','Osobna aktywna blokada profilu — nie wynika z tego audytu.'));
    return box;
  }
  function finding(row){
    const box=el('article','finding');
    const top=el('div','row');const state=el('span','tag '+row.status,
      row.status==='pending'?'Do ręcznej kontroli':row.status==='confirmed'?'Potwierdzone ręcznie':'Niepotwierdzone ręcznie');
    top.append(state,el('span','tag'+(row.level==='wysoki'?' strong':''),'Sygnały: '+row.score+'/100 • '+(row.level||'do wyjaśnienia')));
    box.append(top);
    const pair=el('div','pair');pair.append(account(row.name_a,row.email_a,row.user_a,row.ban_a),account(row.name_b,row.email_b,row.user_b,row.ban_b));box.append(pair);
    const ul=el('ul','signals');(row.signals||[]).forEach(s=>ul.append(el('li','',s)));box.append(ul);
    box.append(el('small','','Pierwszy zapis: '+fmt(row.created_at)+' • aktualizacja: '+fmt(row.updated_at)));
    if(row.review_note)box.append(el('p','muted','Notatka weryfikacji: '+row.review_note));
    const acts=el('div','row');
    function button(title,act,klass){const b=el('button',klass,title);b.type='button';b.addEventListener('click',()=>void decide(row,act,b));return b;}
    if(row.status==='pending'){
      acts.append(button('Potwierdź powiązanie','confirm',''),button('Nie potwierdzono powiązania','dismiss','reject'));
    }else acts.append(button('Przywróć do sprawdzenia','reopen','secondary'));
    acts.append(el('small','muted','Działania nie nakładają blokad i nie łączą limitów.'));
    box.append(acts);return box;
  }
  async function load(){
    msg.textContent='Odczyt danych…';list.replaceChildren();
    try{const q='?status='+encodeURIComponent(status.value)+'&q='+encodeURIComponent(search.value.trim());
      const d=await request('GET',null,q);
      $('content').hidden=false;$('login-required').hidden=true;
      $('counts').textContent='Do kontroli: '+(d.totals.pending||0)+' • Potwierdzone: '+(d.totals.confirmed||0)+' • Niepotwierdzone: '+(d.totals.dismissed||0);
      msg.textContent=d.total?'Znaleziono '+d.total+' par. Pokazano '+d.rows.length+(d.total>d.rows.length?' — zawęź wyszukiwanie.':'.'):'Brak par dla wybranych filtrów.';
      for(const r of d.rows)list.append(finding(r));
    }catch(e){if(e.status===401||e.status===403){$('content').hidden=true;$('login-required').hidden=false;}else{$('content').hidden=false;msg.className='error';msg.textContent=e.message;}}
  }
  async function decide(row,action,button){
    const note=action==='reopen'?'Przywrócono do kontroli':prompt(action==='confirm'? 'Uzasadnienie potwierdzenia (min. 8 znaków):':'Dlaczego nie potwierdzono powiązania (min. 8 znaków):','');
    if(note===null||note.trim().length<8)return;
    const actionName=action==='confirm'?'potwierdzić powiązanie':'oznaczyć sprawę jako sprawdzoną';
    if(!confirm('Czy '+actionName+'? Nie powoduje to blokady żadnego konta.'))return;
    button.disabled=true;
    try{await request('POST',{action,pair_id:row.pair_id,note});await load();}
    catch(e){alert('Błąd zapisu: '+e.message);button.disabled=false;}
  }
  scan.addEventListener('click',async()=>{
    if(!confirm('Przeanalizować historię wszystkich kont? Analiza nie blokuje użytkowników.'))return;
    scan.disabled=true;const progress=$('scan-result');progress.hidden=false;progress.textContent='Skanowanie i zapisywanie podejrzeń…';
    try{const r=await request('POST',{action:'scan'});progress.textContent='Przeanalizowano '+r.accounts_scanned+' kont i '+r.candidate_pairs+' par kandydackich. Do kolejki dopasowano '+r.findings+' par. '+(r.large_buckets?'Pominięte liczne grupy wspólnych nazw: '+r.large_buckets+'. ':'')+'Nie zmieniono żadnych blokad.';await load();}
    catch(e){progress.className='error';progress.textContent='Skan nie został zakończony: '+e.message;}finally{scan.disabled=false;}
  });
  status.addEventListener('change',()=>void load());refresh.addEventListener('click',()=>void load());
  search.addEventListener('change',()=>void load());
  void load();
})();
