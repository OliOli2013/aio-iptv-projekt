/* AIO Moje konto V1. Konta, weryfikacja i limity są obsługiwane WYŁĄCZNIE przez istniejące API. */
(()=>{
  'use strict';
  const q=selector=>document.querySelector(selector);
  const status=q('[data-aio-account-status]');
  if(!status)return;
  const h=q('[data-aio-account-title]'),detail=q('[data-aio-account-text]'),extra=q('[data-aio-account-extra]');
  const login=q('[data-account-login]'),resend=q('[data-account-resend]'),downloads=q('[data-account-downloads]');
  const profile=q('[data-account-profile]'),notice=q('[data-account-message]');
  let busy=false, pending=false;
  function message(s,isError=false){notice.textContent=s||'';notice.className='aio-account-notice'+(s?(isError?' is-error':' is-success'):'');}
  function show({title,description,more='',icon='○',state=''}){
    h.textContent=title;detail.textContent=description;extra.textContent=more;
    q('.aio-account-status-icon').textContent=icon;
    status.className='aio-account-status'+(state?' is-'+state:'');status.setAttribute('aria-busy','false');
  }
  function formatDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('pl-PL',{dateStyle:'medium',timeStyle:'short'}).format(date);}
  async function json(url,options={}){
    const response=await fetch(url,{credentials:'include',cache:'no-store',...options});
    const data=await response.json().catch(()=>({ok:false,error:'Nie można odczytać odpowiedzi serwera.'}));
    if(!response.ok||!data||data.ok===false)throw new Error(data.error||('Błąd HTTP '+response.status));
    return data;
  }
  async function refresh(){
    if(busy){pending=true;return;}
    busy=true;
    try{
      const session=await json('/api/community-auth');
      const authorized=!!session.authenticated;
      // Owner-only presentation. API permissions are verified independently on the server.
      const ownerView=authorized&&session.user?.is_owner===true&&session.email_verified===true&&!session.email_verification_required;
      document.body.classList.toggle('aio-owner-clean',ownerView);
      login.hidden=authorized;resend.hidden=true;downloads.hidden=true;profile.hidden=true;
      if(!authorized){
        show({title:'Nie jesteś zalogowany',description:'Zaloguj się na dotychczasowe konto AIO lub utwórz nowe. Po zalogowaniu pokażemy status weryfikacji i dostęp do plików.',icon:'👤'});
        return;
      }
      const name=session.user?.display_name||'Użytkowniku';
      if(session.email_verification_required||!session.email_verified){
        show({title:'Potwierdź swój adres e-mail',description:'Konto '+name+' zostało odnalezione, ale przed korzystaniem z plików musisz potwierdzić adres przypisany do konta.',more:'Kliknij poniżej „Wyślij link potwierdzający e-mail”, następnie sprawdź pocztę i folder Spam.',icon:'✉',state:'pending'});
        resend.hidden=false;return;
      }
      profile.href='profile.html?id='+encodeURIComponent(String(session.user?.id||''));
      profile.hidden=!session.user?.id;
      downloads.hidden=false;
      let access;
      try{access=await json('/api/aio-account-access');}
      catch(error){show({title:'Konto zweryfikowane',description:'Witaj, '+name+'. Twoja sesja działa i adres e-mail jest potwierdzony.',more:'Nie udało się odczytać limitu pobierania. Możesz go sprawdzić później.',icon:'✓',state:'verified'});return;}
      const ends=access.expires_at?formatDate(access.expires_at):'';
      let description='';let more='';
      if(access.restricted===true){description='Ograniczenie bezpieczeństwa — pobieranie wstrzymane na 24 godziny.';more=access.restriction_message||'Jeżeli korzystasz ze wspólnej sieci, poproś administratora o weryfikację.';}
      else if(access.owner===true&&access.unlimited===true&&access.active===true){description='Konto właściciela AIO — dostęp do plików bez limitu.';more='';}
      else if(access.vip&&access.active){description='AIO VIP — aktywny dostęp bez limitu pobierania.';more=ends?'VIP ważny do: '+ends:'';}
      else if(access.active){description='Aktywny dostęp po zatwierdzonym wsparciu — bez limitu pobierania.';more=ends?'Dostęp do: '+ends:'';}
      else{description='Pozostało '+Math.max(0,Number(access.free_remaining)||0)+' z 3 darmowych pobrań na 168 godzin.';more=access.free_resets_at?'Odnowienie limitu: '+formatDate(access.free_resets_at):'Okres rozpoczyna się od pierwszego darmowego pobrania.';}
      show({title:'Witaj, '+name+' — e-mail potwierdzony',description,more,icon:'✓',state:'verified'});
    }catch(error){document.body.classList.remove('aio-owner-clean');show({title:'Nie udało się sprawdzić konta',description:'Sprawdź połączenie ze stroną i spróbuj ponownie.',more:String(error.message||''),icon:'!'});}
    finally{busy=false;if(pending){pending=false;refresh();}}
  }
  resend.addEventListener('click',async()=>{
    resend.disabled=true;message('Wysyłamy link na e-mail przypisany do konta…');
    try{
      const r=await json('/api/community-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resend_verification'})});
      message(r.message||'Wysłaliśmy wiadomość. Sprawdź e-mail oraz folder Spam.');
    }catch(e){message(e.message||'Nie udało się wysłać wiadomości.',true);}
    finally{resend.disabled=false;}
  });
  q('[data-account-refresh]').addEventListener('click',()=>{message('');refresh();});
  q('[data-account-reset]').addEventListener('click',()=>{
    if(window.AIOCommunity?.openPasswordReset)window.AIOCommunity.openPasswordReset();
    else location.href='community.html';
  });
  q('[data-account-reset-code]').addEventListener('click',()=>{
    if(window.AIOCommunity?.openPasswordResetConfirm)window.AIOCommunity.openPasswordResetConfirm();
    else location.href='community.html';
  });
  document.addEventListener('aio-community-ready',refresh);
  document.addEventListener('aio-community-auth',()=>{message('');refresh();});
  // Formularz rejestracji pozostaje otwarty przy niezweryfikowanym koncie;
  // po jego zamknięciu odśwież status, nie ujawniając żadnego tokenu w URL.
  const observer=new MutationObserver(()=>{
    const dialog=q('[data-aio-auth-dialog]');
    if(!dialog||dialog.dataset.aioAccountObserved)return;
    dialog.dataset.aioAccountObserved='1';dialog.addEventListener('close',()=>refresh());
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',refresh,{once:true});
  if(document.readyState!=='loading')refresh();
})();
