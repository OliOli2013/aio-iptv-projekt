/* AIO TunerHub — JEDEN PANEL V5 (2026-11-15).
 * Only presentation. Legacy APIs, decisions, permissions, quota and Owner Desk V3 are untouched.
 * Mounted only after V3 verifies the owner session and V4 builds its view.
 */
(()=>{'use strict';
  if(!/^\/owner-hub\/?$/i.test(location.pathname))return;
  const ROOT=document.documentElement;
  const $=(s,root=document)=>root.querySelector(s);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fold=s=>String(s||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const TOOLS=[
    {id:'inbox',name:'Skrzynka i odwołania',group:'Codzienne sprawy',icon:'✉',tags:'kontakt wiadomości korespondencja odwołanie blokada odpowiedź'},
    {id:'resets',name:'Reset hasła',group:'Codzienne sprawy',icon:'⚿',tags:'kod hasło e-mail odzyskanie prośba'},
    {id:'approvals',name:'Wpłaty i wsparcie',group:'Codzienne sprawy',icon:'♡',tags:'kawa 7d 7 dni darowizna potwierdzenie'},
    {id:'pending',name:'Posty do zatwierdzenia',group:'Codzienne sprawy',icon:'▤',tags:'moderacja wpis akceptacja'},
    {id:'reports',name:'Zgłoszenia naruszeń',group:'Codzienne sprawy',icon:'⚑',tags:'skargi posty użytkownicy'},
    {id:'lists',name:'Listy ZIP do moderacji',group:'Codzienne sprawy',icon:'▦',tags:'kanały bukiety upload lista'},
    {id:'admin-messages',name:'Wiadomości do użytkowników',group:'Codzienne sprawy',icon:'✉',tags:'komunikat ogłoszenie mailing'},
    {id:'users',name:'Wyszukaj użytkownika',group:'Konta i dostępy',icon:'♙',tags:'konto login email adres ban blokada odblokuj usuń profil'},
    {id:'wyszukiwarka-blokad',name:'Wyszukiwarka blokad',group:'Konta i dostępy',icon:'⌕',tags:'zablokowane konto ip v6 historia przyczyny odwołania'},
    {id:'vip',name:'Konta VIP',group:'Konta i dostępy',icon:'★',tags:'30 dni miesiąc nielimitowane'},
    {id:'grants',name:'Dostępy 7 dni',group:'Konta i dostępy',icon:'✓',tags:'grant aktywacja przedłużenie'},
    {id:'sessions',name:'Sesje użytkowników',group:'Konta i dostępy',icon:'◎',tags:'logowanie urządzenie zalogowany'},
    {id:'account-cleanup',name:'Czyszczenie kont',group:'Konta i dostępy',icon:'⌫',tags:'niezweryfikowane email usuwanie'},
    {id:'security-center-v1',name:'Centrum Bezpieczeństwa',group:'Bezpieczeństwo',icon:'⬡',tags:'alarmy incydenty ip konta logi próby ataków'},
    {id:'vpn-guard-v1',name:'VPN / proxy — audyt',group:'Bezpieczeństwo',icon:'⛨',tags:'ipapi anonimizer proxy tor rozpoznawanie vpn rejestracje limity skan'},
    {id:'security-exports-v1',name:'Eksporty bezpieczeństwa CSV / JSON',group:'Bezpieczeństwo',icon:'⇩',tags:'raporty pobierz csv pliki d1 backup dziennik'},
    {id:'multikonta-audyt',name:'Powiązania kont / IP — audyt',group:'Bezpieczeństwo',icon:'◉',tags:'multikonta ipv4 ipv6 historia email /64 wspólne'},
    {id:'multikonta-blokady',name:'Multikonta — blokady V4',group:'Bezpieczeństwo',icon:'⛨',tags:'zderzenia ip uwolnienie strict v4'},
    {id:'ip-policy-v7',name:'Polityka IP V10',group:'Bezpieczeństwo',icon:'⌁',tags:'blokady rejestracji 1 ip konto odmowy'},
    {id:'v6-blocks',name:'Blokady V6',group:'Bezpieczeństwo',icon:'⊘',tags:'odblokuj restrykcje v6'},
    {id:'security-core-v1',name:'Security Core',group:'Bezpieczeństwo',icon:'◇',tags:'ochrona plików pobierania statystyki'},
    {id:'security-journal',name:'Dziennik bezpieczeństwa',group:'Bezpieczeństwo',icon:'≡',tags:'zdarzenia próby logowania ip blokady'},
    {id:'ip',name:'Blokady adresów IP',group:'Bezpieczeństwo',icon:'⛨',tags:'ręczne ip blokada zwolnienie'},
    {id:'owner-security-guide',name:'Mapa zabezpieczeń',group:'Bezpieczeństwo',icon:'☷',tags:'przewodnik pomoc gdzie znaleźć'},
    {id:'published',name:'Opublikowane posty',group:'Treści i pobieranie',icon:'▤',tags:'edycja ukryj publikacja'},
    {id:'comments',name:'Komentarze',group:'Treści i pobieranie',icon:'☷',tags:'moderacja komentarzy'},
    {id:'chat',name:'Czat',group:'Treści i pobieranie',icon:'☏',tags:'społeczność rozmowy'},
    {id:'downloads',name:'Historia pobrań',group:'Treści i pobieranie',icon:'⇩',tags:'pobrane pliki ipk deb limity r2'},
    {id:'post-links',name:'Pliki z postów',group:'Treści i pobieranie',icon:'⤓',tags:'zewnętrzne linki pobieranie limit'},
    {id:'activity',name:'Aktywność AIO Access',group:'Treści i pobieranie',icon:'◉',tags:'uprawnienia pliki'},
    {id:'stats',name:'Statystyki strony',group:'System i narzędzia',icon:'▥',tags:'ruch użytkownicy wejścia odwiedziny'},
    {id:'logs',name:'Dziennik administratora',group:'System i narzędzia',icon:'≡',tags:'operacje historia ręczne decyzje usunięcie'},
    {id:'maintenance',name:'Konserwacja i kopie',group:'System i narzędzia',icon:'⚙',tags:'porządki retencja backup d1 r2'},
    {id:'classic',name:'Panel klasyczny',group:'System i narzędzia',icon:'↗',tags:'stary tradycyjny panel'}
  ];
  const BY_ID=new Map(TOOLS.map(t=>[t.id,t]));
  const CATEGORIES=['Codzienne sprawy','Konta i dostępy','Bezpieczeństwo','Treści i pobieranie','System i narzędzia'];
  const COUNTERS=[['inbox','inbox','Skrzynka','✉'],['resets','resets','Reset haseł','⚿'],['approvals','support','Wpłaty','♡'],['pending','posts','Posty','▤'],['reports','reports','Zgłoszenia','⚑'],['lists','lists','Listy ZIP','▦']];
  const PICKS=['users','wyszukiwarka-blokad','security-center-v1','vpn-guard-v1','security-exports-v1','multikonta-audyt','vip','downloads','admin-messages','security-journal','post-links','logs'];
  function toolButton(id,cls='aop5-link'){
    const t=BY_ID.get(id);if(!t)return '';
    return `<button type="button" data-aop-go="${escape(t.id)}" class="${cls}" title="Otwórz: ${escape(t.name)}"><span aria-hidden="true">${escape(t.icon)}</span><strong>${escape(t.name)}</strong></button>`;
  }
  function currentCounters(root){
    const source=$('#aop4-dashboard')||root;
    const out={};for(const [,key] of COUNTERS){
      out[key]=$(`[data-aop-count="${key}"]`,source)?.textContent
        ||$(`[data-aop-count="${key}"]`,root)?.textContent||'—';
    }return out;
  }
  function markup(count){
    const tasks=COUNTERS.map(([id,key,name,icon])=>`<button type="button" class="aop4-task aop5-case" data-aop-go="${id}"><span class="aop5-case-icon" aria-hidden="true">${icon}</span><span class="aop5-case-name">${name}</span><b class="aop4-count" data-aop-count="${key}">${escape(count[key])}</b></button>`).join('');
    const security=['security-center-v1','wyszukiwarka-blokad','multikonta-blokady','security-journal'].map(id=>`<article class="aop4-feature aop5-sec-feature">${toolButton(id)}</article>`).join('');
    const categories=CATEGORIES.map((name,i)=>`<details class="aop5-category" ${i===0?'open':''}><summary><strong>${escape(name)}</strong><small>${TOOLS.filter(t=>t.group===name).length} funkcji</small><span aria-hidden="true">⌄</span></summary><div class="aop5-category-items">${TOOLS.filter(t=>t.group===name).map(t=>toolButton(t.id)).join('')}</div></details>`).join('');
    return `<div class="aop5-main">
      <section class="aop5-intro"><div><span class="aop5-kicker">AIO TUNERHUB · PANEL WŁAŚCICIELA</span><h1>Co chcesz zrobić?</h1><p>Wszystko w jednym miejscu. Wpisz nazwę czynności albo wybierz skrót.</p></div><div class="aop4-hero-actions"><a class="aop5-account-link" href="/konto.html?widok=konto">Ustawienia mojego konta</a></div></section>
      <div class="aop5-searchbox"><label for="aop5-quick-search">Znajdź funkcję</label><div class="aop5-searchbar"><span aria-hidden="true">⌕</span><input id="aop5-quick-search" type="search" autocomplete="off" placeholder="np. konto Tomek, odwołania, reset hasła, VPN, eksport…"><span class="aop5-key">Ctrl K</span></div><div id="aop5-results" class="aop5-results" hidden aria-live="polite"></div></div>
      <section class="aop4-section aop5-priority" aria-labelledby="aop4-important"><div class="aop4-section-heading"><div><h2 id="aop4-important">Do załatwienia</h2><p>Wskaźniki pokazują tylko sprawy wymagające uwagi.</p></div><span class="aop5-live">● Na bieżąco</span></div><div class="aop4-task-grid aop5-task-grid">${tasks}</div><p class="aop5-hint">„—” oznacza brak aktualnego odczytu, a nie zero spraw.</p></section>
      <section class="aop5-favorites" aria-labelledby="aop5-favorites-title"><div class="aop5-heading"><h2 id="aop5-favorites-title">Najczęściej używane</h2><span>Otwórz jednym kliknięciem</span></div><div class="aop5-favorite-grid">${PICKS.map(x=>toolButton(x)).join('')}</div></section>
      <section class="aop4-section aop5-security" aria-labelledby="aop4-security"><div class="aop4-section-heading"><div><h2 id="aop4-security">Szybka kontrola bezpieczeństwa</h2><p>Podgląd i analiza przed decyzją o blokadzie</p></div></div><div class="aop5-sec-grid">${security}</div></section>
      <section class="aop5-all" aria-labelledby="aop5-all-title"><div class="aop5-heading"><h2 id="aop5-all-title">Wszystkie funkcje — według działów</h2><span>Rozwiń tylko potrzebny dział</span></div>${categories}</section>
      <div class="aop5-foot">Szczegóły kont, blokady i uprawnienia są nadal obsługiwane przez zabezpieczone moduły AIO. <a href="/owner-security-guide">Mapa funkcji</a> · <a href="/konto.html?widok=konto">Zwykły widok konta</a></div>
    </div>`;
  }
  function renderResults(dash,value){
    const target=$('#aop5-results',dash);if(!target)return;
    const query=fold(value.trim());if(!query){target.hidden=true;target.replaceChildren();return;}
    const tokens=query.split(/\s+/).filter(Boolean);
    const match=TOOLS.map(t=>({t,text:fold([t.name,t.group,t.tags].join(' '))}))
      .filter(x=>tokens.every(word=>x.text.includes(word))).slice(0,14);
    const named=value.trim().match(/^(?:konto|użytkownik|uzytkownik|login|email|e-mail)\s+(.+)/i);
    const userQuery=(named?.[1]||(match.length?null:value.trim()))?.slice(0,100);
    const accountAction=userQuery&&userQuery.length>=2
      ? `<button type="button" class="aop5-result aop5-account-result" data-aop5-user-search="${escape(userQuery)}"><span aria-hidden="true">♙</span><strong>Znajdź użytkownika: ${escape(userQuery)}</strong></button>`:'';
    target.innerHTML=accountAction+match.map(({t})=>toolButton(t.id,'aop5-result')).join('') ||
      '<p>Nie znalazłem funkcji. Spróbuj: „blokady”, „odwołania”, „VPN”, „pobierania”.</p>';
    target.hidden=false;
  }
  function mount(){
    if(ROOT.dataset.aopV3!=='ready'||!$('#aop4-nav')||!$('#aop-dashboard'))return false;
    const dash=$('#aop4-dashboard');if(!dash||dash.dataset.aop5==='ready')return Boolean(dash);
    const counts=currentCounters($('#aop-dashboard'));
    dash.innerHTML=markup(counts);dash.dataset.aop5='ready';
    const search=$('#aop5-quick-search',dash);
    search?.addEventListener('input',()=>renderResults(dash,search.value));
    $('#aop5-results',dash)?.addEventListener('click',event=>{
      const button=event.target.closest('[data-aop5-user-search]');
      if(!button)return;
      const form=$('#aop-account-form'),field=$('#aop-account-search');
      if(!form||!field)return;
      field.value=button.dataset.aop5UserSearch;
      form.requestSubmit();
    });
    search?.addEventListener('keydown',event=>{
      if(event.key==='Escape'){search.value='';renderResults(dash,'');}
      if(event.key==='Enter'){
        const first=$('#aop5-results button',dash);
        if(first){event.preventDefault();first.click();}
      }
    });
    return true;
  }
  function oneTimeDefault(){
    try{const key='aio_owner_focus_v5_init';
      if(localStorage.getItem(key)!=='done'){
        localStorage.setItem('aio_owner_layout_v4','simple');
        localStorage.setItem(key,'done');
      }
    }catch(_){/* Private browsing: existing V4 default is already simple. */}
  }
  oneTimeDefault();
  function init(){
    mount();
    const dashboard=$('#aop-dashboard');
    if(dashboard){const obs=new MutationObserver(()=>{mount();});obs.observe(dashboard,{childList:true});}
    else{
      const boot=new MutationObserver(()=>{if(mount()){const d=$('#aop-dashboard');if(d){const obs=new MutationObserver(()=>mount());obs.observe(d,{childList:true});}boot.disconnect();}});
      boot.observe(ROOT,{attributes:true,attributeFilter:['data-aop-v3'],childList:true,subtree:true});
    }
    // Existing V3 Ctrl+K already searches all tools. When dashboard is visible, promote the new input.
    document.addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='k')return;
      if(ROOT.dataset.aopV4!=='simple'||$('#aop-dashboard')?.hidden)return;
      const field=$('#aop5-quick-search');if(!field)return;
      event.preventDefault();event.stopImmediatePropagation();field.focus();field.select();
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
