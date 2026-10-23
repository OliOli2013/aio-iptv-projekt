/* AIO Owner Desk V3 — unified, owner-verified navigation on existing APIs.
 * No new privileges, no writes, no alteration of legacy administrative actions.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normal=s=>String(s||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const fmt=n=>n===null||n===undefined?'—':Number(n).toLocaleString('pl-PL');
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const groups=[
  {id:'action',name:'Do załatwienia',icon:'◈',items:[
   {id:'support-purpose',name:'Cele wpłat: darowizna, 7 dni, VIP',icon:'♥',desc:'Weryfikacja celu, operatora i kwoty przed przyznaniem dostępu',url:'/owner-support-intents.html',tags:'darowizna vip 30 zł kawa buycoffee ko-fi revolut wpłaty',stat:'support'},
   {id:'approvals',name:'Zgłoszenia wsparcia',icon:'♡',desc:'Sprawdź deklaracje wpłat i podejmij decyzję',target:'approvals',tags:'płatność kawa buycoffee revolut ko-fi',stat:'support'},
   {id:'pending',name:'Posty do zatwierdzenia',icon:'▤',desc:'Moderacja nowych wpisów',target:'pending',tags:'wpisy publikowanie',stat:'posts'},
   {id:'inbox',name:'Skrzynka AIO',icon:'✉',desc:'Wiadomości i korespondencja',target:'inbox',tags:'kontakt odpowiedzi skrzynka',stat:'inbox'},
    {id:'admin-messages',name:'Wiadomości do użytkowników',icon:'✉',desc:'Wysyłaj wiadomości do konta lub wszystkich użytkowników',native:'aio-admin-messages',tags:'wysyłka poczta wiadomość prywatna komunikat ogłoszenie koperta konto'},
   {id:'reports',name:'Zgłoszenia naruszeń',icon:'⚑',desc:'Zgłoszenia społeczności i decyzje',target:'reports',tags:'skargi raporty',stat:'reports'},
   {id:'resets',name:'Reset haseł',icon:'⚿',desc:'Prośby o odzyskanie konta',target:'password-resets',tags:'reset kod hasło',stat:'resets'},
   {id:'lists',name:'Moderacja list ZIP',icon:'▦',desc:'Wnioski o publikację i aktualizacje',url:'/aio-list-upload.html#aluAdmin',tags:'kanały enigma2 lista bukiety upload',stat:'lists'}
  ]},
  {id:'accounts',name:'Konta i dostępy',icon:'♙',items:[
   {id:'users',name:'Użytkownicy',icon:'♙',desc:'Wyszukaj po nazwie lub e-mailu i zarządzaj kontem',target:'users',tags:'wyszukiwarka adres email profil ban konto'},
   {id:'vip',name:'Konta VIP',icon:'★',desc:'Dostęp miesięczny: nadaj, przedłuż lub wyłącz',target:'vip',tags:'30 dni płatny dostęp'},
   {id:'grants',name:'Dostępy 7 dni',icon:'✓',desc:'Uprawnienia i zatwierdzenia wsparcia',target:'grants',tags:'przyznanie grant potwierdzenia'},
   {id:'sessions',name:'Sesje użytkowników',icon:'◎',desc:'Aktywne sesje i ich zakończenie',target:'sessions',tags:'logowanie urządzenia'},
   {id:'ip',name:'Blokady adresów IP',icon:'⛨',desc:'Adresy z ograniczeniami i zwalnianie blokad',target:'ip',tags:'ban sieć blokada'}
  ]},
  {id:'security',name:'Bezpieczeństwo',icon:'⬡',items:[
   {id:'v6-blocks',name:'Security V6 — zablokowane konta',icon:'⛔',desc:'Automatyczne blokady, odwołania i ręczne decyzje',url:'/aio-security-v6.html',tags:'v6 bot skrypt ban blokady nadużycia odwołania'},
    {id:'ip-policy-v7',name:'Jedno konto na IP • V8.1',icon:'⛨',desc:'Blokowanie duplikatów, zgody na rejestrację, przegląd historyczny',url:'/aio-ip-policy.html',tags:'ip jedno konto blokady duplikaty rejestracja administracja'},
   {id:'security-journal',name:'Dziennik bezpieczeństwa',icon:'⬡',desc:'Wspólne IP, udostępniane konta i decyzje',native:'aio-security-journal',tags:'logowania alerty blokady wspólne ip vip'},
   {id:'security',name:'Ochrona administratora',icon:'⛨',desc:'Uprawnienia, dostęp właściciela i kontrole',target:'security',tags:'administracja bezpieczeństwo'},
   {id:'logs',name:'Dziennik administracyjny',icon:'≡',desc:'Historia operacji na kontach i treściach',target:'logs',tags:'moderacja audyt log'}
  ]},
  {id:'content',name:'Treści i pliki',icon:'▧',items:[
   {id:'published',name:'Opublikowane wpisy',icon:'▤',desc:'Edycja, ukrywanie i przypinanie',target:'published',tags:'treści posty'},
   {id:'comments',name:'Komentarze',icon:'☷',desc:'Kontrola komentarzy i odpowiedzi',target:'comments',tags:'dyskusja'},
   {id:'chat',name:'Czat',icon:'☏',desc:'Wiadomości czatu i moderacja',target:'chat',tags:'rozmowy'},
   {id:'downloads',name:'Historia pobrań R2',icon:'⇩',desc:'Wydane pliki, użytkownicy i CSV',target:'downloads',tags:'pliki zip ipk licznik raport'},
   {id:'post-links',name:'Pliki z postów',icon:'⤓',desc:'Przekazania zewnętrzne i pobrania AIO',native:'aio-post-links-history',tags:'linki posty pliki 3 168 godzin'},
   {id:'activity',name:'Aktywność AIO Access',icon:'◉',desc:'Zdarzenia związane z dostępem do plików',target:'access-activity',tags:'pobrania bramka'},
   {id:'catalog',name:'Katalog list kanałów',icon:'▦',desc:'Podgląd opublikowanych list',url:'/channel-lists.html',tags:'bukiety listy publikacje'}
  ]},
  {id:'system',name:'Statystyki i system',icon:'⚙',items:[
   {id:'stats',name:'Statystyki strony',icon:'▥',desc:'Wizyty, użytkownicy i ruch',target:'statistics',tags:'odsłony aktywność raporty'},
   {id:'maintenance',name:'Konserwacja i retencja',icon:'⚙',desc:'D1, R2, wygasłe rekordy i porządki',url:'/aio-maintenance.html',tags:'backup czyszczenie bezpieczeństwo'},
   {id:'list-storage',name:'Listy — administracja',icon:'▦',desc:'Zarządzanie publikacją plików list kanałów',url:'/aio-list-upload.html#aluAdmin',tags:'wgrywanie ZIP'},
   {id:'classic',name:'Panel klasyczny',icon:'↗',desc:'Pełny widok administracyjny jako alternatywa',url:'/community-admin.html',standalone:true,tags:'stary tradycyjny panel'}
  ]}
 ];
 const sections=groups.flatMap(g=>g.items.map(i=>({...i,group:g.id,groupName:g.name})));
 const byId=new Map(sections.map(s=>[s.id,s]));
 const counts={support:null,posts:null,inbox:null,reports:null,resets:null,lists:null,holds:null,downloads:null};
 let active='dashboard',last='dashboard',iframe=null,frameObserver=null,frameTimer=null,cacheSearch='',loaded=false;
 let pinned=[];try{const data=JSON.parse(localStorage.getItem('aio_owner_v3_pins')||'[]');if(Array.isArray(data))pinned=data.filter(id=>byId.has(id)).slice(0,10);}catch(_){}
 const ICON={dashboard:'⌂'};
 const baseLink=(item)=>item.target?('/community-admin.html?aio_section='+encodeURIComponent(item.target)):(item.url||('/owner-hub#'+item.native));
 const renderLink=(item,wide=false)=>`<button type="button" class="aop-shortcut ${wide?'aop-shortcut-wide':''}" data-aop-go="${esc(item.id)}"><span class="aop-shortcut-icon" aria-hidden="true">${esc(item.icon)}</span><span class="aop-shortcut-copy"><strong>${esc(item.name)}</strong><small>${esc(item.desc)}</small></span><span aria-hidden="true" class="aop-shortcut-arrow">→</span></button>`;
 const important=['approvals','pending','inbox','admin-messages','users','vip','security-journal'];
 function changeHash(id){try{history.pushState({aop:id},'',location.pathname+location.search+'#panel='+encodeURIComponent(id));}catch(_){/* Keep module usable if history is disabled. */}}
 function parseHash(){const value=location.hash;if(value==='#aio-security-journal')return 'security-journal';if(value==='#aio-post-links-history')return 'post-links';if(value==='#aio-admin-messages')return 'admin-messages';if(value.startsWith('#panel='))return decodeURIComponent(value.slice(7));return 'dashboard';}
 function validate(id){return id==='dashboard'||byId.has(id)?id:'dashboard';}
 function setPin(id){if(pinned.includes(id))pinned=pinned.filter(x=>x!==id);else pinned=[id,...pinned].slice(0,10);try{localStorage.setItem('aio_owner_v3_pins',JSON.stringify(pinned));}catch(_){}if(active==='dashboard')drawDashboard();updatePin();}
 function updatePin(){const b=$('aop-pin');if(!b)return;b.hidden=active==='dashboard';b.textContent=pinned.includes(active)?'★ Przypięto':'☆ Przypnij';b.setAttribute('aria-label',pinned.includes(active)?'Usuń ze skrótów':'Przypnij w skrótach');}
 function drawNavigation(){const root=$('aop-nav');if(!root)return;root.replaceChildren();
  const home=make('button','aop-nav-home'+(active==='dashboard'?' is-active':''));home.type='button';home.dataset.aopGo='dashboard';home.append(make('span','aop-side-symbol','⌂'),make('span','', 'Pulpit właściciela'));root.append(home);
  for(const group of groups){const details=make('details','aop-nav-group');details.open=group.items.some(x=>x.id===active)||(!matchMedia('(max-width:760px)').matches&&group.id==='action');const summary=make('summary','aop-nav-heading');summary.append(make('span','aop-side-symbol',group.icon),make('strong','',group.name),make('span','aop-nav-caret','⌄'));details.append(summary);
   const inner=make('div','aop-nav-items');for(const item of group.items){const b=make('button','aop-nav-item'+(active===item.id?' is-active':''));b.type='button';b.dataset.aopGo=item.id;b.title=item.desc;b.append(make('span','aop-nav-item-icon',item.icon),make('span','',item.name));if(counts[item.stat]>0)b.append(make('span','aop-nav-count',String(counts[item.stat])));inner.append(b);}details.append(inner);root.append(details);
  }
 }
 function drawDashboard(){const root=$('aop-dashboard');if(!root)return;
  const today=new Intl.DateTimeFormat('pl-PL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  const cards=[['support','Zgłoszenia wsparcia','approvals'],['posts','Posty do moderacji','pending'],['holds','Blokady pobierania','security-journal'],['downloads','Wydania plików / 24 h','downloads']];
  root.innerHTML=`<div class="aop-hero"><div><span class="aop-eyebrow">CENTRUM ZARZĄDZANIA • ${esc(today)}</span><h1>Panel właściciela</h1><p>Wszystkie sprawy AIO uporządkowane według zadań. Wybierz dział — otworzy się tutaj, bez wędrowania po stronach.</p></div><span class="aop-hero-icon" aria-hidden="true">⌘</span></div>
  <div class="aop-stats" aria-label="Bieżące wskaźniki">${cards.map(([key,title,id])=>`<button class="aop-stat" type="button" data-aop-go="${id}"><small>${title}</small><strong data-aop-count="${key}">${fmt(counts[key])}</strong><span>Przejdź do działu →</span></button>`).join('')}</div>
  <section class="aop-dash-block"><div class="aop-dash-head"><div><span class="aop-eyebrow">PIERWSZE W KOLEJNOŚCI</span><h2>Sprawy wymagające uwagi</h2></div><button type="button" class="aop-textbtn" id="aop-refresh-dash">↻ Odśwież dane</button></div><div class="aop-action-grid">${['approvals','pending','inbox','reports','resets','lists'].map(id=>{const x=byId.get(id);const c=counts[x.stat];return `<button class="aop-action" type="button" data-aop-go="${id}"><span class="aop-action-symbol">${esc(x.icon)}</span><span><strong>${esc(x.name)}</strong><small>${esc(x.desc)}</small></span><span class="aop-action-num" data-aop-count="${esc(x.stat)}">${fmt(c)}</span></button>`;}).join('')}</div><p class="aop-note">Liczby pochodzą z bieżących odpowiedzi API. Znak „—” oznacza brak odczytu, a nie zero zgłoszeń.</p></section>
  ${pinned.length?`<section class="aop-dash-block"><div class="aop-dash-head"><h2>Przypięte funkcje</h2><small>Twoje skróty, tylko w tej przeglądarce</small></div><div class="aop-shortcuts">${pinned.map(id=>renderLink(byId.get(id))).join('')}</div></section>`:''}
  <section class="aop-dash-block"><div class="aop-dash-head"><div><span class="aop-eyebrow">NAJCZĘŚCIEJ POTRZEBNE</span><h2>Szybki dostęp</h2></div></div><div class="aop-shortcuts">${important.map(id=>renderLink(byId.get(id))).join('')}</div></section>
  <section class="aop-dash-block"><div class="aop-dash-head"><div><span class="aop-eyebrow">UPORZĄDKOWANE NARZĘDZIA</span><h2>Wszystkie działy</h2></div></div><div class="aop-chapter-grid">${groups.map(g=>`<article class="aop-chapter"><span class="aop-chapter-symbol">${g.icon}</span><h3>${esc(g.name)}</h3><p>${g.items.length} funkcji w tym dziale</p><div>${g.items.slice(0,4).map(x=>`<button type="button" data-aop-go="${esc(x.id)}">${esc(x.name)} <span>→</span></button>`).join('')}</div></article>`).join('')}</div></section>`;
  const refresh=$('aop-refresh-dash');if(refresh)refresh.addEventListener('click',()=>void fetchCounts());
 }
 function renderCounts(){document.querySelectorAll('[data-aop-count]').forEach(e=>{const key=e.dataset.aopCount;if(Object.hasOwn(counts,key))e.textContent=fmt(counts[key]);});drawNavigation();}
 async function getJson(path){const c=new AbortController();const timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(path,{credentials:'include',cache:'no-store',signal:c.signal});const d=await r.json();if(!r.ok||d.ok!==true)throw new Error('Błąd odczytu '+path);return d;}finally{clearTimeout(timer);}}
 async function fetchCounts(){const status=$('aop-fetch-status');if(status)status.textContent='Aktualizacja danych…';
  const jobs=[
   ['support','/api/aio-support-intent?scope=admin',d=>Number(d.pending_total||0)],
   ['posts','/api/community?action=admin&tab=pending',d=>Number(d.stats?.pending??d.rows?.length??0)],
   ['reports','/api/community?action=admin&tab=reports',d=>Number(d.stats?.reports??d.rows?.length??0)],
   ['resets','/api/community?action=admin&tab=password-resets',d=>Number(d.stats?.password_resets??d.rows?.filter(x=>x.status==='pending').length??0)],
   ['inbox','/api/list-inbox?scope=admin',d=>(d.items||[]).filter(x=>x.status==='new').length],
   ['lists','/api/list-submissions?view=admin',d=>(d.items||[]).filter(x=>['pending','publish_failed'].includes(x.status)).length],
   ['holds','/api/owner-security-journal?offset=0',d=>Number(d.stats?.active_holds??0)],
   ['downloads','/api/owner-downloads?days=1',d=>Number(d.totals?.issued??0)]
  ];
  await Promise.allSettled(jobs.map(async ([id,url,fn])=>{try{const data=await getJson(url);counts[id]=fn(data);}catch(_){counts[id]=null;}renderCounts();}));
  if(status)status.textContent='Ostatnie odświeżenie: '+new Date().toLocaleTimeString('pl-PL');
 }
 function hideFind(){const box=$('aop-found');if(box)box.hidden=true;}
 function searchTools(value){cacheSearch=value;const box=$('aop-found'),result=$('aop-found-results');if(!box||!result)return;const term=normal(value.trim());if(!term){hideFind();return;}const matches=sections.filter(i=>normal([i.name,i.desc,i.tags,i.groupName].join(' ')).includes(term)).slice(0,13);
   result.innerHTML=matches.length?matches.map(i=>`<button type="button" data-aop-go="${esc(i.id)}"><span>${esc(i.icon)}</span><span><strong>${esc(i.name)}</strong><small>${esc(i.groupName)} · ${esc(i.desc)}</small></span><b>↵</b></button>`).join(''):'<p>Nie znaleziono funkcji. Spróbuj np. „VIP”, „użytkownicy”, „pobrania” lub „listy”.</p>';
   box.hidden=false;
 }
 let pendingAccountSearch='';
 function bindAccountSearch(){const f=$('aop-account-form');if(!f)return;f.addEventListener('submit',e=>{e.preventDefault();const term=$('aop-account-search').value.trim();if(term.length<2){$('aop-account-search').focus();return;}pendingAccountSearch=term;navigate('users',true);});}
 function applyAccountSearch(){if(!iframe||active!=='users'||!iframe.dataset.userSearch)return;let d;try{d=iframe.contentDocument;}catch(_){return;}const input=d?.querySelector('[data-aio-user-search-input]');if(!input){setTimeout(applyAccountSearch,350);return;}input.value=iframe.dataset.userSearch;input.dispatchEvent(new Event('input',{bubbles:true}));delete iframe.dataset.userSearch;}
 function stopFrame(){if(frameObserver){frameObserver.disconnect();frameObserver=null;}if(frameTimer){clearTimeout(frameTimer);frameTimer=null;}if(iframe){iframe.remove();iframe=null;}}
 function fitFrame(){if(!iframe||!iframe.contentDocument)return;try{const doc=iframe.contentDocument;const h=Math.max(doc.documentElement.scrollHeight,doc.body?.scrollHeight||0);if(h>0)iframe.style.height=Math.max(690,Math.min(h+32,8000))+'px';}catch(_){}}
 function setupFrame(frame,item){const wrap=$('aop-embedded'),loading=$('aop-work-loading');if(!wrap)return;
   stopFrame();iframe=frame;wrap.replaceChildren();wrap.append(frame);wrap.hidden=false;if(loading)loading.hidden=false;
   frame.addEventListener('load',()=>{if(frame!==iframe)return;if(loading)loading.hidden=true;
     if(item.target){try{const d=frame.contentDocument;const style=d.createElement('style');style.textContent=`html{scroll-behavior:auto!important}html body{margin:0!important;min-height:0!important;background:#071c28!important}html .site-header,html .site-footer,html .skip-link,html .aio-owner-focusbar,html .community-account,html .aoc-intro,html #aio-owner-center{display:none!important}html .page-shell{max-width:none!important;min-height:0!important;padding:0!important;margin:0!important;background:transparent!important}html main#main-content{max-width:none!important;padding:10px 6px!important;margin:0!important;min-height:0!important}html .community-shell{max-width:none!important}html[data-aio-owner-mode=focus] #aio-owner-legacy-workspace{margin:0!important}html .standalone-main{padding-top:6px!important}`;d.head.append(style);
       if(frameObserver)frameObserver.disconnect();frameObserver=new MutationObserver(()=>{clearTimeout(frameTimer);frameTimer=setTimeout(fitFrame,240);});frameObserver.observe(d.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class']});
      }catch(_){} }
      fitFrame();setTimeout(fitFrame,480);setTimeout(fitFrame,1500);applyAccountSearch();
   });
   frame.addEventListener('error',()=>{if(loading)loading.textContent='Nie udało się załadować modułu. Użyj „Otwórz osobno”.';});
   const frameUrl=item.target?('/community-admin.html?aio_section='+encodeURIComponent(item.target)):(item.url||'/community-admin.html');
   frame.src=frameUrl+(item.target==='users'&&pendingAccountSearch?'&aio_user='+encodeURIComponent(pendingAccountSearch):'');
   pendingAccountSearch='';
 }
 function mountNative(item){
    stopFrame();$('aop-embedded').hidden=true;
    const mount=$('aop-native'),home=document.querySelector('.oh-content');
    if(!mount||!home)return;
    // Preserve existing native modules and listeners while switching owner tabs.
    for(const child of [...mount.children]){
      if(['aio-security-journal','aio-post-links-history','aio-admin-messages'].includes(child.id)){
        child.hidden=true;home.appendChild(child);
      }else child.remove();
    }
    mount.hidden=false;
    const node=$(item.native);
    if(node){node.hidden=false;mount.append(node);}
    else mount.append(make('p','aop-loading','Ładuję dane modułu…'));
  }
 function syncNative(){if(!loaded)return;
    const ids=['aio-security-journal','aio-post-links-history','aio-admin-messages'];
    for(const id of ids){const node=$(id);
      if(node && !node.closest('#aop-native') && document.documentElement.dataset.aopV3==='ready')node.hidden=true;
    }
    if(active!=='dashboard'&&byId.get(active)?.native){
      const item=byId.get(active),node=$(item.native),mount=$('aop-native');
      if(node&&mount&&!mount.contains(node))mountNative(item);
    }
  }
 function navigate(id,historyChange=false){id=validate(id);if(historyChange)changeHash(id);last=active;active=id;const item=byId.get(id),desk=$('aop-dashboard'),work=$('aop-work'),title=$('aop-work-title'),desc=$('aop-work-desc'),external=$('aop-open'),crumb=$('aop-crumb');
   if(!desk||!work)return;
   desk.hidden=id!=='dashboard';work.hidden=id==='dashboard';hideFind();
   if(id==='dashboard'){stopFrame();$('aop-embedded').hidden=true;$('aop-native').hidden=true;drawDashboard();if(crumb)crumb.textContent='Pulpit';}
   else {if(crumb)crumb.textContent=item.groupName+' / '+item.name;if(title)title.textContent=item.name;if(desc)desc.textContent=item.desc;if(external){external.href=baseLink(item);external.hidden=false;}
     if(item.native)mountNative(item);else if(item.standalone){stopFrame();$('aop-embedded').hidden=true;$('aop-native').hidden=false;$('aop-native').replaceChildren(make('p','aop-note','Pełny panel klasyczny pozostaje dostępny jako osobna strona. Otwórz go przyciskiem „Otwórz osobno”.'));}
     else { $('aop-native').hidden=true;const frame=make('iframe','aop-frame');frame.title='Moduł właściciela: '+item.name;frame.loading='eager';frame.referrerPolicy='same-origin';frame.setAttribute('allow','clipboard-write');setupFrame(frame,item);}
   }
   updatePin();drawNavigation();if($('aop-search')){$('aop-search').value='';cacheSearch='';}const main=$('aop-v3');if(main)main.scrollIntoView({behavior:'instant',block:'start'});
 }
 function installUI(){const app=$('oh-app'),content=document.querySelector('.oh-content'),sidebar=document.querySelector('.oh-sidebar');if(!app||!content||!sidebar)return false;
  const side=make('nav','aop-side');side.id='aop-nav';side.setAttribute('aria-label','Działy Centrum Właściciela');sidebar.insertBefore(side,sidebar.querySelector('.oh-sidebottom'));
  const shell=make('div','aop-shell');shell.id='aop-v3';shell.innerHTML=`<div class="aop-utility"><div class="aop-utility-left"><span class="aop-status-dot" aria-hidden="true"></span><span class="aop-utility-label">AIO • PANEL OPERACYJNY</span><span class="aop-crumb" id="aop-crumb">Pulpit</span></div><div class="aop-global-search"><span aria-hidden="true">⌕</span><input id="aop-search" autocomplete="off" type="search" placeholder="Znajdź funkcję: VIP, pobrania, hasła…" aria-label="Szukaj funkcji administracyjnej"/><kbd>Ctrl K</kbd><div class="aop-find" id="aop-found" hidden><div class="aop-find-label">Wyniki wyszukiwania</div><div id="aop-found-results"></div></div></div></div>
  <div class="aop-dashboard" id="aop-dashboard"></div>
  <section class="aop-work" id="aop-work" hidden><div class="aop-work-head"><div><button type="button" class="aop-back" data-aop-go="dashboard">← Wróć do pulpitu</button><span class="aop-eyebrow">OBSZAR ROBOCZY</span><h1 id="aop-work-title">Moduł</h1><p id="aop-work-desc"></p></div><div class="aop-work-actions"><button type="button" id="aop-pin">☆ Przypnij</button><a id="aop-open" href="/community-admin.html" target="_blank" rel="noopener noreferrer">↗ Otwórz osobno</a></div></div><div class="aop-work-loading" id="aop-work-loading" hidden>Ładowanie modułu właściciela…</div><div id="aop-embedded" class="aop-embedded" hidden></div><div id="aop-native" class="aop-native" hidden></div></section>
  <div class="aop-footer"><span id="aop-fetch-status" role="status">Odczyt danych w toku…</span><span>Wszystkie decyzje i uprawnienia nadal weryfikuje serwer Cloudflare D1</span></div>`;
  content.prepend(shell);
  const sidePanel=make('form','aop-side-account');sidePanel.id='aop-account-form';sidePanel.innerHTML=`<label for="aop-account-search">SZYBKIE SZUKANIE KONTA</label><div><input id="aop-account-search" type="search" minlength="2" maxlength="100" placeholder="Nazwa lub e-mail" autocomplete="off" aria-label="Szukaj użytkownika po nazwie lub e-mailu"/><button type="submit" aria-label="Znajdź konto">⌕</button></div>`;
  sidebar.insertBefore(sidePanel,sidebar.querySelector('.oh-sidebottom'));bindAccountSearch();
  document.addEventListener('click',e=>{const b=e.target.closest('[data-aop-go]');if(b){const id=b.dataset.aopGo;if(byId.has(id)||id==='dashboard'){e.preventDefault();navigate(id,true);}}});
  $('aop-pin').addEventListener('click',()=>setPin(active));
  const search=$('aop-search');search.addEventListener('input',e=>searchTools(e.target.value));search.addEventListener('keydown',e=>{if(e.key==='Escape'){search.value='';hideFind();search.blur();}if(e.key==='Enter'){const b=$('aop-found-results')?.querySelector('[data-aop-go]');if(b){e.preventDefault();navigate(b.dataset.aopGo,true);}}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();search.select();}});
  document.addEventListener('click',e=>{if(!e.target.closest('.aop-global-search'))hideFind();});
  window.addEventListener('popstate',()=>{const id=parseHash();if(id!==active)navigate(id,false);});window.addEventListener('hashchange',()=>{const id=parseHash();if(id!==active)navigate(id,false);});
  return true;
 }
 async function init(){try{const r=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});const d=await r.json();if(!r.ok||d.authenticated!==true||d.user?.is_owner!==true||d.email_verified!==true)return;
   if(!installUI())return;loaded=true;document.documentElement.dataset.aopV3='ready';
   const obs=new MutationObserver(syncNative);obs.observe(document.querySelector('.oh-content'),{childList:true});
   navigate(parseHash(),false);void fetchCounts();
  }catch(error){console.error('AIO Owner Desk V3: cannot initialize',String(error?.message||error));}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});else void init();
})();
/* AIO OWNER MESSAGES PANEL NAV FIX V1 */
