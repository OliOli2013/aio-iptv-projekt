/* AIO‑IPTV.pl — Layout v4 injector (template-like) */
(function(){
  'use strict';
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  function currentPage(){
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function buildSidebar(){
    const p = currentPage();
    const sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="logo-block">
        <a class="brand" href="index.html" aria-label="AIO‑IPTV.pl">
          <img src="pliki/logo.png" alt="AIO‑IPTV.pl" />
          <div>
            <div class="t1">AIO‑IPTV.pl</div>
            <div class="t2">Enigma2 • IPTV • Tools</div>
          </div>
        </a>
      </div>

      <div class="menu-title"><span class="bar"></span><strong>Menu</strong></div>

      <div class="v4-menu-search" aria-label="Szukaj w menu">
        <input id="v4MenuSearch" type="search" placeholder="Szukaj w menu…" autocomplete="off" />
      </div>

      <nav aria-label="Menu boczne">
        <div class="menu-group">
          <div class="h">Wtyczki</div>
          <a href="plugins.html#wtyczki">Moje wtyczki</a>
          <a href="plugins.html#aio-panel">AIO Panel</a>
          <a href="plugins.html#iptv-dream">IPTV Dream</a>
          <a href="plugins.html#nagrania-on-demand">Nagrania On Demand</a>
          <a href="plugins.html#opencamview">OpenCamView</a>
          <a href="plugins.html#picon-updater">Picon Updater</a>
          <a href="plugins.html#myupdater">MyUpdater</a>
          <a href="plugins.html#simple-iptv-epg">Simple IPTV EPG</a>
          <a href="plugins.html#pliki">Niezbędne dodatki</a>
        </div>

        <div class="menu-group">
          <div class="h">Narzędzia</div>
          <a href="tools.html">Narzędzia</a>
          <a href="one-liner.html">One‑Liner</a>
          <a href="config-builder.html">Konfigurator</a>
          <a href="kreator.html">Kreator</a>
          <a href="porownywarka.html">Porównywarka</a>
          <a href="tuner-compare.html">Tuner Compare</a>
          <a href="error-scan.html">Diagnoza błędów</a>
        </div>

        <div class="menu-group">
          <div class="h">Konfiguracja</div>
          <a href="guides.html">Poradniki</a>
          <a href="poradniki-praktyczne.html">Poradniki Praktyczne</a>
          <a href="systems.html">Systemy</a>
          <a href="multi-click.html">Systemy Multi-Click</a>
          <a href="image-installation.html">Instalacja Image</a>
          <a href="channel-lists.html">Listy kanałów</a>
          <a href="downloads.html">Pobieranie</a>
          <a href="knowledge.html">Wiedza</a>
          <a href="updates.html">Aktualizacje</a>
        </div>

        <div class="menu-group">
          <div class="h">Kontakt</div>
          <a href="contact.html">Kontakt</a>
          <a href="support.html">Wsparcie projektów</a>
          <a href="stats.html">Statystyki</a>
        </div>
      </nav>

      <div class="sidebar-cta">
        <a download href="pliki/enigma2-plugin-extensions-panelaio_12.0.2_all.ipk">Pobierz AIO Panel 12.0.2</a>
        <div class="sub">Uniwersalna paczka (Py2/Py3)</div>

        <div class="v4-cta-row">
          <a class="v4-cta-secondary" download href="pliki/enigma2-plugin-extensions-iptvdream_6.5.1_all.ipk">Pobierz IPTV Dream 6.5.1</a>
        </div>

        <div class="sidebar-support-box">
          <div class="title">Wesprzyj moje projekty</div>
          <p>Jeśli korzystasz z AIO Panel, IPTV Dream albo poradników — dziękuję za każdą formę wsparcia.</p>
          <div class="sidebar-support-links">
            <a class="sidebar-support-link" href="support.html">Wsparcie</a>
            <a class="sidebar-support-link" href="https://buycoffee.to/pawelpawelek" rel="noopener" target="_blank">BuyCoffee</a>
          </div>
        </div>

        <div class="v4-side-news" id="v4SideNews" aria-label="Ostatnie aktualizacje"></div>
      </div>
    `;

    // Active by path
    $$('a[href]', sidebar).forEach(a=>{
      const href=(a.getAttribute('href')||'').split('#')[0].toLowerCase();
      if(href && href===p) a.classList.add('active');
    });
    return sidebar;
  }

  function buildTopnav(){
    const top=document.createElement('header');
    top.id='topnav';
    top.innerHTML=`
      <nav class="v4-topnav" aria-label="Nawigacja górna">
        <a href="index.html">Index</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="plugins.html">Wtyczki</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="tools.html">Narzędzia</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="poradniki-praktyczne.html">Poradniki Praktyczne</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="systems.html">Systemy</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="multi-click.html">Multi-Click</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="updates.html">Aktualizacje</a>
        <span class="sep" aria-hidden="true"></span>
        <a class="support-link" href="support.html">Wsparcie</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="contact.html">Kontakt</a>

        <span class="sep" aria-hidden="true"></span>
        <a class="v4-toplink" href="#" id="v4OpenSearch" title="Szukaj (Ctrl+K)">Szukaj</a>
      </nav>
    `;
    return top;
  }

  function buildBreadcrumb(){
    const el=document.createElement('div');
    el.id='breadcrumb';
    const p=currentPage();
    const map={
      'index.html':'index',
      'plugins.html':'wtyczki',
      'tools.html':'narzędzia',
      'systems.html':'systemy',
      'multi-click.html':'systemy multi-click',
      'guides.html':'poradniki',
      'poradniki-praktyczne.html':'poradniki praktyczne',
      'image-installation.html':'instalacja image',
      'channel-lists.html':'listy kanałów',
      'knowledge.html':'wiedza',
      'one-liner.html':'one-liner',
      'updates.html':'aktualizacje',
      'support.html':'wsparcie',
      'contact.html':'kontakt',
      'stats.html':'statystyki'
    };
    const name=(map[p] || p.replace('.html',''));
    el.innerHTML=`<a href="index.html">index</a> | <span>${name}</span>`;
    return el;
  }

  function removeOld(){
    const oldTop=$('.topbar'); if(oldTop) oldTop.remove();
    const oldDrawer=$('#mobileDrawer'); if(oldDrawer) oldDrawer.remove();
    const oldBackdrop=$('#drawerBackdrop'); if(oldBackdrop) oldBackdrop.remove();
  }

  function wrap(){
    const body=document.body;
    if(body.classList.contains('v4')) return;
    body.classList.add('v4');
    removeOld();

    // Inject v4 enhancements (CSS + JS) globally, without editing every HTML file.
    (function ensureAssets(){
      try{
        const head=document.head;
        if(head && !document.querySelector('link[data-v4-enh]')){
          const l=document.createElement('link');
          l.rel='stylesheet';
          l.href='assets/css/v4-enhancements.css?v=1';
          l.setAttribute('data-v4-enh','1');
          head.appendChild(l);
        }
        if(head && !document.querySelector('script[data-v4-enh]')){
          const s=document.createElement('script');
          s.src='assets/js/v4-enhancements.js?v=1';
          s.defer=true;
          s.setAttribute('data-v4-enh','1');
          head.appendChild(s);
        }
      }catch(_){/* noop */}
    })();

    const main=$('main');
    const content=document.createElement('div');
    content.id='content';
    if(main){ content.appendChild(main); }
    else{
      // move all non-script nodes into content
      Array.from(body.childNodes).forEach(n=>{
        if(n.nodeType===1 && n.tagName==='SCRIPT') return;
        if(n.nodeType===3 && !n.textContent.trim()) return;
        content.appendChild(n);
      });
    }

    const scripts=Array.from(body.querySelectorAll(':scope > script'));
    const page=document.createElement('div'); page.id='page';
    const sidebar=buildSidebar();
    const mainWrap=document.createElement('div'); mainWrap.id='main';
    const inner=document.createElement('div'); inner.id='main-inner';
    inner.appendChild(content);
    mainWrap.appendChild(buildTopnav());
    mainWrap.appendChild(inner);
    mainWrap.appendChild(buildBreadcrumb());
    page.appendChild(sidebar);
    page.appendChild(mainWrap);

    body.innerHTML='';
    body.appendChild(page);
    // Mark active link in top navigation
    try{
      const p=currentPage();
      document.querySelectorAll('#topnav .v4-topnav a[href]').forEach(a=>{
        const href=(a.getAttribute('href')||'').toLowerCase();
        if(href===p) a.classList.add('active');
      });
    }catch(_){/* noop */}
    scripts.forEach(s=>body.appendChild(s));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wrap, {once:true});
  else wrap();
})();
