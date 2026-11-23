(() => {
  'use strict';
  const $=id=>document.getElementById(id), el=(tag,value)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;return n;};
  const group=()=>{const n=el('div');n.className='row';return n;};
  const button=(title,act)=>{const b=el('button',title);b.type='button';b.addEventListener('click',act);return b;};
  async function api(url,data){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
    const d=await res.json().catch(()=>null);if(!res.ok||!d?.ok)throw Error(d?.error||('Brak odczytu (HTTP '+res.status+').'));return d;
  }
  const labels={profile:'Profil',strict_v42:'Strict V4.2',ip_v8:'Polityka IP V8',ip_v7:'Polityka IP V7',blocked_ip:'Adres sieci',email_block:'Blokada e-maila',security_v6:'Security V6',shared_download:'Współdzielone pobrania',paid_download:'Dostęp płatny',manual_review:'Ręczny przegląd',multikonta_review:'Kontrola powiązań',ip_claim_conflict:'Powiązanie sieci',email_verification:'Weryfikacja e-maila'};
  let offset=0,blockBusy=false,loading=false,stop=false,selected=0,searchSeq=0;
  async function blocks(reset=true){
    if(blockBusy)return;blockBusy=true;$('reload').disabled=$('more').disabled=true;
    if(reset){offset=0;$('blocks').replaceChildren();$('more').hidden=true;}
    try{const d=await api('/api/aio-owner-block-search?state=active&offset='+offset);
      $('totals').textContent=(d.complete?'':'Odczyt częściowy. ')+d.totals.accounts+' różnych kont · '+d.totals.records+' wpisów w 6 rejestrach (jedno konto może mieć kilka).'+
        (d.unavailable?.length?' Niedostępne: '+d.unavailable.join(', ')+'.':'')+(d.truncated_sources?.length?' Źródła z limitem: '+d.truncated_sources.join(', ')+'.':'');
      for(const b of d.rows){const n=group();n.append(el('strong',b.name||'Konto'),el('p',b.source_label+' · '+b.reason),button('Sprawdź konto',()=>openAccount(b.user_id)));$('blocks').append(n);}
      offset+=d.rows.length;$('more').hidden=!d.has_more;
    }catch(e){$('totals').textContent=e.message+' Brak odczytu nie oznacza braku blokad.';}finally{blockBusy=false;$('reload').disabled=$('more').disabled=false;}
  }
  async function metrics(){
    try{const d=await api('/api/owner-safety'),m=$('metrics');m.replaceChildren();
      const mode=v=>v==='enforce'?'egzekwowanie':'obserwacja';
      m.append(el('p','Rejestracja: '+mode(d.register_mode)+' · Logowanie: '+mode(d.login_mode)+'. Konfiguracja dostawcy i HMAC: '+(d.provider_ready?'obecna':'niekompletna')+'.'),
        el('p','Budżet dzienny UTC: '+(d.used??'brak odczytu')+' / '+d.max+'. Skan historyczny rezerwuje do progu '+d.scan_ceiling+'; logowania do '+d.login_ceiling+'; pozostała część jest dla rejestracji. Trafienie w cache nie zużywa budżetu.'),
        el('p','Powiązanie R2 i tryb prywatny: '+(d.r2_configured?'skonfigurowane':'brak lub wyłączone')+'. To nie potwierdza obecności plików ani wyłączenia publicznego dostępu w Cloudflare.'));
      if(!Array.isArray(d.counts)){m.append(el('p','Brak odczytu telemetrii VPN. Sprawdź migrację D1.'));return;}
      const events={vpn_denied:'odmowa VPN',unverified_retry:'weryfikacja niedostępna — ponów',vpn_observed:'VPN w obserwacji',unverified_allowed:'brak wyniku w obserwacji',allowed:'pozostałe ocenione połączenia'};
      const list=el('ul');for(const r of d.counts)list.append(el('li',(r.phase==='login'?'Logowanie':'Rejestracja')+' · '+(events[r.outcome]||r.outcome)+': '+r.n));
      m.append(el('strong','Zarejestrowane kontrole: '+d.day+' UTC (od wdrożenia)'),d.counts.length?list:el('p','Brak zapisanych kontroli w tym dniu.'));
    }catch(e){$('metrics').textContent=e.message;}
  }
  function caseRow(f){
    const n=group(),state=el('p'),name=el('strong',f.name||f.id),info=el('p','Błędne logowania: '+f.failures+' · odmowy z powodu limitu: '+f.limits+'.');
    state.textContent='Ocena: '+({watch:'obserwuj',dismiss:'wyjaśniono',pending:'do sprawdzenia'}[f.state]||'do sprawdzenia');
    if(f.previous)state.append(document.createTextNode(' · Poprzednia notatka: '+f.previous.note));
    const details=el('details'),reason=el('textarea'),label=el('label','Uzasadnienie (8–300 znaków)'),buttons=el('div'),msg=el('p');
    buttons.className='actions';reason.maxLength=300;reason.rows=2;label.append(reason);msg.setAttribute('role','status');
    async function decide(decision){
      if(reason.value.trim().length<8){msg.textContent='Podaj co najmniej 8 znaków.';reason.focus();return;}
      a.disabled=b.disabled=true;
      try{const d=await api('/api/owner-safety',{action:'review',id:f.id,evidence:f.evidence,previous_seq:f.previous_seq,decision,note:reason.value.trim()});
        f.previous_seq=d.seq;state.textContent=(decision==='watch'?'Obserwuj':'Wyjaśniono')+' · '+reason.value.trim();msg.textContent='Zapisano ocenę. Dostęp do konta nie zmienił się.';}
      catch(e){msg.textContent=e.message;}finally{a.disabled=b.disabled=false;}
    }
    const a=button('Obserwuj',()=>decide('watch')),b=button('Oznacz jako wyjaśnione',()=>decide('dismiss'));
    buttons.append(a,b);details.append(el('summary','Zapisz ocenę'),label,buttons,msg);
    n.append(name,info,state,button('Sprawdź ograniczenia konta',()=>openAccount(f.id)),details);return n;
  }
  async function scan(){
    if(loading)return;loading=true;stop=false;$('scan').disabled=true;$('stop').disabled=false;$('cases').replaceChildren();
    let after='',at='',checked=0,found=0;$('progress').textContent='Skanuję pierwszą partię…';
    try{do{const q=new URLSearchParams({view:'scan',after});if(at)q.set('at',at);
      const d=await api('/api/owner-safety?'+q);at=d.at;after=d.next;checked+=d.checked;found+=d.findings.length;
      for(const f of d.findings)$('cases').append(caseRow(f));
      $('progress').textContent=(after?(stop?'Przerwano — wynik częściowy. ':'W trakcie. '):'Skan zakończony. ')+'Sprawdzono kont: '+checked+', do oceny lub wcześniej ocenionych: '+found+'.';
    }while(after&&!stop);}catch(e){$('progress').textContent='Skan niepełny ('+checked+' kont). '+e.message;}
    finally{loading=false;$('scan').disabled=false;$('stop').disabled=true;}
  }
  async function openAccount(id){
    const seq=++selected,root=$('detail');root.textContent='Sprawdzam ograniczenia…';$('konto').scrollIntoView();
    try{const d=await api('/api/owner-unified-access?user_id='+encodeURIComponent(id));if(seq!==selected)return;
      root.replaceChildren();root.append(el('h3',d.user.name),el('p','ID: '+d.user.id));
      const qbox=el('p','Odczytuję limit i uprawnienia…');root.append(qbox);
      void api('/api/owner-safety?view=quota&id='+encodeURIComponent(id)).then(q=>{
        if(seq!==selected)return;
        const fmt=s=>new Date(s).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'}),period=x=>!x.known?'brak odczytu':x.until?'do '+fmt(x.until):'brak aktywnego wpisu';
        qbox.textContent=(q.known?'Pula '+(q.shared?'wspólna':'konta')+': '+q.remaining+'/3.'+(q.resets_at?' Odnowienie: '+fmt(q.resets_at)+'.':''):'Pula: brak odczytu lub brak wyliczonego cyklu. Potwierdź w historii pobrań.')+' VIP: '+period(q.vip)+'; 7D: '+period(q.seven)+'. Aktywne VIP/7D nie zużywają puli. To zapis uprawnień, nie test dostępu.';
      }).catch(()=>{if(seq===selected)qbox.textContent='Brak odczytu limitu i uprawnień. To nie oznacza zera pobrań.';});
      const active=Object.entries(d.signals||{}).filter(([,n])=>n>0).map(([k,v])=>(labels[k]||k)+': '+v);
      root.append(el('p',active.length?active.join(' · '):'Brak znanych ograniczeń w odpowiedzi serwera.'),el('p',d.note));
      const p=el('p');p.setAttribute('role','status');
      const reason=el('textarea'),label=el('label','Uzasadnienie zmiany dostępu (8–300 znaków)');reason.rows=2;reason.maxLength=300;label.append(reason);
      const isBlocked=Number(d.signals.profile)>0,caption=isBlocked?'Zdejmij tylko blokadę profilu':'Ogranicz profil na 30 dni';
      let clear=null,changing=false;
      const b=button(caption,async()=>{
        if(changing)return;
        if(reason.value.trim().length<8){p.textContent='Najpierw wpisz uzasadnienie.';reason.focus();return;}
        if(!window.confirm(caption+' — '+d.user.name+' ('+id+')? '+(isBlocked?'Inne blokady pozostaną bez zmian.':'Aktywne sesje tego konta zostaną wycofane.')))return;
        changing=true;b.disabled=true;if(clear)clear.disabled=true;
        try{const r=await api('/api/owner-security-actions',{action:isBlocked?'unblock_account':'block_account',user_id:id,reason:reason.value.trim(),confirm:true,expected_ban:d.profile_ban_until??null});
          if(seq===selected){await openAccount(id);if(selected===seq+1)$('detail').prepend(el('p',r.message));}void blocks();}
        catch(e){p.textContent=e.message;changing=false;b.disabled=false;if(clear)clear.disabled=!d.can_release;}
      });
      b.className='caution';root.append(label,b,el('p','Powyższy przycisk zmienia wyłącznie blokadę profilu. Nie usuwa konta i nie resetuje limitu pobrań.'));
      for(const item of d.issues||[])root.append(el('p',String(item)));
      if(Object.entries(d.signals||{}).some(([k,v])=>v>0&&k!=='email_verification')){
        clear=button('Przywróć dostęp we wszystkich bezpiecznych warstwach',async()=>{
          if(changing)return;
          const note=reason.value.trim();if(note.length<8){p.textContent='Wpisz uzasadnienie (minimum 8 znaków).';reason.focus();return;}
          if(!d.can_release||!window.confirm('Przywrócić dostęp we wszystkich dozwolonych warstwach dla '+d.user.name+' ('+id+')? Limity i weryfikacja adresu e-mail pozostaną bez zmian.'))return;
          changing=true;clear.disabled=b.disabled=true;
          try{const v=await api('/api/owner-unified-access',{action:'release_all',user_id:id,email:d.user.email,reason:note,confirm:'ODBLOKUJ'});
            if(seq===selected){await openAccount(id);if(selected===seq+1)$('detail').prepend(el('p',v.message||'Ponownie sprawdzono ograniczenia.'));}void blocks();}
          catch(e){p.textContent=e.message;changing=false;clear.disabled=!d.can_release;b.disabled=false;}
        });clear.disabled=!d.can_release;
        root.append(clear);if(!d.can_release)root.append(el('p','Automatyczne zwolnienie niedostępne: sprawdź współdzieloną sieć, cudze przypisanie albo blokadę globalną.'));
      }
      root.append(p);
    }catch(e){if(selected===seq)root.textContent=e.message;}
  }
  $('search').addEventListener('submit',async e=>{e.preventDefault();const s=++searchSeq;++selected;$('detail').replaceChildren();$('matches').replaceChildren();$('lookup-state').textContent='Szukam…';
    try{const r=await api('/api/owner-safety',{action:'find',query:$('query').value.trim()});if(s!==searchSeq)return;
      $('lookup-state').textContent=r.rows.length?'Wybierz właściwe konto:':'Nie znaleziono zwykłego konta.';
      for(const a of r.rows)$('matches').append(button(a.name+' · '+a.id,()=>openAccount(a.id)));}catch(e){if(s===searchSeq)$('lookup-state').textContent=e.message;}});
  $('scan').onclick=scan;$('stop').onclick=()=>{stop=true;$('stop').disabled=true;};
  $('reload').onclick=()=>{void blocks();void metrics();};$('more').onclick=()=>blocks(false);
  void blocks();void metrics();
})();
