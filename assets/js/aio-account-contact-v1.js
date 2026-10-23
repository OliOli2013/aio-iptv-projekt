/* AIO Moje Konto — kontakt z właścicielem V1.
 * Uses existing /api/list-inbox: owner sees contact messages in Skrzynka AIO;
 * the user only receives rows belonging to their authenticated server session.
 */
(()=>{'use strict';
 if(window.__aioAccountContactV1)return;window.__aioAccountContactV1=true;
 const API='/api/list-inbox';
 const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node;};
 const format=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'});};
 async function request(url,options={}){
   const response=await fetch(url,{credentials:'include',cache:'no-store',...options});
   const body=await response.json().catch(()=>({}));
   if(!response.ok||body.ok!==true){const error=new Error(body.error||'Błąd połączenia: HTTP '+response.status);error.status=response.status;throw error;}
   return body;
 }
 let section,form,subject,message,send,notice,history,historyTitle,refreshButton;
 let authorized=false,loading=false,sending=false,epoch=0;
 function status(text,isError=false){notice.textContent=text||'';notice.classList.toggle('aac1-error',isError);}
 function canSend(allow){authorized=allow;form.hidden=!allow;send.disabled=!allow||sending;}
 function dateTime(s){return format(s);}
 function showHistory(items){
   history.replaceChildren();
   const mine=(items||[]).filter(item=>item.kind==='contact');
   historyTitle.textContent='Moje wiadomości ('+mine.length+')';
   if(!mine.length){history.append(el('p','aac1-empty','Nie masz jeszcze wysłanych wiadomości.'));return;}
   for(const item of mine){
     const article=el('article','aac1-thread');
     const top=el('div','aac1-thread-header');
     top.append(el('strong','aac1-subject',item.subject||'(Bez tematu)'),el('time','aac1-date',dateTime(item.created_at)));
     const state=item.admin_reply?'Odpowiedziano':item.status==='read'?'Odczytano przez administratora':'Oczekuje na odpowiedź';
     const info=el('span','aac1-state'+(item.admin_reply?' aac1-state-replied':''),state);
     const sent=el('div','aac1-content',item.body||'');
     article.append(top,info,el('div','aac1-label','Twoja wiadomość'),sent);
     if(item.admin_reply){
       const answer=el('div','aac1-reply');
       const heading=el('div','aac1-reply-heading','✉ Odpowiedź administratora');
       if(item.replied_at)heading.append(el('span','aac1-date',' • '+dateTime(item.replied_at)));
       answer.append(heading,el('div','aac1-content',item.admin_reply));article.append(answer);
     }
     history.append(article);
   }
 }
 async function loadHistory(showProgress=false){
   if(!authorized||loading)return;
   const generation=epoch;loading=true;refreshButton.disabled=true;
   if(showProgress)status('Pobieram historię korespondencji…');
   try{const data=await request(API);
     if(generation!==epoch)return;
     showHistory(data.items);
     if(showProgress)status('Historia została odświeżona.');
   }catch(error){
     if(generation!==epoch)return;
     if(error.status===401||error.status===403){canSend(false);history.replaceChildren();historyTitle.textContent='Moje wiadomości';status('Sesja wygasła. Zaloguj się ponownie.',true);}
     else status('Nie udało się wczytać historii: '+error.message,true);
   }finally{loading=false;refreshButton.disabled=false;}
 }
 async function verifyAccount(){
   const generation=++epoch;
   canSend(false);history.replaceChildren();historyTitle.textContent='Moje wiadomości';
   status('Sprawdzam status konta…');
   try{
     const data=await request('/api/community-auth');
     if(generation!==epoch)return;
     if(data.authenticated&&data.user?.is_owner===true){section.hidden=true;status('');return;}
     section.hidden=false;
     if(!data.authenticated){status('Aby napisać do administratora, zaloguj się na swoje konto AIO.');return;}
     if(!data.email_verified||data.email_verification_required){status('Potwierdź adres e-mail na koncie AIO, aby korzystać z prywatnych wiadomości.');return;}
     canSend(true);status('Możesz wysłać prywatną wiadomość do właściciela AIO.');
     void loadHistory(false);
   }catch(error){if(generation===epoch)status('Nie udało się sprawdzić konta. Spróbuj ponownie za chwilę.',true);}
 }
 async function submit(event){
   event.preventDefault();if(sending||!authorized)return;
   const title=subject.value.trim(),body=message.value.trim();
   if(title.length<5||title.length>120||body.length<15||body.length>2000){
     status('Temat: 5–120 znaków. Wiadomość: 15–2000 znaków.',true);return;
   }
   const generation=epoch;
   sending=true;send.disabled=true;status('Wysyłam wiadomość…');
   try{
     const response=await request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',subject:title,body})});
     if(generation!==epoch)return;
     subject.value='';message.value='';
     await loadHistory(false);
     status('✓ '+(response.message||'Wiadomość została przekazana administratorowi.'));
   }catch(error){
     if(generation!==epoch)return;
     if(error.status===401||error.status===403){canSend(false);status('Wymagane ponowne zalogowanie i potwierdzenie e-maila.',true);}
     else status('Nie udało się wysłać: '+error.message,true);
   }finally{sending=false;send.disabled=!authorized;}
 }
 function init(){
   const host=document.querySelector('.aio-account-main');if(!host)return;
   section=el('section','aac1-root');section.id='aio-contact-admin';section.hidden=true;
   section.setAttribute('aria-labelledby','aac1-title');
   const head=el('div','aac1-heading');
   const left=el('div','');left.append(el('p','aac1-kicker','KONTAKT PRYWATNY'),el('h2','', '✉ Napisz do administratora'),el('p','aac1-description','Masz pytanie o konto, dostęp, pliki lub działanie strony? Napisz bezpośrednio do właściciela AIO. Odpowiedź pojawi się tutaj.'));
   head.append(left);section.append(head);
   form=el('form','aac1-form');form.hidden=true;form.noValidate=true;
   const labelSubject=el('label','aac1-field');labelSubject.append(el('span','', 'Temat wiadomości'));
   subject=el('input','aac1-input');subject.type='text';subject.name='subject';subject.required=true;subject.minLength=5;subject.maxLength=120;subject.autocomplete='off';subject.placeholder='Np. Pytanie o dostęp VIP';labelSubject.append(subject);
   const labelMessage=el('label','aac1-field');labelMessage.append(el('span','', 'Treść wiadomości'));
   message=el('textarea','aac1-input aac1-textarea');message.name='body';message.rows=6;message.required=true;message.minLength=15;message.maxLength=2000;message.placeholder='Opisz sprawę, w której potrzebujesz pomocy…';labelMessage.append(message);
   const actions=el('div','aac1-actions');send=el('button','aac1-send','✉ Wyślij do administratora');send.type='submit';send.disabled=true;
   const hint=el('p','aac1-hint','Do 3 wiadomości w ciągu 24 godzin. Minimum 5 minut przerwy między wysyłkami. Nie podawaj haseł ani danych płatniczych.');
   actions.append(send,hint);form.append(labelSubject,labelMessage,actions);form.addEventListener('submit',submit);section.append(form);
   notice=el('p','aac1-status','Sprawdzam status konta…');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');section.append(notice);
   const histHeader=el('div','aac1-history-head');historyTitle=el('h3','', 'Moje wiadomości');refreshButton=el('button','aac1-refresh','↻ Odśwież');refreshButton.type='button';refreshButton.addEventListener('click',()=>{if(authorized)void loadHistory(true);else void verifyAccount();});histHeader.append(historyTitle,refreshButton);
   history=el('div','aac1-history');section.append(histHeader,history);
   const before=host.querySelector('.aio-account-panels');if(before)before.before(section);else host.append(section);
   const toolbar=host.querySelector('.aio-account-actions');
   if(toolbar&&!toolbar.querySelector('[data-account-contact]')){
     const jump=el('a','aio-account-secondary','✉ Napisz do administratora');jump.href='#aio-contact-admin';jump.dataset.accountContact='1';toolbar.append(jump);
   }
   document.addEventListener('aio-community-ready',verifyAccount);
   document.addEventListener('aio-community-auth',verifyAccount);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authorized)void loadHistory(false);});
   void verifyAccount();
   if(location.hash==='#aio-contact-admin')setTimeout(()=>section.scrollIntoView({behavior:'smooth',block:'start'}),250);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
