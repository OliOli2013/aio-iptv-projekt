/* AIO Owner Hub V1 — catalog only; all actual permissions remain on Cloudflare APIs. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const groups=[
  {id:'access',name:'Dostęp i płatności',icon:'♢',summary:'Wpłaty, akceptacje, dostępy i pobieranie',items:[
   {id:'approvals',name:'Akceptacja wpłat AIO Access',icon:'✓',description:'Nowe zgłoszenia, dane wpłaty, zatwierdzanie lub odrzucanie i kontakt ze wspierającym.',href:'/community-admin.html?aio_section=approvals',keywords:'kawa revolut buycoffee ko-fi 7 dni płatność' },
   {id:'grants',name:'Dostępy 7 dni i potwierdzenia',icon:'◈',description:'Historia uprawnień, ręczne potwierdzenia i przypisanie dostępu do konta.',href:'/community-admin.html?aio_section=grants',keywords:'granty ręczne odzyskanie wpłata' },
   {id:'vip',name:'Konta VIP — miesiąc bez limitu',icon:'★',description:'Aktywacja, przedłużenie i wyłączenie VIP po e-mailu konta AIO.',href:'/community-admin.html?aio_section=vip',keywords:'vip miesiąc 30 dni nielimitowany email konto' },
   {id:'post-downloads',name:'Pliki z postów — historia',icon:'⇩',description:'Pliki wydane z R2 i zewnętrzne przekazania — wspólny licznik 3/168 h.',href:'/owner-hub#aio-post-links-history',keywords:'wpisy linki pliki pobrania r2 quota'},
   {id:'downloads',name:'Historia pobrań',icon:'⇩',description:'Pobrania lokalnych plików, zakres dni, wyszukiwarka, CSV i czyszczenie dziennika.',href:'/community-admin.html?aio_section=downloads',keywords:'pliki filtry dziennik csv data' },
   {id:'activity',name:'Aktywność AIO Access',icon:'◉',description:'Przejścia przez bramkę pobierania i działania przy linkach zewnętrznych.',href:'/community-admin.html?aio_section=access-activity',keywords:'zewnętrzne megawrzuta sesje linki' }
  ]},
  {id:'community',name:'Społeczność i treści',icon:'▤',summary:'Posty, komentarze, raporty i czat',items:[
   {id:'posts',name:'Posty do zatwierdzenia',icon:'✎',description:'Nowe wpisy Społeczności AIO wymagające decyzji administratora.',href:'/community-admin.html?aio_section=pending',keywords:'moderacja publikacje oczekujące' },
   {id:'reports',name:'Zgłoszenia użytkowników',icon:'⚑',description:'Raporty dotyczące treści, zachowania i naruszeń zasad.',href:'/community-admin.html?aio_section=reports',keywords:'skargi raporty naruszenia' },
   {id:'published',name:'Opublikowane treści',icon:'▣',description:'Edycja, ukrywanie, przypinanie i kontrola wpisów.',href:'/community-admin.html?aio_section=published',keywords:'posty edycja' },
   {id:'comments',name:'Komentarze',icon:'☰',description:'Moderowanie komentarzy w Społeczności AIO.',href:'/community-admin.html?aio_section=comments',keywords:'dyskusje wpisy moderacja' },
   {id:'chat',name:'Czat społeczności',icon:'☏',description:'Przegląd i moderacja wiadomości czatu.',href:'/community-admin.html?aio_section=chat',keywords:'wiadomości czat' }
  ]},
  {id:'lists',name:'Listy kanałów i wiadomości',icon:'▦',summary:'Zgłoszenia Enigma2 i skrzynka AIO',items:[
   {id:'list-approve',name:'Moderacja list kanałów',icon:'☑',description:'Zatwierdzanie archiwów ZIP, aktualizacje list i blokady publikowania.',href:'/aio-list-upload.html#aluAdmin',keywords:'enigma2 bukiety zip github satelitarne' },
   {id:'inbox',name:'Skrzynka odbiorcza AIO',icon:'✉',description:'Wiadomości od użytkowników, nowe listy i powiadomienia o wsparciu.',href:'/community-admin.html?aio_section=inbox',keywords:'wiadomości kontakt zgłoszenia' },
   {id:'list-catalog',name:'Opublikowane listy kanałów',icon:'▥',description:'Przejdź do katalogu udostępnionych list i sprawdź widok użytkownika.',href:'/channel-lists.html',keywords:'listy panel aio bukiety publikacja' }
  ]},
  {id:'accounts',name:'Konta i bezpieczeństwo',icon:'⬡',summary:'Użytkownicy, reset haseł, blokady i sesje',items:[
   {id:'users',name:'Użytkownicy',icon:'♙',description:'Profile, uprawnienia, blokady i zarządzanie kontami.',href:'/community-admin.html?aio_section=users',keywords:'konta użytkownicy role ban' },
   {id:'resets',name:'Prośby o reset hasła',icon:'⚿',description:'Obsługa kodów oraz zgłoszeń odzyskiwania dostępu do konta.',href:'/community-admin.html?aio_section=password-resets',keywords:'hasło logowanie' },
   {id:'security-journal',name:'Trwały dziennik logowań i wspólne IP',icon:'◷',description:'Zdarzenia serwera, kolizje IP, ostrzeżenia i ręczne odblokowanie pobierania.',href:'/owner-hub#aio-security-journal',keywords:'ip logowania bezpieczeństwo ostrzeżenie historia'},
   {id:'security',name:'Bezpieczeństwo systemu',icon:'⚑',description:'Kontrole bezpieczeństwa, uprawnienia i wydarzenia administracyjne.',href:'/community-admin.html?aio_section=security',keywords:'audyt zagrożenia admin' },
   {id:'sessions',name:'Aktywne sesje',icon:'◷',description:'Sesje użytkowników i narzędzia do ich nadzorowania.',href:'/community-admin.html?aio_section=sessions',keywords:'logowanie urządzenia sesje' },
   {id:'ip',name:'Blokady adresów IP',icon:'⛨',description:'Blokowanie i odblokowywanie adresów naruszających zasady.',href:'/community-admin.html?aio_section=ip',keywords:'ban ip zapora' },
   {id:'logs',name:'Dziennik administracyjny',icon:'≡',description:'Rejestr operacji administracyjnych i decyzji moderacyjnych.',href:'/community-admin.html?aio_section=logs',keywords:'historia logi audyt' }
  ]},
  {id:'analytics',name:'Statystyki i raporty',icon:'▥',summary:'Ruch na stronie i aktywność plików',items:[
   {id:'stats',name:'Statystyki strony',icon:'▤',description:'Odsłony, aktywność Społeczności i inne wskaźniki.',href:'/community-admin.html?aio_section=statistics',keywords:'ruch wykresy wizyty' },
   {id:'downloads-report',name:'Raport pobrań i eksport CSV',icon:'⇩',description:'Analiza liczby wydanych plików i pobrań z poszczególnych dni.',href:'/community-admin.html?aio_section=downloads',keywords:'statystyki plik eksport dni' }
  ]},
  {id:'maintenance',name:'Konserwacja i prywatność',icon:'⚙',summary:'D1, R2, porządki i zgodność danych',items:[
   {id:'maint',name:'Konserwacja i retencja',icon:'⚙',description:'Wygasłe sesje, tokeny, historia IP i bezpieczne czyszczenie.',href:'/aio-maintenance.html',keywords:'baza D1 retencja porządki backup' },
   {id:'media',name:'Kontrola zdjęć R2',icon:'▧',description:'Sprawdzenie próbki załączników i brakujących obiektów w magazynie.',href:'/aio-maintenance.html#aioMaintPrivate',keywords:'zdjęcia pliki media r2' },
   {id:'privacy',name:'Polityka prywatności i RODO',icon:'§',description:'Przejrzyj dokumenty o danych, plikach cookies i prawach użytkownika.',href:'/privacy-community.html',keywords:'rodo dokumenty regulamin ochrona danych' }
  ]}
 ];
 const icons={all:'⌑'};const quick=['approvals','posts','inbox','downloads'];
 const records=groups.flatMap(g=>g.items.map(item=>({...item,groupId:g.id,group:g.name})));
 let active='all',query='';
 const make=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
 function drawNav(){const root=$('oh-categories');root.replaceChildren();for(const g of [{id:'all',name:'Wszystkie działy',icon:'⌑',items:records},...groups]){
   const b=make('button',undefined,'oh-cat');b.type='button';b.dataset.category=g.id;b.setAttribute('aria-pressed',String(active===g.id));
   b.append(make('span',g.icon,'oh-cat-icon'),make('span',g.name),make('span',String(g.items.length),'oh-cat-count'));
   b.addEventListener('click',()=>{active=g.id;query='';$('oh-search').value='';render();if(matchMedia('(max-width:760px)').matches)$('oh-tools-title').scrollIntoView({behavior:'smooth',block:'start'});});root.append(b);
 }}
 function toolCard(item){const a=make('a',undefined,'oh-tool');a.href=item.href;a.append(make('span',item.icon,'oh-tool-icon'));const block=make('div',undefined,'oh-tool-content');block.append(make('strong',item.name),make('p',item.description));a.append(block,make('span','↗','oh-tool-arrow'));return a;}
 function drawQuick(){const root=$('oh-quick');root.replaceChildren();for(const id of quick){const item=records.find(x=>x.id===id);const a=make('a');a.href=item.href;a.append(make('span',item.icon,'oh-quick-icon'));const copy=make('span');copy.append(make('strong',item.name),make('small',item.description));a.append(copy,make('span','↗','oh-quick-arrow'));root.append(a);}}
 function norm(t){return String(t||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
 function render(){drawNav();const result=$('oh-results');result.replaceChildren();const term=norm(query.trim());let total=0;
  for(const group of groups){if(active!=='all'&&active!==group.id&&!term)continue;const items=group.items.filter(item=>{if(!term)return active==='all'||active===group.id;return norm(`${item.name} ${item.description} ${item.keywords} ${group.name}`).includes(term);});if(!items.length)continue;total+=items.length;
    const section=make('section',undefined,'oh-group');const heading=make('div',undefined,'oh-group-heading');heading.append(make('h3',group.name),make('span',group.summary));section.append(heading);const grid=make('div',undefined,'oh-group-grid');items.forEach(item=>grid.append(toolCard(item)));section.append(grid);result.append(section);
  }
  $('oh-count').textContent=total+' funkcji';$('oh-empty').hidden=total!==0;}
 function displayError(text){const guard=$('oh-guard');guard.replaceChildren();guard.append(make('strong','Centrum Właściciela'));guard.append(make('p',text));const a=make('a','Wróć do Społeczności AIO');a.href='/community.html';a.style.color='#98e8f2';guard.append(a);}
 async function getJson(url){const r=await fetch(url,{credentials:'include',cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||'Błąd');return d;}
 function stat(id,value){$(id).textContent=Number.isFinite(Number(value))?Number(value).toLocaleString('pl-PL'):'—';}
 async function loadCounts(){await Promise.allSettled([
   (async()=>{const d=await getJson('/api/aio-access-approvals?scope=admin');stat('oh-stat-payments',(d.requests||[]).filter(r=>r.status==='pending').length);})(),
   (async()=>{const d=await getJson('/api/community-admin?tab=pending');stat('oh-stat-posts',(d.stats?.pending ?? d.rows?.length));})(),
   (async()=>{const d=await getJson('/api/owner-downloads?days=1');stat('oh-stat-downloads',d.totals?.issued);stat('oh-stat-active',d.totals?.active_grants);})()
  ]);}
 async function boot(){try{const d=await getJson('/api/community-auth');if(!d.authenticated||d.user?.is_owner!==true){displayError('Ta zakładka jest dostępna wyłącznie po zalogowaniu jako właściciel AIO.');return;}
   $('oh-current-owner').textContent=d.user.display_name||'Konto właściciela';$('oh-guard').hidden=true;$('oh-app').hidden=false;drawQuick();render();$('oh-search').addEventListener('input',e=>{query=e.target.value;active='all';render();});$('oh-reset').addEventListener('click',()=>{query='';active='all';$('oh-search').value='';render();$('oh-search').focus();});void loadCounts();
  }catch(e){displayError('Nie udało się potwierdzić sesji. Zaloguj się i spróbuj ponownie.');}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
