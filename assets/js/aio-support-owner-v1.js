/* Only authenticated owner API returns account identifiers; no inline PII in HTML. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),apiUrl='/api/aio-support-intent';
 const status={started:'Cel wybrany — brak zgłoszenia wpłaty',reported:'ZGŁOSZONA WPŁATA',approved:'Potwierdzona',rejected:'Odrzucona',cancelled:'Anulowano przez użytkownika'};
 const purpose={donation:'Dobrowolne wsparcie bez dostępu',access7:'7 dni nielimitowanych pobrań',vip30:'VIP 30 dni (minimum 30 zł)'};
 const method={buycoffee:'BuyCoffee',kofi:'Ko-fi',revolut:'Revolut'};
 const el=(t,s,cls)=>{const e=document.createElement(t);if(s!==undefined)e.textContent=s;if(cls)e.className=cls;return e;};
 const date=x=>x?new Date(x).toLocaleString('pl-PL'):'—';
 async function api(body){const r=await fetch(apiUrl+(body?'':'?scope=admin'),{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Błąd HTTP '+r.status);return d;}
 let busy=false;
 async function mutate(body){if(busy)return;busy=true;$('status').textContent='Zapisywanie decyzji…';try{const d=await api(body);$('status').textContent=d.message||'Zapisano.';await reload();}catch(err){$('status').textContent='Błąd: '+String(err.message||err);}finally{busy=false;}}
 async function reload(){try{const d=await api();$('reported').textContent=d.pending_reported;$('started').textContent=d.pending_started;$('legacy').textContent=d.legacy_pending;
   const target=$('records');target.replaceChildren();const rows=d.rows||[];if(!rows.length){target.append(el('p','Brak zgłoszeń.'));return;}
   for(const item of rows){const c=el('article',undefined,'card '+item.status),hd=el('div',undefined,'card-title');const t=el('div');t.append(el('h3',(purpose[item.purpose]||item.purpose)+' — '+(item.user_name||'Konto')));t.append(el('p',item.email||'Brak e-maila','meta'));hd.append(t,el('span',status[item.status]||item.status,'tag'));c.append(hd);
     c.append(el('p','Numer: '+item.reference+' • '+(method[item.method]||item.method)+' • '+date(item.created_at),'meta'));
     if(item.payer_identifier)c.append(el('p','Dane użyte przy wpłacie: '+item.payer_identifier));
     if(item.declared_pln!==null)c.append(el('p','Deklarowana kwota: '+item.declared_pln+' zł (NIEZWERYFIKOWANA)'));
     if(item.verified_pln!==null)c.append(el('p','Zweryfikowana kwota: '+item.verified_pln+' zł'));
     if(item.review_note)c.append(el('p','Decyzja: '+item.review_note));
     if(item.entitlement_expires_at)c.append(el('p','Ważność dostępu: '+date(item.entitlement_expires_at)));
     if(item.status==='reported'){
       const f=el('form',undefined,'amount-form');const al=el('label','Kwota sprawdzona u operatora (PLN)');const amount=el('input');amount.type='number';amount.step='0.01';amount.min=item.purpose==='vip30'?'30':'0.01';amount.required=true;amount.placeholder=item.purpose==='vip30'?'minimum 30 zł':'rzeczywista kwota';al.append(amount);f.append(al);
       const nl=el('label','Notatka właściciela (opcjonalna)');const note=el('input');note.maxLength=300;note.placeholder='np. identyfikator transakcji';nl.append(note);f.append(nl);
       const yes=el('button',item.purpose==='donation'?'Potwierdź darowiznę':item.purpose==='access7'?'Potwierdź + przyznaj 7 dni':'Potwierdź + aktywuj VIP','btn success');yes.type='submit';f.append(yes);
       const no=el('button','Odrzuć','btn danger');no.type='button';no.addEventListener('click',()=>{const why=prompt('Powód odrzucenia zgłoszenia:', 'Nie potwierdzono wpłaty u operatora.');if(why===null)return;void mutate({action:'reject',id:item.id,note:why});});f.append(no);
       f.addEventListener('submit',e=>{e.preventDefault();if(!f.reportValidity())return;const v=Number(amount.value);if(item.purpose==='vip30'&&v<30){alert('VIP wymaga co najmniej 30 zł rzeczywiście potwierdzonej wpłaty.');return;}
         if(!confirm('Czy samodzielnie sprawdzono u operatora przelew '+v+' PLN dla zgłoszenia '+item.reference+'?\n\n'+(item.purpose==='donation'?'Bez przyznania dostępu.':item.purpose==='access7'?'Przyznasz 7 dni bez limitu.':'Przyznasz 30 dni VIP.')+'\n\nTej czynności nie uruchamia sama deklaracja użytkownika.'))return;
         void mutate({action:'confirm',id:item.id,verified_pln:v,note:note.value,confirm:true});});c.append(f);
     }else if(item.status==='started'){
       c.append(el('p','Użytkownik wybrał cel, ale NIE zgłosił wykonania płatności. To nie jest potwierdzenie wpłaty.'));
       const b=el('button','Odrzuć / zamknij zgłoszenie','btn');b.type='button';b.addEventListener('click',()=>{if(confirm('Zamknąć to rozpoczęte zgłoszenie bez nadawania uprawnień?'))void mutate({action:'reject',id:item.id,note:'Nie zgłoszono wykonanej wpłaty.'});});c.append(b);
     }
     target.append(c);
   }
   $('status').textContent='Odczytano '+rows.length+' zgłoszeń. Ostatnia aktualizacja: '+new Date().toLocaleTimeString('pl-PL');
  }catch(err){$('status').textContent='Nie można wczytać danych właściciela: '+String(err.message||err);}
 }
 const boot=()=>{$('refresh').addEventListener('click',()=>void reload());void reload();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
