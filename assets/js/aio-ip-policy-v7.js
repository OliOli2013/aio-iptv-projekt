/* IP Policy V7 owner dashboard; no third-party dependencies. */
(()=>{'use strict';
 const $=x=>document.getElementById(x),api='/api/aio-ip-policy';let groups=[],holds=[],offset=0,hasMore=false,busy=false,permitTotal=0;
 function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
 function status(t,err=false){const n=$('ip7-status');if(n){n.textContent=t;n.classList.toggle('ip7-error',err);}}
 async function req(o={}){const r=await fetch(api,{credentials:'include',cache:'no-store',...o});const d=await r.json().catch(()=>({ok:false,error:'Błąd odpowiedzi serwera'}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d;}
 async function action(x){if(busy)return;busy=true;status('Zapisywanie decyzji…');try{const data=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...x,confirm:true})});await refresh();status(data.message);}catch(e){status(e.message,true)}finally{busy=false}}
 const local=x=>x?new Date(x).toLocaleString('pl-PL'):'—';
 function render(){const root=$('ip7-groups');root.replaceChildren();
  $('ip7-summary').textContent=`Historyczne sieci na tej stronie: ${groups.length} • Dodatkowe konta wymagające decyzji: ${groups.reduce((n,g)=>n+(g.pending||0),0)} • Aktywne blokady: ${holds.length} • Do przejrzenia: ${holds.filter(h=>!h.reviewed).length} • Niewykorzystane zgody na rejestrację: ${permitTotal}`;
  $('ip7-revoke-all').disabled=permitTotal<=0;
  if(!groups.length)root.append(el('p','Nie znaleziono kolejnych grup o wspólnym IP.'));
  for(const group of groups){const card=el('article',undefined,'ip7-card');card.append(el('h3','Sieć '+group.ip_masked+' • '+group.accounts.length+' kont'));
   card.append(el('p','Ostatnia aktywność: '+local(group.last_seen)));
   const ul=el('ul');for(const u of group.accounts){const li=el('li',(u.name||'Konto')+' • ID: '+u.id+(u.owner?' • WŁAŚCICIEL':u.protected?' • WYJĄTEK TESTOWY':u.primary?' • podstawowe':' • dodatkowe')+(u.blocked?' • ZABLOKOWANE NA TYM IP':'')+(u.approved?' • ZGODA WŁAŚCICIELA':''));ul.append(li);}card.append(ul);
   const pending=Number(group.pending||0);card.append(el('p',pending>0?'Do decyzji: '+pending+' aktywne dodatkowe konto/a.':'Brak nowych kont do zablokowania. Historyczne powiązania IP pozostają zapisane do audytu.'));
    const availablePermits=Number(group.signup_permits||0);
    card.append(el('p','Niewykorzystane zgody na nowe rejestracje: '+availablePermits));
    if(availablePermits>0){
      const revoke=el('button','↩ Cofnij '+availablePermits+' zgodę/y na nowe rejestracje','ip7-danger');
      revoke.type='button';revoke.onclick=()=>{
        if(confirm('Cofnąć '+availablePermits+' niewykorzystanych zgód w tej sieci? Nie usunie to kont ani historii.'))
          void action({action:'revoke_signup_permits',ip_key:group.ip_key});
      };card.append(revoke);
    }
   // Lack of new accounts to block is NOT the same as owner acknowledgement.
   const unread=Math.max(0,Number(group.unreviewed_holds||0));
   const active=Math.max(0,Number(group.active_holds||0));
   if(active){
     card.append(el('p',unread?'🔔 Do zapoznania: '+unread+' aktywna/e blokada/y.':'✓ Zapoznano się ze wszystkimi '+active+' aktywnymi blokadami.'));
     const review=el('button',unread?'✓ Oznacz '+unread+' blokad/y jako przejrzane':'✓ Zapoznano się z blokadami');
     review.type='button';review.disabled=!unread;
     review.onclick=()=>{
       if(confirm('Oznaczyć '+unread+' aktywnych blokad z tej sieci jako przejrzane?\nKonta NADAL będą zablokowane na tym IP.'))
         void action({action:'review_group',ip_key:group.ip_key,ip:group.ip});
     };
     card.append(review);
   }
   const btn=el('button',pending?'⛔ Zablokuj '+pending+' dodatkowe konto/a':'✓ Brak nowych kont do blokady','ip7-danger');btn.type='button';btn.disabled=!pending;
   btn.onclick=()=>{if(confirm('Zablokować dodatkowe konta na TYM IP? Konto główne, właściciel, Klos i Beata będą chronione.'))void action({action:'apply_group',ip_key:group.ip_key,ip:group.ip});};card.append(btn);
   const allow=el('button','+ Zezwól na JEDNĄ PRZYSZŁĄ rejestrację');allow.type='button';allow.title='Nie odblokowuje istniejących kont ani nie usuwa historii IP.';allow.onclick=()=>{const reason=prompt('Uzasadnienie zgody na przyszłą rejestrację (minimum 10 znaków):','');if(reason&&reason.trim().length>=10&&confirm('Zezwolić na jedną NOWĄ rejestrację? Dotychczasowe konta i historia pozostaną bez zmian.'))void action({action:'allow_next',ip_key:group.ip_key,ip:group.ip,reason});};card.append(allow);root.append(card);
  }
  $('ip7-next').hidden=!hasMore;
  const list=$('ip7-holds');list.replaceChildren();if(!holds.length)list.append(el('p','Brak aktywnych blokad polityki IP.'));
  for(const h of holds){const box=el('article',undefined,'ip7-card');box.append(el('h3',(h.display_name||'Użytkownik')+' • blokada do wyjaśnienia'));
   box.append(el('p','E-mail: '+(h.email||'brak')+' • ID: '+h.user_id));box.append(el('p',h.reason));box.append(el('p','Od: '+local(h.created_at)));
    box.append(el('p',h.reviewed?'✓ Przejrzano: '+local(h.reviewed_at)+' (blokada pozostaje aktywna)':'🔔 Nowe zdarzenie — wymaga przejrzenia przez właściciela.'));
    if(!h.reviewed){const review=el('button','✓ Oznacz jako przejrzane — BEZ odblokowania');review.type='button';review.onclick=()=>{if(confirm('Oznaczyć zdarzenie jako przejrzane? Konto NADAL będzie zablokowane na tym IP.'))void action({action:'review_hold',user_id:h.user_id,ip_key:h.ip_key});};box.append(review);}
   const button=el('button','✓ Zatwierdź wyjątek i odblokuj');button.type='button';button.onclick=()=>{const reason=prompt('Powód zgody na korzystanie z tego samego IP:','');if(reason&&reason.trim().length>=10&&confirm('Zezwolić temu kontu na używanie wskazanego IP i zdjąć blokadę?'))void action({action:'approve_user',user_id:h.user_id,ip_key:h.ip_key,reason});};box.append(button);list.append(box);
  }
 }
 async function refresh(){try{const d=await req();offset=0;groups=d.groups||[];holds=d.holds||[];hasMore=!!d.has_more;permitTotal=Number(d.total_signup_permits||0);render();status('Odczyt D1: '+local(new Date().toISOString()));}catch(e){status(e.message,true)}}
  $('ip7-revoke-all').onclick=()=>{
    if(busy||permitTotal<1)return;
    if(prompt('Cofniesz WSZYSTKIE '+permitTotal+' niewykorzystane zgody na dodatkową rejestrację. Wpisz COFNIJ, aby potwierdzić:')!=='COFNIJ')return;
    void action({action:'revoke_all_signup_permits'});
  };
  $('ip7-bulk').onclick=async()=>{
   const pendingGroups=groups.filter(g=>Number(g.pending||0)>0);
   if(busy||!pendingGroups.length){status('Nie ma na tej stronie dodatkowych kont wymagających blokady.');return;}
   if(!confirm('Zablokować dodatkowe konta w '+pendingGroups.length+' nierozpatrzonych sieciach? Konta właściciela, Klos i Beata są chronione.'))return;
   busy=true;let ok=0,errors=0;
   try{for(const group of pendingGroups){try{const d=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apply_group',ip_key:group.ip_key,ip:group.ip,confirm:true})});ok+=Number(d.held||0);}catch(e){errors++;}status('Przetworzono grupy. Nowe blokady: '+ok+'. Błędy: '+errors+'.');}
     await refresh();status('Zapisano blokady: '+ok+'. Grupy wymagające dodatkowej weryfikacji: '+errors,errors>0);
   }finally{busy=false;}
 };
 $('ip7-refresh').onclick=()=>void refresh();$('ip7-next').onclick=async()=>{try{offset+=5;const r=await fetch(api+'?offset='+offset,{credentials:'include',cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd stronicowania');groups=j.groups||[];holds=j.holds||[];hasMore=!!j.has_more;permitTotal=Number(j.total_signup_permits||0);render();}catch(e){status(e.message,true)}};
 void refresh();
})();
