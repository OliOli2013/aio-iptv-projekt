/* AIO Post Notifications V1 — opt-in settings in Moje konto. */
(()=>{'use strict';
 if(window.__aioPostNotifyAccountV1)return;window.__aioPostNotifyAccountV1=true;
 const API='/api/aio-post-notify';
 const el=(tag,text,className)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;};
 let root,inbox,email,save,status,help,busy=false;
 function show(message,error=false){status.textContent=message;status.classList.toggle('is-error',error);}
 async function load(){
   if(busy)return;
   try{
     const response=await fetch(API,{credentials:'include',cache:'no-store'});
     if(response.status===401||response.status===403){root.hidden=true;return;}
     if(!response.ok)throw Error('API');
     const d=await response.json();if(!d.ok)throw Error('API');
     const s=d.settings||{};root.hidden=false;
     inbox.checked=s.inbox_enabled!==false;email.checked=s.email_enabled===true;
     email.disabled=(!s.email_verified||!s.email_delivery_available)&&!email.checked;
     if(!s.email_verified)help.textContent='Aby włączyć e-mail, najpierw potwierdź adres przypisany do konta.';
     else if(!s.email_delivery_available)help.textContent='Powiadomienia e-mail są chwilowo niedostępne. Powiadomienia na koncie działają niezależnie.';
     else help.textContent='Zestawienie wysyłamy na potwierdzony adres Twojego konta, najwyżej raz na 24 godziny, tylko gdy pojawią się nowe posty. Możesz wyłączyć je w każdej chwili.';
     save.disabled=false;show('');
   }catch(e){root.hidden=false;show('Nie udało się odczytać ustawień. Spróbuj ponownie później.',true);email.disabled=true;save.disabled=true;}
 }
 async function submit(e){
   e.preventDefault();if(busy)return;
   busy=true;save.disabled=true;show('Zapisuję ustawienia…');
   try{
     const response=await fetch(API,{method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save_settings',inbox_enabled:inbox.checked,email_enabled:email.checked})});
     const d=await response.json().catch(()=>({}));if(!response.ok||!d.ok){
       if(response.status===403){show('Potwierdź adres e-mail na koncie przed włączeniem powiadomień.',true);}
       else show('Nie udało się zapisać ustawień. Spróbuj ponownie później.',true);
       return;
     }
     show('✓ Ustawienia zapisane.');
     document.dispatchEvent(new Event('aio-owner-messages-updated'));
   }catch(_){show('Brak połączenia. Spróbuj ponownie później.',true);}
   finally{busy=false;save.disabled=false;}
 }
 function init(){
   const inboxBox=document.getElementById('aio-messages');if(!inboxBox)return;
   root=el('section',undefined,'apn-settings');root.id='aio-post-notify-settings';root.hidden=true;
   const header=el('div',undefined,'apn-title');
   header.append(el('h3','🔔 Powiadomienia o nowych postach'),el('p','Wybierz, gdzie chcesz otrzymywać informacje o nowych postach w Społeczności AIO.'));
   const form=el('form',undefined,'apn-form');
   const line1=el('label',undefined,'apn-toggle');inbox=el('input');inbox.type='checkbox';inbox.name='inbox_enabled';line1.append(inbox,el('span','Powiadomienia w Moich wiadomościach (domyślnie włączone)'));
   const line2=el('label',undefined,'apn-toggle');email=el('input');email.type='checkbox';email.name='email_enabled';line2.append(email,el('span','Powiadomienia e-mail — dobrowolne zestawienie nowych postów'));
   help=el('p','Wiadomości e-mail są domyślnie wyłączone.','apn-note');
   save=el('button','Zapisz ustawienia','apn-save');save.type='submit';
   status=el('p','', 'apn-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   form.append(line1,line2,help,save,status);root.append(header,form);
   inboxBox.insertBefore(root,inboxBox.querySelector('.aom1-list'));
   form.addEventListener('submit',submit);
   document.addEventListener('aio-community-auth',()=>void load());
   void load();
   if(location.hash==='#aio-post-notify-settings')setTimeout(()=>root.scrollIntoView({behavior:'smooth',block:'start'}),400);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
