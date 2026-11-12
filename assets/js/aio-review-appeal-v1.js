(()=>{'use strict';
const $=id=>document.getElementById(id);
const status=$('appeal-status'),form=$('appeal-form'),button=$('appeal-submit');
const history=$('appeal-history'),items=$('appeal-items'),hint=$('appeal-login-hint');
const link='/api/aio-review-appeal';
function setStatus(s,error=false){status.textContent=s;status.classList.toggle('error',error);}
function showHistory(rows){
  items.replaceChildren();history.hidden=!rows.length;
  for(const r of rows){
    const box=document.createElement('article');box.className='appeal-item';
    const date=document.createElement('small');const d=new Date(r.created_at);date.textContent=Number.isNaN(d.getTime())?'Wiadomość':d.toLocaleString('pl-PL');
    const st=document.createElement('strong');st.textContent=r.admin_reply?'Odpowiedź właściciela':'W oczekiwaniu na odpowiedź';
    box.append(date,st);
    if(r.admin_reply){const reply=document.createElement('p');reply.textContent=r.admin_reply;box.append(reply);}
    items.append(box);
  }
}
async function api(method,body){
  const res=await fetch(link,{method,credentials:'include',cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({ok:false,error:'Błąd odpowiedzi serwera'}));
  if(!res.ok||data.ok!==true)throw new Error(data.error||'Błąd połączenia.');return data;
}
async function refresh(){
  try{const data=await api('GET');
    form.hidden=!data.eligible;hint.hidden=!!data.eligible;
    if(data.eligible){setStatus('Konto: '+data.account_name+'. Możesz wysłać odwołanie.');showHistory(data.items||[]);}
    else{history.hidden=true;setStatus(data.message||'Zaloguj się na zablokowane konto.');}
  }catch(_){setStatus('Nie udało się sprawdzić sesji. Możesz skorzystać z kontaktu e-mail.',true);hint.hidden=false;}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled)return;
  const message=$('appeal-message').value.trim();if(message.length<20){setStatus('Opisz sytuację w co najmniej 20 znakach.',true);return;}
  button.disabled=true;setStatus('Wysyłam odwołanie…');
  try{const data=await api('POST',{action:'send',message});$('appeal-message').value='';await refresh();setStatus(data.message||'Wiadomość wysłana.');}
  catch(err){setStatus(err.message,true)}finally{button.disabled=false;}
});
refresh();
})();
