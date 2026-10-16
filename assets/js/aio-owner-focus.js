/* Focus view of the existing admin panel. No permissions are granted here. */
(()=>{'use strict';
 const allowed={approvals:'Akceptacja wpłat',grants:'Dostępy 7 dni',downloads:'Historia pobrań',inbox:'Skrzynka AIO',pending:'Posty do zatwierdzenia',reports:'Zgłoszenia',published:'Opublikowane treści',users:'Użytkownicy',ip:'Blokady IP',logs:'Dziennik administracyjny',statistics:'Statystyki strony','access-activity':'Aktywność AIO Access','password-resets':'Reset hasła',security:'Bezpieczeństwo',sessions:'Sesje',comments:'Komentarze',chat:'Czat'};
 const target=new URLSearchParams(location.search).get('aio_section');if(!Object.hasOwn(allowed,target))return;
 const nativeTab=!['approvals','grants','downloads','inbox'].includes(target);
 const which=()=>({approvals:'#aio-access-owner-approvals',grants:'#aio-access-owner-recovery',downloads:'#aio-owner-downloads',inbox:'#aio-list-inbox'})[target]||'#aio-owner-legacy-workspace';
 async function start(){let owner=false;try{const r=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});const d=await r.json();owner=r.ok&&d.authenticated===true&&d.user?.is_owner===true;}catch(_){}
  if(!owner)return;document.documentElement.dataset.aioOwnerMode='focus';document.documentElement.dataset.aioOwnerTarget=target;
  const main=document.querySelector('#main-content');if(!main)return;
  const bar=document.createElement('nav');bar.className='aio-owner-focusbar';bar.setAttribute('aria-label','Nawigacja po administracji');
  const back=document.createElement('a');back.href='/owner-hub';back.textContent='← Centrum właściciela';
  const title=document.createElement('strong');title.textContent=allowed[target];
  const all=document.createElement('a');all.href='/community-admin.html';all.textContent='Pełny panel ↗';
  bar.append(back,title,all);main.prepend(bar);
  let attempted=false;
  function activate(){if(nativeTab && !attempted && window.AIOCommunity?.ready){const button=document.querySelector('[data-admin-tab="'+target+'"]');if(button){button.click();attempted=true;}}}
  activate();let cycles=0;const poll=setInterval(()=>{activate();const el=document.querySelector(which());if((nativeTab&&attempted)||(!nativeTab&&el&&!el.hidden)){if(el&&!el.hidden){el.scrollIntoView({behavior:'instant',block:'start'});}clearInterval(poll);}else if(++cycles>70)clearInterval(poll);},120);
  document.addEventListener('aio-community-ready',activate,{once:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else void start();
})();
