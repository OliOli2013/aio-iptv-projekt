/* IP Policy V7 owner dashboard; no third-party dependencies. */
(()=>{'use strict';
 const $=x=>document.getElementById(x),api='/api/aio-ip-policy';let groups=[],holds=[],offset=0,hasMore=false,busy=false;
 function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
 function status(t,err=false){const n=$('ip7-status');if(n){n.textContent=t;n.classList.toggle('ip7-error',err);}}
 async function req(o={}){const r=await fetch(api,{credentials:'include',cache:'no-store',...o});const d=await r.json().catch(()=>({ok:false,error:'Błąd odpowiedzi serwera'}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d;}
 async function action(x){if(busy)return;busy=true;status('Zapisywanie decyzji…');try{const data=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...x,confirm:true})});status(data.message);await refresh();}catch(e){status(e.message,true)}finally{busy=false}}
 const local=x=>x?new Date(x).toLocaleString('pl-PL'):'—';
 function render(){const root=$('ip7-groups');root.replaceChildren();
  $('ip7-summary').textContent=`Grupy na tej stronie wyników: ${groups.length} • Konta objęte blokadą: ${holds.length}`;
  if(!groups.length)root.append(el('p','Nie znaleziono kolejnych grup o wspólnym IP.'));
  for(const group of groups){const card=el('article',undefined,'ip7-card');card.append(el('h3','Sieć '+group.ip_masked+' • '+group.accounts.length+' kont'));
   card.append(el('p','Ostatnia aktywność: '+local(group.last_seen)));
   const ul=el('ul');for(const u of group.accounts){const li=el('li',(u.name||'Konto')+' • ID: '+u.id+(u.owner?' • WŁAŚCICIEL':u.primary?' • podstawowe':' • dodatkowe')+(u.blocked?' • ZABLOKOWANE':'')+(u.approved?' • WYJĄTEK':''));ul.append(li);}card.append(ul);
   const btn=el('button','⛔ Zablokuj dodatkowe konta','ip7-danger');btn.type='button';btn.onclick=()=>{if(confirm('Zablokować bezterminowo dodatkowe konta z tego IP? Konto właściciela i jedno konto podstawowe są chronione.'))void action({action:'apply_group',ip_key:group.ip_key,ip:group.ip});};card.append(btn);
   const allow=el('button','✓ Zgoda na 1 nową rejestrację');allow.type='button';allow.onclick=()=>{const reason=prompt('Uzasadnienie zgody (minimum 10 znaków):','');if(reason&&reason.trim().length>=10&&confirm('Zezwolić na JEDNĄ dodatkową rejestrację z tej sieci?'))void action({action:'allow_next',ip_key:group.ip_key,ip:group.ip,reason});};card.append(allow);root.append(card);
  }
  $('ip7-next').hidden=!hasMore;
  const list=$('ip7-holds');list.replaceChildren();if(!holds.length)list.append(el('p','Brak aktywnych blokad polityki IP.'));
  for(const h of holds){const box=el('article',undefined,'ip7-card');box.append(el('h3',(h.display_name||'Użytkownik')+' • blokada do wyjaśnienia'));
   box.append(el('p','E-mail: '+(h.email||'brak')+' • ID: '+h.user_id));box.append(el('p',h.reason));box.append(el('p','Od: '+local(h.created_at)));
   const button=el('button','✓ Zatwierdź wyjątek i odblokuj');button.type='button';button.onclick=()=>{const reason=prompt('Powód zgody na korzystanie z tego samego IP:','');if(reason&&reason.trim().length>=10&&confirm('Zezwolić temu kontu na używanie wskazanego IP i zdjąć blokadę?'))void action({action:'approve_user',user_id:h.user_id,ip_key:h.ip_key,reason});};box.append(button);list.append(box);
  }
 }
 async function refresh(){try{const d=await req();offset=0;groups=d.groups||[];holds=d.holds||[];hasMore=!!d.has_more;render();status('Odczyt D1: '+local(new Date().toISOString()));}catch(e){status(e.message,true)}}
 $('ip7-bulk').onclick=async()=>{
   if(busy||!groups.length)return;
   if(!confirm('Zablokować dodatkowe konta WSZYSTKICH '+groups.length+' grup na tej stronie? To działanie może objąć osoby korzystające z sieci współdzielonych.'))return;
   busy=true;let ok=0,errors=0;
   try{for(const group of groups){try{const d=await req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apply_group',ip_key:group.ip_key,ip:group.ip,confirm:true})});ok+=Number(d.held||0);}catch(e){errors++;}status('Przetworzono grupy. Nowe blokady: '+ok+'. Błędy: '+errors+'.');}
     await refresh();status('Zapisano blokady: '+ok+'. Grupy wymagające dodatkowej weryfikacji: '+errors,errors>0);
   }finally{busy=false;}
 };
 $('ip7-refresh').onclick=()=>void refresh();$('ip7-next').onclick=async()=>{try{offset+=5;const r=await fetch(api+'?offset='+offset,{credentials:'include',cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd stronicowania');groups=j.groups||[];holds=j.holds||[];hasMore=!!j.has_more;render();}catch(e){status(e.message,true)}};
 void refresh();
})();
