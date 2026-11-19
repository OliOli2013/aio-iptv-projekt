/* AIO USERNAME PROTECTION V1.3 — repeatable, rename-only sign-in for legacy duplicates. AIO_USERNAME_PROTECTION_V1_3_1_20261119
 * Existing users with reserved/duplicate names receive this form. Server decides
 * whether the session is eligible; never infer identity/permissions in the UI.
 */
(function(){
  'use strict';
  const ENDPOINT='/api/aio-username-policy';
  let dialog=null, checking=null, pendingAgain=false, completed=false;

  async function api(method, data, query=''){
    const response=await fetch(ENDPOINT+query,{
      method,credentials:'include',cache:'no-store',
      headers:method==='POST'?{'content-type':'application/json'}:{},
      body:method==='POST'?JSON.stringify(data):undefined
    });
    const result=await response.json().catch(()=>({ok:false,error:'Serwer nie zwrócił prawidłowej odpowiedzi.'}));
    if(!response.ok||result.ok===false)throw new Error(result.error||'Operacja nie powiodła się.');
    return result;
  }

  function tell(el,message,type='neutral'){
    el.textContent=String(message||'');
    el.hidden=!message;
    el.style.color=type==='error'?'#ffc1c6':type==='success'?'#a2f0ca':'#c4e9f4';
  }

  function show(info){
    if(!info?.required||completed)return;
    if(dialog?.isConnected){
      dialog.querySelector('[data-aio-rename-old]').textContent=info.current_name||'';
      return;
    }
    const el=document.createElement('dialog');
    el.setAttribute('data-aio-username-rename','');
    el.setAttribute('aria-labelledby','aio-username-title');
    el.style.cssText='box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:92vh;overflow:auto;padding:clamp(18px,4vw,30px);border:2px solid #65cbdf;border-radius:16px;background:#092b3b;color:#effbff;box-shadow:0 20px 85px #000c;z-index:2147483647;';
    el.innerHTML=`
      <form data-aio-username-form style="display:grid;gap:13px;line-height:1.5;">
        <p style="margin:0;color:#88d9e8;font-weight:750;letter-spacing:.05em;font-size:.76rem;">AIO TUNERHUB · BEZPIECZEŃSTWO KONTA</p>
        <h2 id="aio-username-title" style="margin:0;color:#fff;font-size:clamp(1.2rem,4vw,1.65rem);">Wymagana zmiana nazwy użytkownika</h2>
        <p style="margin:0;">Twoja dotychczasowa nazwa jest zastrzeżona albo zajęta. Aby dalej korzystać z serwisu, zapisz nową, dostępną nazwę. Możesz ponownie zalogować się swoim dotychczasowym hasłem, by dokończyć tę zmianę. Do tego czasu pozostałe funkcje AIO są ograniczone.</p>
        <div style="padding:11px 13px;background:#103a4e;border:1px solid #376a80;border-radius:10px;">
          <small style="display:block;color:#b9dce8;">Obecna nazwa</small>
          <strong data-aio-rename-old style="overflow-wrap:anywhere;"></strong>
        </div>
        <label for="aio-username-new" style="font-weight:700;">Nowa nazwa użytkownika</label>
        <input id="aio-username-new" name="displayName" required minlength="2" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="Wpisz nową nazwę" style="width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #8dd5e4;border-radius:9px;background:#fff;color:#132b38;font-size:16px;" />
        <small style="color:#c9e4ed;">Od 2 do 60 znaków. Nazwa musi być wolna i nie może sugerować oficjalnego konta administracji.</small>
        <p data-aio-rename-status aria-live="polite" style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;" hidden></p>
        <p data-aio-rename-error role="alert" aria-live="assertive" style="margin:0;white-space:pre-wrap;color:#ffc1c6;font-weight:700;" hidden></p>
        <div style="display:grid;grid-template-columns:1fr;gap:9px;">
          <button data-aio-name-check type="button" style="padding:12px;border:1px solid #7ac9dc;border-radius:9px;background:#165063;color:#fff;font-weight:700;cursor:pointer;">Sprawdź dostępność nazwy</button>
          <button data-aio-name-save type="submit" style="padding:14px;border:0;border-radius:9px;background:#80d7e8;color:#0b2b38;font-weight:800;font-size:16px;cursor:pointer;">Zapisz nową nazwę</button>
        </div>
        <p data-aio-rename-deadline style="margin:0;color:#bddce5;font-size:.89rem;">Zmiana jest wymagana w ciągu 14 dni od pierwszego powiadomienia. Po tym terminie administrator może zdecydować o usunięciu konta; nie jest ono usuwane automatycznie.</p>
        <p style="margin:0;color:#c0dfe7;font-size:.89rem;">Zachowasz swoje posty, historię pobrań i dotychczasowe uprawnienia. Inne blokady bezpieczeństwa pozostają w mocy.</p>
        <a href="/contact.html?topic=account-security" style="color:#b0effd;text-decoration:underline;">Nie mogę zmienić nazwy — skontaktuj się z administracją</a>
      </form>`;
    el.querySelector('[data-aio-rename-old]').textContent=info.current_name||'';
    if(info.deadline_at){
      const date=new Date(info.deadline_at);
      if(!Number.isNaN(date.getTime())){
        el.querySelector('[data-aio-rename-deadline]').textContent=
          'Termin zmiany nazwy: '+date.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'})+
          '. Po terminie administrator może zdecydować o usunięciu konta. Konto nie jest kasowane automatycznie.';
      }
    }
    dialog=el;
    const form=el.querySelector('form');
    const input=form.elements.displayName;
    const save=form.querySelector('[data-aio-name-save]');
    const checkBtn=form.querySelector('[data-aio-name-check]');
    const status=form.querySelector('[data-aio-rename-status]');
    const error=form.querySelector('[data-aio-rename-error]');
    let busy=false,lastChecked='';
    const busySet=v=>{
      busy=v;
      checkBtn.disabled=v;
      save.disabled=v;
      checkBtn.style.opacity=v?'.65':'1';
      save.style.opacity=v?'.65':'1';
    };
    el.addEventListener('cancel',e=>e.preventDefault());
    input.addEventListener('input',()=>{
      lastChecked='';tell(status,'');tell(error,'');
    });
    checkBtn.addEventListener('click',async()=>{
      if(busy)return;
      if(!input.reportValidity())return;
      busySet(true);tell(status,'Sprawdzam dostępność...');tell(error,'');
      try{
        const name=input.value.trim();
        const result=await api('GET',null,'?check='+encodeURIComponent(name));
        if(name===input.value.trim()){
          lastChecked=result.available?name:'';
          tell(status,result.message|| (result.available?'Nazwa jest dostępna.':'Nazwa jest niedostępna.'),result.available?'success':'error');
        }
      }catch(e){tell(error,e.message||'Nie udało się sprawdzić nazwy.','error');tell(status,'');}
      finally{busySet(false);}
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(busy)return;
      if(!input.reportValidity())return;
      busySet(true);tell(error,'');tell(status,'Trwa zapisywanie nazwy...');
      try{
        const name=input.value.trim();
        // The POST always revalidates and atomically claims the name on the server.
        const result=await api('POST',{action:'rename',displayName:name});
        completed=true;
        tell(status,result.message||'Nazwa została zapisana. Odświeżanie konta...','success');
        window.location.reload();
      }catch(e){tell(error,e.message||'Nie udało się zapisać nazwy.','error');tell(status,'');}
      finally{busySet(false);}
    });
    document.body.appendChild(el);
    if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');
    input.focus();
  }

  async function check(){
    if(completed)return;
    if(checking){pendingAgain=true;return checking;}
    checking=(async()=>{
      try{
        const result=await api('GET');
        if(result.required)show(result);
      }catch(error){
        // Keep a pending modal visible; do not let an intermittent GET hide the form.
        if(dialog?.isConnected){
          tell(dialog.querySelector('[data-aio-rename-error]'),
            'Nie można obecnie sprawdzić wymagań konta. Spróbuj ponownie za chwilę.','error');
        }else console.warn('AIO Username: nie udało się sprawdzić nazwy konta.');
      }
    })();
    try{return await checking;}
    finally{
      checking=null;
      if(pendingAgain){pendingAgain=false;void check();}
    }
  }
  function startup(){void check();}
  document.addEventListener('aio-community-ready',startup);
  document.addEventListener('aio-community-auth',startup);
  document.addEventListener('aio-username-rename-login',startup);
  // Explicit hook for the login form; GET remains the server-side source of truth.
  window.AIOUsernamePolicyV12={check};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startup,{once:true});
  else startup();
})();
