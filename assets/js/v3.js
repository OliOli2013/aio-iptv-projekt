(function(){
  'use strict';

  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  function initSidebarSearch(){
    const navInner = qs('.topbar .nav .nav-inner');
    if(!navInner) return;

    // Avoid duplicate injection
    if(qs('.nav-search', navInner)) return;

    const wrap = document.createElement('div');
    wrap.className = 'nav-search';
    wrap.innerHTML = '<input type="search" id="navSearch" placeholder="Szukaj w menu…" autocomplete="off" />';
    navInner.prepend(wrap);

    const input = qs('#navSearch', wrap);
    const links = qsa('a[href]', navInner).filter(a => !a.closest('.nav-search'));

    const normalize = (s) => String(s||'').toLowerCase().normalize('NFKD');

    input.addEventListener('input', () => {
      const q = normalize(input.value).trim();
      let any = false;
      links.forEach(a => {
        const txt = normalize(a.textContent);
        const ok = !q || txt.includes(q) || normalize(a.getAttribute('href')).includes(q);
        a.style.display = ok ? '' : 'none';
        if(ok) any = true;
      });

      // Hide group titles when all following links are hidden (simple heuristic)
      qsa('.nav-group-title', navInner).forEach(title => {
        const groupLinks = [];
        let n = title.nextElementSibling;
        while(n && !n.classList.contains('nav-group-title') && !n.classList.contains('nav-search')){
          if(n.tagName === 'A') groupLinks.push(n);
          n = n.nextElementSibling;
        }
        const visible = groupLinks.some(a => a.style.display !== 'none');
        title.style.display = visible ? '' : 'none';
      });

      if(!any){
        // no-op; keep quiet
      }
    });
  }

  function markActiveNav(){
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    qsa('.topbar .nav .nav-inner a').forEach(a => {
      const href = (a.getAttribute('href') || '').split('#')[0].toLowerCase();
      if(!href) return;
      if(href === path) a.classList.add('active');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSidebarSearch();
    markActiveNav();
  });
})();
