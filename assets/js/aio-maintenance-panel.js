/* AIO Maintenance V1 - static UI, protected API, never automatic deletion */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const status=$('aioMaintStatus');
const panel=$('aioMaintPrivate');
const confirmWord='USUN_WYGASLE_REKORDY_AIO';
const ipConfirm='USUN_STARE_DANE_IP';
async function api(url,opts={}){
 const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});
 let data={};try{data=await res.json();}catch(_){}
 if(!res.ok||!data.ok) throw new Error(res.status===401?'Zaloguj się na konto właściciela.':res.status===403?'Brak uprawnień właściciela.':data.error||('Błąd API '+res.status));
 return data;
}
function renderCounts(c){
 $('aioExpiredSessions').textContent=String(c.sessions_expired??'—');
 $('aioExpiredReset').textContent=String(c.reset_tokens_expired??'—');
 $('aioExpiredLogin').textContent=String(c.login_history_old??'—');
 $('aioExpiredIp').textContent=String(c.user_ip_history_old??'—');
}
async function refresh(){
 try{const d=await api('/api/owner-admin?tab=maintenance');
   renderCounts(d.counts||{});panel.hidden=false;status.textContent='Sesja właściciela zweryfikowana. Panel gotowy.';
 }catch(e){panel.hidden=true;status.textContent='Panel zablokowany: '+e.message;}
}
async function postAction(action,confirm){
 return api('/api/owner-admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,confirm})});
}
async function cleanup(action,phrase,label){
 try{
  const p=await postAction(action,'');
  if(!p.preview) throw new Error('Serwer nie zwrócił podglądu.');
  const details=JSON.stringify(p.counts||{ip_rows:p.expired_ip_rows},null,2);
  const reply=prompt(label+'\n\nRekordy do usunięcia:\n'+details+'\n\nNajpierw wykonaj osobną kopię D1. Aby kontynuować wpisz dokładnie:\n'+phrase);
  if(reply!==phrase){status.textContent='Anulowano. Nic nie usunięto.';return;}
  const done=await postAction(action,phrase);
  status.textContent='Wykonano świadomie potwierdzone czyszczenie. '+JSON.stringify(done.deleted||done.deleted_ip_rows);
  await refresh();
 }catch(e){status.textContent='Nie wykonano czyszczenia: '+e.message;}
}
$('aioRefresh').addEventListener('click',refresh);
$('aioCleanup').addEventListener('click',()=>cleanup('maintenance_cleanup_expired',confirmWord,'Usunąć wyłącznie wygasłe sesje, tokeny i stare liczniki?'));
$('aioCleanupIp').addEventListener('click',()=>cleanup('cleanup_expired_security_data',ipConfirm,'Usunąć historię IP starszą niż 90 dni?'));
$('aioMediaCheck').addEventListener('click',async()=>{
 const out=$('aioMediaResult');out.textContent='Sprawdzam próbkę R2...';
 try{const r=await api('/api/owner-admin?tab=media_audit');
   out.textContent=`Sprawdzono: ${r.checked}. Nieodnalezione: ${(r.missing||[]).length}.`+((r.missing||[]).length?'\nKlucze: '+r.missing.join(', '):'');
 }catch(e){out.textContent='Nie wykonano audytu: '+e.message;}
});
refresh();
})();
