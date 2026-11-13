/* AIO TunerHub — Moje Konto: właściciel → uporządkowane Centrum.
 * Zwykli użytkownicy pozostają na /konto.html.
 * Wyjątek: /konto.html?widok=konto pozwala właścicielowi przejrzeć ustawienia konta.
 * Brak odpowiedzi lub błąd API = pozostawienie obecnej strony, nigdy błędne uprawnienia.
 */
(()=>{'use strict';
  if(!/^\/konto\.html$/i.test(location.pathname))return;
  const params=new URLSearchParams(location.search);
  if(params.get('widok')==='konto')return;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  fetch('/api/community-auth',{
    method:'GET',credentials:'include',cache:'no-store',
    headers:{accept:'application/json'},signal:controller.signal
  }).then(async response=>{
    if(!response.ok)return null;
    return response.json().catch(()=>null);
  }).then(data=>{
    if(data?.ok===true && data.authenticated===true && data.user?.is_owner===true && data.email_verified===true){
      location.replace('/owner-hub');
    }
  }).catch(()=>{/* Public/ordinary account view remains accessible. */})
    .finally(()=>clearTimeout(timeout));
})();
