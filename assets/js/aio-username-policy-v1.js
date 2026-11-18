/* AIO USERNAME PROTECTION V1 — mandatory one-time rename dialogue. */
(function(){
  'use strict';
  let checking=false,visible=false;
  const url='/api/aio-username-policy';
  async function request(method,data){
    const r=await fetch(url,{method,credentials:'include',cache:'no-store',
      headers:method==='POST'?{'content-type':'application/json'}:{},
      body:method==='POST'?JSON.stringify(data):undefined});
    const v=await r.json().catch(()=>({ok:false,error:'Serwer nie zwrócił danych.'}));
    if(!r.ok||v.ok===false)throw new Error(v.error||'Nie można wykonać operacji.');
    return v;
  }
  function open(info){
    if(visible)return;
    visible=true;
    const dialog=document.createElement('dialog');
    dialog.setAttribute('data-aio-username-rename','');
    dialog.setAttribute('aria-labelledby','aio-rename-title');
    dialog.style.cssText='width:min(530px,94vw);max-height:90vh;overflow:auto;box-sizing:border-box;border:2px solid #82ccdc;border-radius:15px;background:#092636;color:#e9faff;padding:26px;box-shadow:0 20px 85px #000b;z-index:2147483647;';
    dialog.innerHTML=`<form data-aio-rename-form style="display:grid;gap:14px;">
      <h2 id="aio-rename-title" style="margin:0;color:#b7f2fc;font-size:1.4rem;">Wymagana zmiana nazwy użytkownika</h2>
      <p style="margin:0;line-height:1.6;">Twoja dotychczasowa nazwa konta jest zastrzeżona lub zajęta. Masz jednorazową możliwość zalogowania się w celu jej zmiany. Do czasu zmiany nie możesz normalnie korzystać z serwisu.</p>
      <div><strong>Dotychczasowa nazwa:</strong> <span data-aio-oldname></span></div>
      <p style="margin:0;line-height:1.6;">Zmień nazwę w ciągu <strong>14 dni od powiadomienia</strong>. W przeciwnym razie konto może zostać usunięte po decyzji administracji. Zmiana nie usuwa wpisów ani dotychczasowych uprawnień.</p>
      <label for="aio-rename-new">Nowa nazwa użytkownika</label>
      <input id="aio-rename-new" name="displayName" required minlength="2" maxlength="60" autocomplete="off" style="box-sizing:border-box;width:100%;font-size:17px;padding:12px;border-radius:8px;border:1px solid #89c9dd;color:#102f3a;background:#fff;" />
      <p data-aio-rename-error aria-live="assertive" role="alert" hidden style="margin:0;color:#ffb5b5;font-weight:bold;white-space:pre-wrap;"></p>
      <button type="submit" style="padding:13px;border:0;border-radius:8px;font-weight:bold;background:#8ad4e5;color:#0b2730;cursor:pointer;">Sprawdź dostępność i zapisz nową nazwę</button>
      <a href="/contact.html?topic=account-security" style="color:#b0e9fc;text-decoration:underline;">Potrzebuję pomocy administratora</a>
      </form>`;
    dialog.querySelector('[data-aio-oldname]').textContent=info.current_name||'';
    const h=dialog.querySelector('form p:nth-of-type(2)');
    if(h&&info.deadline_at){
      const date=new Date(info.deadline_at);
      if(!Number.isNaN(date.getTime()))h.textContent='Termin zmiany nazwy: '+date.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'})+'. Po tym terminie administracja może usunąć konto. Zmiana nie usuwa wpisów ani uprawnień.';
    }
    dialog.addEventListener('cancel',e=>e.preventDefault());
    dialog.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();
      const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),error=form.querySelector('[data-aio-rename-error]');
      error.hidden=true;button.disabled=true;
      try{
        const value=form.elements.displayName.value.trim();
        await request('POST',{action:'rename',displayName:value});
        dialog.close();dialog.remove();visible=false;
        window.location.reload();
      }catch(x){error.textContent=x.message||'Nie udało się zapisać nazwy.';error.hidden=false;}
      finally{button.disabled=false;}
    });
    document.body.appendChild(dialog);
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    dialog.querySelector('input').focus();
  }
  async function check(){
    if(checking||visible)return;
    checking=true;
    try{const s=await request('GET');if(s.required)open(s);}catch(e){console.warn('AIO: nie można sprawdzić nazwy konta.');}
    finally{checking=false;}
  }
  document.addEventListener('aio-community-ready',()=>{void check()});
  document.addEventListener('aio-community-auth',()=>{void check()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void check()},{once:true});
  else void check();
})();
