/* AIO TunerHub — Owner Layout V4 / Etap 2.
 * Additive, client-side view switch over the existing Owner Desk V3.
 * Does not issue new network calls, alter permissions, or modify security logic.
 * V3 performs owner verification before building the workspace.
 */
(()=>{'use strict';
  const ROOT=document.documentElement;
  const SELECTOR='aop4-dashboard';
  const PREFERENCE='aio_owner_layout_v4';
  const counters=['support','posts','inbox','reports','resets','lists'];
  let ready=false;
  let dashboardObserver=null;
  const $=s=>document.querySelector(s);
  function safePreference(){
    try{return localStorage.getItem(PREFERENCE)==='advanced'?'advanced':'simple';}
    catch(_){return 'simple';}
  }
  function selectView(mode){
    const name=mode==='advanced'?'advanced':'simple';
    ROOT.dataset.aopV4=name;
    try{localStorage.setItem(PREFERENCE,name);}catch(_){}
    document.querySelectorAll('[data-aop4-mode]').forEach(button=>{
      const next=name==='simple'?'advanced':'simple';
      button.dataset.aop4Mode=next;
      button.textContent=name==='simple'?'Pełne menu i dawny pulpit':'Widok uproszczony';
      button.setAttribute('aria-label',name==='simple'?'Przełącz na pełny układ Centrum właściciela':'Przełącz na uproszczony układ Centrum właściciela');
    });
  }
  const tile=(id,title,desc,icon)=>`<button type="button" data-aop-go="${id}" class="aop4-tile"><span class="aop4-tile-icon" aria-hidden="true">${icon}</span><span class="aop4-tile-copy"><strong>${title}</strong><small>${desc}</small></span><span class="aop4-arrow" aria-hidden="true">↗</span></button>`;
  const task=(id,key,title,desc,icon)=>`<button type="button" data-aop-go="${id}" class="aop4-task"><span class="aop4-task-icon" aria-hidden="true">${icon}</span><span class="aop4-task-copy"><strong>${title}</strong><small>${desc}</small></span><b class="aop4-count" data-aop-count="${key}" aria-label="Liczba spraw">—</b></button>`;
  const navItem=(id,title,icon)=>`<button type="button" data-aop-go="${id}" class="aop4-nav-item"><span aria-hidden="true">${icon}</span>${title}</button>`;
  const navGroup=(name,inner,open=false)=>`<details class="aop4-nav-group" ${open?'open':''}><summary>${name}<span aria-hidden="true">⌄</span></summary><div>${inner}</div></details>`;
  function makeNavigation(){
    const old=$('#aop-nav');
    if(!old||$('#aop4-nav'))return;
    const nav=document.createElement('nav');
    nav.className='aop4-nav';nav.id='aop4-nav';nav.setAttribute('aria-label','Uproszczone menu Centrum właściciela');
    nav.innerHTML=`
      ${navItem('dashboard','Pulpit właściciela','⌂')}
      ${navGroup('Na co dzień',[
        navItem('approvals','Wsparcie i wpłaty','♡'),
        navItem('pending','Posty do zatwierdzenia','▤'),
        navItem('inbox','Skrzynka AIO','✉'),
        navItem('resets','Reset haseł','⚿'),
        navItem('reports','Zgłoszenia naruszeń','⚑'),
        navItem('lists','Listy ZIP','▦')
      ].join(''),true)}
      ${navGroup('Bezpieczeństwo',[
        navItem('security-center-v1','Centrum Bezpieczeństwa','⬡'),
        navItem('wyszukiwarka-blokad','Wyszukiwarka blokad','⌕'),
        navItem('multikonta-blokady','Kolizje kont / IP','⛨'),
        navItem('multikonta-audyt','Audyt IP','◉'),
        navItem('security-journal','Dziennik zdarzeń','≡'),
        navItem('owner-security-guide','Mapa zabezpieczeń','☷')
      ].join(''))}
      ${navGroup('Konta i dostęp',[
        navItem('users','Użytkownicy','♙'),
        navItem('vip','Konta VIP','★'),
        navItem('grants','Dostępy 7 dni','✓'),
        navItem('sessions','Sesje','◎')
      ].join(''))}
      ${navGroup('Treści i pliki',[
        navItem('published','Opublikowane posty','▤'),
        navItem('comments','Komentarze','☷'),
        navItem('chat','Czat','☏'),
        navItem('downloads','Historia pobrań','⇩'),
        navItem('post-links','Pliki z postów','⤓')
      ].join(''))}
      ${navGroup('Narzędzia techniczne',[
        navItem('stats','Statystyki','▥'),
        navItem('maintenance','Konserwacja','⚙'),
        navItem('logs','Dziennik administratora','≡'),
        navItem('classic','Panel klasyczny','↗')
      ].join(''))}
      <a class="aop4-guide" href="/owner-security-guide">Mapa funkcji i zabezpieczeń <span aria-hidden="true">↗</span></a>
      <button type="button" class="aop4-nav-switch" data-aop4-mode="advanced">Pełne menu i dawny pulpit</button>`;
    old.before(nav);
  }
  function makeDashboard(){
    const dash=$('#aop-dashboard');
    if(!dash||dash.querySelector('#'+SELECTOR))return;
    // V3 refreshes the dashboard with innerHTML; keep a single V4 instance.
    const values={};
    for(const key of counters) values[key]=dash.querySelector(`[data-aop-count="${key}"]`)?.textContent||'—';
    const el=document.createElement('div');
    el.id=SELECTOR;el.className='aop4-dashboard';
    el.innerHTML=`
      <section class="aop4-hero" aria-label="Uproszczone Centrum właściciela">
        <div class="aop4-hero-copy">
          <span class="aop4-eyebrow">AIO TUNERHUB · CENTRUM WŁAŚCICIELA</span>
          <h1>Najważniejsze sprawy. Jeden pulpit.</h1>
          <p>Najpierw zgłoszenia wymagające uwagi, dalej konta i bezpieczeństwo. Zaawansowane narzędzia nadal pozostają dostępne.</p>
        </div>
        <div class="aop4-hero-actions">
          <a href="/owner-security-guide" class="aop4-primary-link">Mapa zabezpieczeń ↗</a>
          <button type="button" data-aop4-mode="advanced" class="aop4-secondary-button">Pełne menu i dawny pulpit</button>
        </div>
      </section>
      <section class="aop4-section" aria-labelledby="aop4-important">
        <div class="aop4-section-heading"><div><span class="aop4-eyebrow">01 · SPRAWY BIEŻĄCE</span><h2 id="aop4-important">Co wymaga Twojej uwagi?</h2></div><small>Liczniki pobierane z istniejących modułów</small></div>
        <div class="aop4-task-grid">
        ${task('approvals','support','Wsparcie i wpłaty','Nowe prośby o zatwierdzenie','♡')}
        ${task('pending','posts','Posty do moderacji','Wpisy czekające na publikację','▤')}
        ${task('inbox','inbox','Skrzynka AIO','Nowe wiadomości użytkowników','✉')}
        ${task('resets','resets','Resetowanie haseł','Sprawy wymagające administratora','⚿')}
        ${task('reports','reports','Zgłoszenia naruszeń','Sprawy do przeanalizowania','⚑')}
        ${task('lists','lists','Listy kanałów ZIP','Zgłoszenia i aktualizacje','▦')}
        </div>
        <p class="aop4-footnote">„—” oznacza brak aktualnego odczytu, nie zero. Liczba zgłoszeń nie oznacza potwierdzonej wpłaty ani awarii.</p>
      </section>
      <section class="aop4-section" aria-labelledby="aop4-security">
        <div class="aop4-section-heading"><div><span class="aop4-eyebrow">02 · BEZPIECZEŃSTWO</span><h2 id="aop4-security">Gdzie sprawdzić problem?</h2></div></div>
        <div class="aop4-feature-grid">
          <article class="aop4-feature aop4-feature-lead"><span class="aop4-feature-kicker">Zacznij tutaj</span><h3>Centrum Bezpieczeństwa</h3><p>Jeden zbiorczy obraz zdarzeń i ograniczeń. Do analizy przed podjęciem decyzji.</p>${tile('security-center-v1','Otwórz centrum','Zobacz dane zbiorcze','⬡')}</article>
          <article class="aop4-feature"><span class="aop4-feature-kicker">Użytkownik ma problem z kontem</span><h3>Blokady kont</h3><p>Znajdź konto, sprawdź aktywne oraz wcześniejsze ograniczenia.</p>${tile('wyszukiwarka-blokad','Wyszukaj blokadę','Nazwa, e-mail lub ID','⌕')}</article>
          <article class="aop4-feature"><span class="aop4-feature-kicker">Podejrzenie powiązanych kont</span><h3>Multikonta i IP</h3><p>Sprawdź kolizje oraz wyniki audytu IPv4/IPv6.</p>${tile('multikonta-blokady','Kolizje kont','Wstrzymania i odwołania','⛨')}</article>
          <article class="aop4-feature"><span class="aop4-feature-kicker">Chcesz poznać przebieg zdarzeń</span><h3>Dziennik bezpieczeństwa</h3><p>Historia operacji, decyzji i wykrytych zdarzeń.</p>${tile('security-journal','Otwórz dziennik','Weryfikacja przed zmianą','≡')}</article>
        </div>
        <p class="aop4-footnote">Wersje V4, V6, V7 i inne pozostają osobnymi mechanizmami. Ten widok ich nie łączy i niczego nie odblokowuje.</p>
      </section>
      <section class="aop4-section" aria-labelledby="aop4-manage">
        <div class="aop4-section-heading"><div><span class="aop4-eyebrow">03 · ZARZĄDZANIE</span><h2 id="aop4-manage">Najczęściej używane narzędzia</h2></div></div>
        <div class="aop4-tool-grid">
        ${tile('users','Konta użytkowników','Znajdź konto i jego stan','♙')}
        ${tile('vip','Dostępy VIP','Przydziały i przedłużenia','★')}
        ${tile('downloads','Pobieranie plików','Historia i raporty','⇩')}
        ${tile('stats','Statystyki strony','Wizyty i aktywność','▥')}
        ${tile('maintenance','Konserwacja','Retencja, kontrola, backup','⚙')}
        ${tile('owner-security-guide','Mapa zabezpieczeń','Co do czego służy','☷')}
        </div>
      </section>
      <section class="aop4-bottom"><div><h2>Potrzebujesz pozostałych funkcji?</h2><p>W dowolnym momencie wróć do wszystkich dotychczasowych zakładek — bez utraty danych i bez zmian konfiguracji.</p></div><button type="button" data-aop4-mode="advanced">Pełne menu i dawny pulpit</button></section>
    `;
    dash.prepend(el);
    for(const key of counters){el.querySelectorAll(`[data-aop-count="${key}"]`).forEach(node=>node.textContent=values[key]);}
    // Mirror active navigation state without changing V3 navigation or its handlers.
    el.querySelectorAll('[data-aop-go]').forEach(node=>node.setAttribute('title','Otwórz moduł Centrum właściciela'));
    // New view must never become visible until V3 established the owner session.
    if(ROOT.dataset.aopV4!=='simple'&&ROOT.dataset.aopV4!=='advanced')selectView(safePreference());
  }
  function addSwitch(){
    if($('#aop4-switch'))return;
    const bar=$('#aop-v3 .aop-utility');if(!bar)return;
    const button=document.createElement('button');button.id='aop4-switch';button.className='aop4-switch';button.type='button';button.dataset.aop4Mode='advanced';
    bar.append(button);
  }
  function start(){
    if(ready||ROOT.dataset.aopV3!=='ready'||!$('#aop-v3')||!$('#aop-nav')||!$('#aop-dashboard'))return false;
    ready=true;makeNavigation();addSwitch();makeDashboard();selectView(safePreference());
    const dash=$('#aop-dashboard');
    dashboardObserver=new MutationObserver(()=>{if(!dash.querySelector('#'+SELECTOR))makeDashboard();});
    dashboardObserver.observe(dash,{childList:true});
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-aop4-mode]');
      if(!button)return;
      event.preventDefault();
      selectView(button.dataset.aop4Mode);
    });
    return true;
  }
  if(!start()){
    const observer=new MutationObserver(()=>{if(start())observer.disconnect();});
    observer.observe(ROOT,{attributes:true,attributeFilter:['data-aop-v3'],subtree:false});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(start())observer.disconnect();},{once:true});
    setTimeout(()=>observer.disconnect(),15000);
  }
})();
