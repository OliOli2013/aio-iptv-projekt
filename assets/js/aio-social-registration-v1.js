/* AIO Social Registration V1. This is only a UI: server makes ALL security decisions. */
(()=>{'use strict';
  const API='/api/aio-social';
  let config=null,refreshing=null,formMounted=false;
  const allowed=new Set(['google','facebook']);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const messages={
    registered:'Konto utworzone po weryfikacji dostawcy. Możesz się teraz zalogować.',
    logged_in:'Zalogowano przez konto zewnętrzne.',
    linked:'Konto dostawcy zostało połączone z Twoim kontem AIO.',
    already_linked:'To konto dostawcy jest już połączone z AIO.',
    verify_email:'Utworzono konto. Sprawdź skrzynkę e-mail i potwierdź adres przed korzystaniem z AIO.',
    failed:'Logowanie lub rejestracja nie zostały ukończone. Spróbuj ponownie lub skontaktuj się z administracją.',
    conflict:'Nie utworzono drugiego konta. Istnieje wcześniejsze powiązanie lub podobna nazwa/e-mail. Zaloguj się na stare konto i połącz dostawcę albo skontaktuj się z administracją.',
    not_linked:'Ten dostawca nie jest jeszcze połączony z AIO. Jeżeli nie masz konta, wybierz „Utwórz konto”.',
    needs_review:'Rejestracja lub logowanie wymagają dodatkowej weryfikacji bezpieczeństwa AIO. Skontaktuj się z administracją.',
    vpn_connection:'Połączenie rozpoznano jako VPN, proxy lub Tor. Wyłącz tę usługę i ponów próbę. Jeśli to pomyłka, skontaktuj się z administracją.',
    network_retry:'Nie można teraz sprawdzić połączenia. Spróbuj później. Nie zablokowano konta.',
    logged_in_vpn:'Zalogowano. Wykryto VPN, proxy lub Tor; w trybie obserwacji dostęp pozostaje bez zmian.',
    registered_vpn:'Utworzono konto. Wykryto VPN, proxy lub Tor; w trybie obserwacji można się zalogować.',
    verify_email_vpn:'Potwierdź adres e-mail. Wykryto VPN, proxy lub Tor; w trybie obserwacji nie blokuje to konta.',
    cancelled:'Weryfikacja u dostawcy została anulowana albo wygasła.'
  };
  const pending=new URLSearchParams(location.search).get('aio_social');
  const link=href=>{const a=el('a','aio-social-help',href);a.href='/contact.html?topic=account-security';a.textContent=href;return a;};
  async function api(method='GET',body=null,view=''){
    const response=await fetch(API+(view?'?view='+encodeURIComponent(view):''),{
      method,credentials:'include',cache:'no-store',
      headers:method==='POST'?{'content-type':'application/json'}:{},
      body:body?JSON.stringify(body):undefined
    });
    const data=await response.json().catch(()=>({ok:false,error:'Serwer nie odpowiedział prawidłowo.'}));
    if(!response.ok||data.ok!==true)throw new Error(data.error||'Błąd logowania.');
    return data;
  }
  async function loadConfig(){
    if(config)return config;
    if(refreshing)return refreshing;
    refreshing=api().then(d=>{config=d;return d;}).catch(()=>({ok:false,enabled:false,providers:{}})).finally(()=>refreshing=null);
    return refreshing;
  }
  function turnstileValue(form){
    // Turnstile explicit render adds a hidden response input inside its widget.
    const inForm=form.querySelector('[data-aio-turnstile-widget] [name="cf-turnstile-response"]')?.value||'';
    if(inForm)return inForm;
    try{return window.turnstile?.getResponse?.()||'';}catch{return '';}
  }
  async function begin(provider,mode,form=null,password=''){
    if(!allowed.has(provider))throw new Error('Nieznany dostawca.');
    const data={provider,mode};
    if(mode==='register'){
      const field=form?.querySelector('[name="displayName"]');
      if(!field||!field.reportValidity())throw new Error('Podaj poprawną nazwę konta AIO.');
      data.displayName=field.value.trim();
      data.turnstileToken=turnstileValue(form);
    }
    if(mode==='link')data.password=password;
    const result=await api('POST',data);
    const u=new URL(result.url);
    if(u.protocol!=='https:'||!['accounts.google.com','www.facebook.com'].includes(u.hostname))throw new Error('Nieprawidłowe przekierowanie do dostawcy.');
    location.assign(result.url);
  }
  function button(provider){
    const btn=el('button','aio-social-btn aio-social-'+provider);
    btn.type='button';btn.dataset.aioSocialProvider=provider;
    const ico=el('span','aio-social-ico',provider==='google'?'G':'f');
    const txt=el('span','',provider==='google'?'Kontynuuj przez Google':'Kontynuuj przez Facebook');
    btn.append(ico,txt);return btn;
  }
  async function mountAuth(dialog){
    const form=dialog?.querySelector('[data-aio-auth-form]');
    if(!form||form.dataset.aioSocialMounted)return;
    const d=await loadConfig();
    if(!form.isConnected||!d.enabled)return;
    const providers=Object.keys(d.providers||{}).filter(p=>allowed.has(p)&&d.providers[p]);
    if(!providers.length)return;
    form.dataset.aioSocialMounted='true';
    const wrap=el('section','aio-social-wrap');wrap.setAttribute('aria-label','Logowanie przez zewnętrzne konta');
    const h=el('p','aio-social-caption','Lub skorzystaj ze zweryfikowanego konta');
    wrap.append(h);
    for(const p of providers)wrap.append(button(p));
    const tip=el('p','aio-social-tip','Nowe konto powstanie dopiero po sprawdzeniu wcześniejszych kont i zabezpieczeń AIO.');
    wrap.append(tip);
    const state=el('p','aio-social-error');state.hidden=true;state.setAttribute('role','alert');wrap.append(state);
    const position=form.querySelector('.community-field');position?.before(wrap);
    wrap.addEventListener('click',async event=>{
      const btn=event.target.closest('button[data-aio-social-provider]');if(!btn)return;
      event.preventDefault();
      const registering=!form.querySelector('[data-register-name]')?.hidden;
      state.hidden=true;state.textContent='';btn.disabled=true;
      try{await begin(btn.dataset.aioSocialProvider,registering?'register':'login',form);}
      catch(e){state.textContent=e.message||'Operacja nie powiodła się.';state.hidden=false;btn.disabled=false;}
    });
    const change=()=>{const registering=!form.querySelector('[data-register-name]')?.hidden;
      h.textContent=registering?'Utwórz konto z Google lub Facebookiem':'Zaloguj się z Google lub Facebookiem';
      tip.textContent=registering
        ?'Wpisz nazwę użytkownika i przejdź ewentualną weryfikację Turnstile. Dopiero potem wybierz dostawcę.'
        :'Dostawca musi być już połączony z kontem AIO. Nowe konto założysz w zakładce „Utwórz konto”.';
    };
    change();form.querySelector('[data-register-toggle]')?.addEventListener('click',()=>setTimeout(change,0));
  }
  function maskDialog(provider){
    return new Promise(resolve=>{
      const dlg=el('dialog','aio-social-link-dialog');
      const box=el('form','aio-social-link-form');box.method='dialog';
      box.append(el('h3','','Połącz konto '+(provider==='google'?'Google':'Facebook')));
      box.append(el('p','','Dla bezpieczeństwa potwierdź aktualne hasło konta AIO. Nie podawaj hasła Google/Facebook.'));
      const input=el('input');input.type='password';input.required=true;input.minLength=10;
      input.autocomplete='current-password';input.placeholder='Aktualne hasło AIO';
      box.append(input);
      const actions=el('div','aio-social-link-actions');
      const cancel=el('button','','Anuluj');cancel.type='button';
      const submit=el('button','', 'Dalej');submit.type='submit';
      actions.append(cancel,submit);box.append(actions);dlg.append(box);document.body.append(dlg);
      const close=value=>{dlg.close();dlg.remove();resolve(value);};
      cancel.addEventListener('click',()=>close(null));
      dlg.addEventListener('cancel',e=>{e.preventDefault();close(null);});
      box.addEventListener('submit',e=>{e.preventDefault();if(input.reportValidity())close(input.value);});
      dlg.showModal();input.focus();
    });
  }
  async function mountAccount(){
    if(!/^\/(?:konto(?:\.html)?|account(?:\.html)?)\/?$/i.test(location.pathname))return;
    const host=document.querySelector('.aio-account-panels,.aio-account-main');
    if(!host||document.querySelector('#aio-social-account-v1'))return;
    const d=await api('GET',null,'status').catch(()=>null);
    if(!d?.enabled||!d.authenticated)return;
    const box=el('section','aio-social-account');box.id='aio-social-account-v1';
    box.append(el('h3','','Połącz zewnętrzne konto'));
    box.append(el('p','','Dodatkowe logowanie nie tworzy nowego profilu AIO i nie odnawia limitów pobierania.'));
    const message=el('p','aio-social-account-message');message.hidden=true;message.setAttribute('role','status');
    const providers=Object.keys(d.providers||{}).filter(k=>allowed.has(k)&&d.providers[k]);
    for(const p of providers){
      const already=(d.linked||[]).find(x=>x.provider===p);
      const b=el('button','aio-social-connect',already
        ?(p==='google'?'Google':'Facebook')+' — połączone'
        :'Połącz '+(p==='google'?'Google':'Facebook'));
      b.type='button';b.disabled=Boolean(already);
      b.addEventListener('click',async()=>{
        const password=await maskDialog(p);if(!password)return;
        b.disabled=true;message.hidden=true;
        try{await begin(p,'link',null,password);}catch(e){message.textContent=e.message;message.hidden=false;b.disabled=false;}
      });
      box.append(b);
    }
    box.append(message);host.prepend(box);
  }
  function showResult(){
    if(!pending||!Object.hasOwn(messages,pending))return;
    const note=el('div','aio-social-return',messages[pending]);note.setAttribute('role','status');
    if(pending==='vpn_connection'||pending==='network_retry')note.append(document.createTextNode(' '),link('Kontakt z AIO'));
    document.body.append(note);
    window.setTimeout(()=>note.remove(),18000);
    try{const u=new URL(location.href);u.searchParams.delete('aio_social');history.replaceState(null,'',u.pathname+u.search+u.hash);}catch{}
  }
  function inspect(){const d=document.querySelector('[data-aio-auth-dialog]');if(d)void mountAuth(d);void mountAccount();}
  const boot=()=>{
    const css=el('link');css.rel='stylesheet';css.href='/assets/css/aio-social-registration-v1.css?v=20261119-v1';document.head.append(css);
    showResult();inspect();
    const obs=new MutationObserver(()=>inspect());obs.observe(document.body,{childList:true,subtree:false});
    document.addEventListener('aio-community-ready',inspect);
    document.addEventListener('aio-community-auth',inspect);
    document.addEventListener('click',event=>{if(event.target.closest('[data-community-login]'))setTimeout(inspect,0);});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
