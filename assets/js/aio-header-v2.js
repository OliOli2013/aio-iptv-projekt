(function(){
  'use strict';
  const d=document;
  const body=d.body;
  if(!body) return;
  body.classList.add('aio-header-v4');

  const header=d.querySelector('.site-header');
  if(!header) return;

  /* Remove the two old rows responsible for the clutter visible in the phone screenshots. */
  d.querySelectorAll('.aio-header-shortcuts,.pro-utility-bar').forEach(el=>el.remove());
  header.querySelectorAll('.fundraiser-ribbon').forEach(el=>el.remove());

  /* Make the same top utility bar available on old subpages too. */
  let topbar=d.querySelector('.portal-topbar');
  if(!topbar){
    topbar=d.createElement('div');
    topbar.className='portal-topbar';
    topbar.innerHTML='<div class="portal-topbar-brand"><span class="portal-live-dot"></span><strong>AIO IPTV PROJECT</strong></div><div class="portal-topbar-links"><a href="news.html">Aktualności</a><a href="community.html">Społeczność</a><a href="support.html">Wsparcie projektu</a></div>';
    header.insertAdjacentElement('beforebegin',topbar);
  }

  /* Replace the plain "Enigma2 • Android • Windows • pomoc" text with useful links. */
  let brandTop=topbar.querySelector('.portal-topbar-brand');
  if(brandTop){
    Array.from(brandTop.childNodes).forEach(n=>{
      if(n.nodeType===3 && String(n.textContent||'').trim()) n.remove();
    });
    brandTop.querySelectorAll(':scope > span:not(.portal-live-dot)').forEach(el=>el.remove());
    if(!brandTop.querySelector('.aio-h4-platforms')){
      const links=d.createElement('span');
      links.className='aio-h4-platforms';
      links.innerHTML='<a href="systems.html">⚙ Enigma2</a><a href="android-apps.html">● Android</a><a href="windows-apps.html">▦ Windows</a><a href="guides.html">? pomoc</a>';
      brandTop.appendChild(links);
    }
  }

  /* Build one consistent primary navigation everywhere. */
  let nav=header.querySelector('.main-nav,.site-nav,.aio-v2-main-nav');
  if(!nav){
    nav=d.createElement('nav');
    nav.className='main-nav';
    nav.setAttribute('aria-label','Główna nawigacja');
    header.appendChild(nav);
  }
  nav.classList.add('main-nav');
  nav.innerHTML=''+
    '<a href="index.html">Start</a>'+
    '<a href="downloads.html">Pobierz</a>'+
    '<a href="systems.html">Systemy</a>'+
    '<a href="plugins.html">Wtyczki</a>'+
    '<a href="channel-lists.html">Listy</a>'+
    '<a href="guides.html">Poradniki</a>'+
    '<a class="nav-community" href="community.html">Społeczność</a>'+
    '<details class="nav-more"><summary>Więcej⌄</summary><div class="nav-more-menu">'+
      '<a href="android-apps.html">Android</a><a href="windows-apps.html">Windows</a><a href="pro.html">Aplikacje PRO</a>'+
      '<a href="errors.html">Baza błędów</a><a href="one-liner.html">One-Liner / FTP</a><a href="start-here.html">Zacznij tutaj</a>'+
      '<a href="compatibility.html">Zgodność</a><a href="updates.html">Historia wydań</a><a href="project-status.html">Status projektów</a>'+
      '<a href="community-chat.html">Czat AIO</a><a href="ai-chat.html">AI Chat</a><a href="report-error.html">Zgłoś błąd</a><a href="contact.html">Kontakt</a>'+
    '</div></details>';

  const row=header.querySelector('.brand-row');
  if(!row) return;

  /* user-premium creates a tested site-search-trigger. Reuse it instead of showing two search buttons. */
  const legacyHomeSearch=row.querySelector('.aio-v2-search-trigger');
  let search=row.querySelector('.site-search-trigger');
  if(search){
    if(legacyHomeSearch && legacyHomeSearch!==search) legacyHomeSearch.remove();
    search.style.marginLeft='';
    search.innerHTML='<span class="aio-h4-search-icon" aria-hidden="true">⌕</span><span class="aio-h4-search-label">Szukaj na AIO-IPTV.pl...</span><kbd>Ctrl K</kbd>';
    search.setAttribute('aria-label','Szukaj na AIO-IPTV.pl');
  }else if(legacyHomeSearch){
    search=legacyHomeSearch;
    search.classList.add('site-search-trigger');
    search.innerHTML='<span class="aio-h4-search-icon" aria-hidden="true">⌕</span><span class="aio-h4-search-label">Szukaj na AIO-IPTV.pl...</span><kbd>Ctrl K</kbd>';
  }

  /* Remove old secondary header buttons; support gets one clean premium CTA. */
  row.querySelectorAll('.header-download,.header-community').forEach(el=>el.remove());
  let support=row.querySelector('.aio-h4-support');
  if(!support){
    support=d.createElement('a');
    support.className='aio-h4-support';
    support.href='support.html';
    support.innerHTML='<span aria-hidden="true">♥</span><span>Wesprzyj projekt</span><b aria-hidden="true">›</b>';
    row.appendChild(support);
  }

  /* Put search between brand and support no matter what order older scripts used. */
  const brand=row.querySelector('.brand');
  if(brand && search) brand.insertAdjacentElement('afterend',search);
  if(search && support) search.insertAdjacentElement('afterend',support);

  /* One mobile menu button. */
  row.querySelectorAll('.aio-header-menu-toggle').forEach((el,i)=>{if(i>0)el.remove()});
  let toggle=row.querySelector('.aio-header-menu-toggle');
  if(!toggle){
    toggle=d.createElement('button');
    toggle.type='button';
    toggle.className='aio-header-menu-toggle';
    toggle.textContent='Menu';
    row.appendChild(toggle);
  }
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-label','Otwórz menu');

  const setMenu=open=>{
    header.classList.toggle('nav-open',open);
    nav.classList.toggle('open',open); /* required because legacy CSS uses .main-nav.open!important */
    toggle.setAttribute('aria-expanded',open?'true':'false');
    toggle.setAttribute('aria-label',open?'Zamknij menu':'Otwórz menu');
  };
  toggle.addEventListener('click',ev=>{
    ev.preventDefault();
    ev.stopPropagation();
    setMenu(!header.classList.contains('nav-open'));
  });

  /* Active section. */
  const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  let section=current;
  if(/^plugin-|^skin-/.test(current)) section='plugins.html';
  else if(/^guide-|^help-/.test(current)) section='guides.html';
  else if(/^app-/.test(current)) section='downloads.html';
  else if(['community-chat.html','post.html','profile.html'].includes(current)) section='community.html';
  nav.querySelectorAll(':scope > a[href]').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('?')[0].toLowerCase();
    a.classList.toggle('is-active',href===section);
  });

  nav.querySelectorAll(':scope > a[href]').forEach(a=>a.addEventListener('click',()=>setMenu(false)));

  const updateScroll=()=>header.classList.toggle('is-scrolled',window.scrollY>8);
  updateScroll();
  window.addEventListener('scroll',updateScroll,{passive:true});

  d.addEventListener('click',ev=>{
    const details=header.querySelector('details.nav-more[open]');
    if(details && !details.contains(ev.target)) details.removeAttribute('open');
    if(window.innerWidth<=760 && header.classList.contains('nav-open') && !header.contains(ev.target)) setMenu(false);
  });
  d.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){
      setMenu(false);
      header.querySelector('details.nav-more[open]')?.removeAttribute('open');
    }
  });
  window.addEventListener('resize',()=>{if(window.innerWidth>760)setMenu(false)});
})();
