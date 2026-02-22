(function(){
  'use strict';

  const qs = (s, el=document)=>el.querySelector(s);
  const qsa = (s, el=document)=>Array.from(el.querySelectorAll(s));

  // Theme
  function applyTheme(theme){
    const root = document.documentElement;
    if(theme === 'light' || theme === 'dark'){
      root.setAttribute('data-theme', theme);
    }else{
      root.removeAttribute('data-theme');
    }
  }
  function initTheme(){
    const saved = localStorage.getItem('aio_theme') || '';
    if(saved) applyTheme(saved);
  }
  function toggleTheme(){
    const current = document.documentElement.getAttribute('data-theme') || '';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('aio_theme', next);
  }

  // Drawer
  function openDrawer(){
    const d = qs('.v2-drawer');
    if(d){ d.classList.add('open'); }
  }
  function closeDrawer(){
    const d = qs('.v2-drawer');
    if(d){ d.classList.remove('open'); }
  }

  // Active link
  function markActiveLinks(){
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    qsa('.v2-nav a').forEach(a=>{
      const href = (a.getAttribute('href')||'').toLowerCase();
      if(href === path) a.classList.add('active');
    });
  }

  // Nav filter
  function initNavSearch(){
    const input = qs('[data-nav-search]');
    if(!input) return;
    const links = qsa('.v2-nav a');
    const labels = qsa('.v2-nav .label');
    input.addEventListener('input', ()=>{
      const q = input.value.trim().toLowerCase();
      links.forEach(a=>{
        const t = (a.textContent||'').toLowerCase();
        a.style.display = (!q || t.includes(q)) ? '' : 'none';
      });
      // Hide empty groups
      qsa('.v2-nav .group').forEach(g=>{
        const visible = qsa('a', g).some(a=>a.style.display !== 'none');
        g.style.display = visible ? '' : 'none';
      });
      labels.forEach(l=>{
        // hide labels if following group hidden
        const parent = l.closest('.group');
        if(parent) l.style.display = parent.style.display === 'none' ? 'none' : '';
      });
    });
  }

  // Copy buttons for code blocks
  function initCopyButtons(){
    qsa('pre').forEach(pre=>{
      if(pre.querySelector('.v2-copy')) return;
      const code = pre.querySelector('code');
      if(!code) return;
      const btn = document.createElement('button');
      btn.className = 'v2-copy';
      btn.type = 'button';
      btn.textContent = 'Kopiuj';
      btn.addEventListener('click', async ()=>{
        try{
          await navigator.clipboard.writeText(code.textContent);
          btn.textContent = 'Skopiowano ✓';
          setTimeout(()=>btn.textContent='Kopiuj', 1200);
        }catch(e){
          btn.textContent = 'Błąd';
          setTimeout(()=>btn.textContent='Kopiuj', 1200);
        }
      });
      pre.appendChild(btn);
    });

    qsa('[data-copy]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const target = el.getAttribute('data-copy');
        const node = target ? qs(target) : null;
        const txt = node ? node.textContent : '';
        try{
          await navigator.clipboard.writeText(txt);
          const old = el.textContent;
          el.textContent = 'Skopiowano ✓';
          setTimeout(()=>el.textContent = old, 1200);
        }catch(_){}
      });
    });
  }

  document.addEventListener('click', (e)=>{
    const t = e.target;
    if(!(t instanceof Element)) return;
    if(t.matches('[data-open-drawer]')) openDrawer();
    if(t.matches('[data-close-drawer]') || t.closest('[data-close-drawer]')) closeDrawer();
    if(t.matches('[data-toggle-theme]')) toggleTheme();
    if(t.matches('.v2-drawer') && t.classList.contains('open')) closeDrawer();
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeDrawer();
  });

  initTheme();
  markActiveLinks();
  initNavSearch();
  initCopyButtons();
})();
