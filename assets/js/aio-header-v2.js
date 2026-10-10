(function(){
  'use strict';

  const d=document;
  const body=d.body;
  if(!body) return;

  body.classList.add('aio-header-v3');

  const header=d.querySelector('.site-header');
  const topbar=d.querySelector('.portal-topbar');
  if(!header) return;

  /* Remove the experimental V2 shortcut row. It duplicated information on phones. */
  d.querySelectorAll('.aio-header-shortcuts').forEach(el=>el.remove());

  /* Detect a second legacy quick-link strip if an older script generated one. */
  const scope=d.querySelector('.page-shell') || body;
  Array.from(scope.children).forEach(el=>{
    if(el===header || el===topbar || el.matches('main,footer')) return;
    const hrefs=Array.from(el.querySelectorAll?.('a[href]')||[]).map(a=>a.getAttribute('href')||'');
    if(hrefs.includes('downloads.html') && hrefs.includes('compatibility.html') && hrefs.includes('report-error.html')){
      el.classList.add('aio-header-legacy-quickbar');
    }
  });

  const nav=header.querySelector('.main-nav, .site-nav, .aio-v2-main-nav');
  if(!nav) return;

  /* Make the existing search trigger look like a real premium search control. */
  const search=header.querySelector('.aio-v2-search-trigger[data-aio-search-open]');
  if(search && !search.querySelector('.aio-header-search-icon')){
    search.innerHTML=
      '<span class="aio-header-search-icon" aria-hidden="true">⌕</span>'+
      '<span class="aio-header-search-label">Szukaj na AIO-IPTV.pl</span>'+
      '<kbd class="aio-header-search-key">Ctrl K</kbd>';
    search.setAttribute('aria-label','Szukaj na AIO-IPTV.pl');
  }

  /* Premium mobile menu. Existing page-specific mobile toggle is hidden by CSS. */
  let toggle=header.querySelector('.aio-header-menu-toggle');
  if(!toggle){
    const row=header.querySelector('.brand-row') || header;
    toggle=d.createElement('button');
    toggle.type='button';
    toggle.className='aio-header-menu-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Otwórz menu');
    toggle.textContent='Menu';
    row.appendChild(toggle);
  }

  const setMenu=open=>{
    header.classList.toggle('nav-open',open);
    toggle.setAttribute('aria-expanded',open?'true':'false');
    toggle.setAttribute('aria-label',open?'Zamknij menu':'Otwórz menu');
  };

  toggle.addEventListener('click',()=>setMenu(!header.classList.contains('nav-open')));

  nav.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click',()=>setMenu(false));
  });

  /* Keep the correct main section highlighted on subpages too. */
  const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  let section=current;
  if(/^plugin-|^skin-/.test(current)) section='plugins.html';
  else if(/^guide-|^help-/.test(current)) section='guides.html';
  else if(/^app-/.test(current)) section='downloads.html';
  else if(current==='community-chat.html' || current==='post.html') section='community.html';

  nav.querySelectorAll(':scope > a[href]').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('?')[0].toLowerCase();
    if(href===section){
      nav.querySelectorAll(':scope > a').forEach(x=>x.classList.remove('is-active'));
      a.classList.add('is-active');
    }
  });

  const updateScroll=()=>header.classList.toggle('is-scrolled',window.scrollY>8);
  updateScroll();
  window.addEventListener('scroll',updateScroll,{passive:true});

  const mq=window.matchMedia('(max-width:760px)');
  const syncViewport=()=>{
    if(!mq.matches) setMenu(false);
  };
  if(mq.addEventListener) mq.addEventListener('change',syncViewport);
  else if(mq.addListener) mq.addListener(syncViewport);

  d.addEventListener('click',ev=>{
    const openMore=header.querySelector('details.nav-more[open]');
    if(openMore && !openMore.contains(ev.target)) openMore.removeAttribute('open');

    if(mq.matches && header.classList.contains('nav-open') && !header.contains(ev.target)){
      setMenu(false);
    }
  });

  d.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){
      setMenu(false);
      header.querySelector('details.nav-more[open]')?.removeAttribute('open');
    }
  });
})();
