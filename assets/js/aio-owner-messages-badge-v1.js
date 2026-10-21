/* AIO Owner Messages V1 — small unread envelope above 'Moje konto'. */
(()=>{'use strict';
 if(window.__aioOwnerMessagesBadgeV1)return;window.__aioOwnerMessagesBadgeV1=true;
 const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/css/aio-owner-messages-v1.css?v=20261021-msg1';document.head.append(css);
 const accountLinks=()=>[...document.querySelectorAll('.site-header a.aio-nav-account,.portal-topbar a.aio-topbar-account')];
 let authenticated=false,inflight=false,interval=null;
 function paint(n){
   for(const a of accountLinks()){
     let mark=a.querySelector('.aom1-envelope');
     if(!n){mark?.remove();a.removeAttribute('data-aom-unread');continue;}
     if(!mark){mark=document.createElement('span');mark.className='aom1-envelope';mark.setAttribute('aria-hidden','true');a.append(mark);}
     mark.textContent='✉';mark.title=n+' nieprzeczytanych wiadomości od administracji';
     a.dataset.aomUnread=String(n);
     a.title=n+' nieprzeczytanych wiadomości — Moje konto';
   }
 }
 async function refresh(){
   if(inflight||document.hidden)return;
   inflight=true;
   try{
     const response=await fetch('/api/aio-owner-messages?view=unread',{credentials:'include',cache:'no-store'});
     if(response.status===401||response.status===403){authenticated=false;paint(0);return;}
     if(!response.ok)throw Error('Błąd licznika');
     const data=await response.json();if(!data.ok)throw Error('Brak danych');
     authenticated=true;paint(Math.max(0,Number(data.unread)||0));
   }catch(e){/* transient network failure must not falsely signal read status */}
   finally{inflight=false;}
 }
 function init(){
   void refresh();
   document.addEventListener('aio-community-auth',()=>{paint(0);void refresh();});
   document.addEventListener('aio-owner-messages-updated',()=>void refresh());
   window.addEventListener('focus',()=>{if(authenticated)void refresh();});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)void refresh();});
   if(!interval)interval=window.setInterval(()=>{if(authenticated&&!document.hidden)void refresh();},120000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
