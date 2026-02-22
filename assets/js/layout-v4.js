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

      <nav aria-label="Menu boczne">
        <div class="menu-group">
          <div class="h">Wtyczki</div>
          <a href="plugins.html#wtyczki">Moje wtyczki</a>
          <a href="plugins.html#aio-panel">AIO Panel</a>
          <a href="plugins.html#iptv-dream">IPTV Dream</a>
          <a href="plugins.html#nagrania-on-demand">Nagrania On Demand</a>
          <a href="plugins.html#opencamview">OpenCamView</a>
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
          <a href="systems.html">Systemy</a>
          <a href="image-installation.html">Instalacja Image</a>
          <a href="channel-lists.html">Listy kanałów</a>
          <a href="downloads.html">Pobieranie</a>
          <a href="knowledge.html">Wiedza</a>
        </div>

        <div class="menu-group">
          <div class="h">Kontakt</div>
          <a href="contact.html">Kontakt</a>
          <a href="support.html">Wsparcie</a>
          <a href="stats.html">Statystyki</a>
        </div>
      </nav>

      <div class="sidebar-cta">
        <a download href="pliki/enigma2-plugin-extensions-panelaio_9.1.1_all.ipk">Pobierz AIO Panel 9.1.1</a>
        <div class="sub">Uniwersalna paczka (Py2/Py3)</div>
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
      <nav class="nav" aria-label="Nawigacja górna">
        <a href="index.html">Index</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="plugins.html">Wtyczki</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="tools.html">Oferta</a>
        <span class="sep" aria-hidden="true"></span>
        <a href="contact.html">Kontakt</a>
      </nav>
    `;
    return top;
  }

  function buildBreadcrumb(){
    const el=document.createElement('div');
    el.id='breadcrumb';
    const p=currentPage();
    const name=(p==='index.html')?'index':p.replace('.html','');
    el.textContent=`index | ${name}`;
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
    scripts.forEach(s=>body.appendChild(s));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wrap, {once:true});
  else wrap();
})();
