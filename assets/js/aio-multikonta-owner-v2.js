(()=>{'use strict';
const slot=document.getElementById('guard-v2-slot');if(!slot)return;
function el(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;}
const card=el('div');card.className='card';slot.append(card);
card.append(el('h2','AIO V2 — weryfikacje rejestracji i wspólne limity'));
const status=el('p');card.append(status);
const load=el('button','Odśwież V2');card.append(load);
const list=el('div');card.append(list);
const summary=el('div');card.append(summary);
const groupForm=el('form');groupForm.innerHTML='<h3>Połącz limity wyłącznie po ręcznym potwierdzeniu</h3><label>Identyfikatory kont (po jednym w wierszu): <textarea name="ids" rows="4" style="display:block;width:100%;box-sizing:border-box;background:#0b2532;color:white"></textarea></label><p><label><input type="checkbox" name="confirm" required> Potwierdzam tożsamość użytkownika i rozumiem, że limit będzie wspólny.</label></p><button type="submit">Utwórz grupę limitu</button>';
card.append(groupForm);
async function api(method,body){const r=await fetch('/api/aio-multikonta-owner-v2',{method,credentials:'include',cache:'no-store',headers:method==='POST'?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({ok:false,error:'Błąd odpowiedzi D1.'}));if(!r.ok||!d.ok)throw new Error(d.error||'Błąd uprawnień.');return d;}
async function refresh(){try{const d=await api('GET');status.textContent='Tryb: '+d.mode+' | HMAC: '+(d.secret_ready?'skonfigurowany':'brak')+' | Turnstile: '+(d.turnstile_enabled?'aktywne':'wyłączone');
 list.replaceChildren();for(const r of d.reviews){const row=el('p',r.display_name+' | ryzyko '+r.risk_score+' | '+r.indicators+' | '+r.status+' | '+r.created_at+' | powiązane: '+(r.peer_name||'nieustalone')+' ');
  if(r.status!=='released'){const btn=el('button','Zwolnij kontrolę');btn.type='button';btn.addEventListener('click',async()=>{if(!confirm('Zwolnić ograniczenie darmowych pobrań dla tego konta?'))return;btn.disabled=true;try{await api('POST',{action:'release',user_id:r.user_id,confirm:true});await refresh();}catch(e){alert(e.message)}finally{btn.disabled=false;}});row.append(btn);}list.append(row);}
 if(!d.reviews.length)list.append(el('p','Brak weryfikacji V2.'));
 summary.textContent='Ręcznie połączone grupy limitu: '+d.confirmed_quota_groups.length;
 }catch(e){status.textContent='Błąd kontroli: '+e.message;}}
load.addEventListener('click',refresh);
groupForm.addEventListener('submit',async e=>{e.preventDefault();const ids=groupForm.elements.ids.value.split(/[\s,;]+/).filter(Boolean);if(ids.length<2||!groupForm.elements.confirm.checked)return;
 if(!confirm('Wspólny limit połączy pobrania tych kont. Kontynuować?'))return;
 try{const d=await api('POST',{action:'link_confirmed',confirm:true,user_ids:ids});alert(d.message);groupForm.reset();await refresh();}catch(e){alert(e.message);}});
refresh();
})();
