/* Warning visible on Moje konto and Downloads; no user identity is disclosed. */
(()=>{'use strict';
 async function show(){const host=document.querySelector('.aio-account-main')||document.querySelector('.page-shell')||document.querySelector('main');if(!host)return;
   try{const r=await fetch('/api/security-status',{credentials:'include',cache:'no-store'}),d=await r.json();let current=document.getElementById('aio-security-alert');
     if(!r.ok||!d.restricted){current?.remove();return;}
     if(!current){current=document.createElement('aside');current.id='aio-security-alert';current.className='asj-user-warning';current.setAttribute('role','alert');host.prepend(current);}
     const end=d.expires_at?new Date(d.expires_at).toLocaleString('pl-PL'):'';
     current.replaceChildren();
     const title=document.createElement('strong');title.textContent='⚠️ Pobieranie jest obecnie ograniczone';
     const paragraph=document.createElement('p');paragraph.textContent='Pobieranie jest obecnie ograniczone.'+(end?' Ograniczenie do: '+end+'.':'');
     const help=document.createElement('p');help.textContent='Jeśli uważasz, że to pomyłka, skontaktuj się z nami. Nie udostępniaj swojego hasła.';
     const action=document.createElement('a');action.className='asj-contact';action.href='/contact.html?topic=account-security';action.textContent='Skontaktuj się z administratorem →';
     current.append(title,paragraph,help,action);
   }catch(_){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else void show();
 document.addEventListener('aio-community-auth',show);
})();
