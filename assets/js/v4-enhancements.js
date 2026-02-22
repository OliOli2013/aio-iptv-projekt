/* AIO‑IPTV.pl — v4 enhancements (search, updates widget, copy buttons, back-to-top) */
(function(){
  'use strict';

  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  function normalize(s){
    return String(s||'').toLowerCase().normalize('NFKD');
  }

  async function safeFetchJSON(url){
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error(String(res.status));
      return await res.json();
    }catch(_){
      return null;
    }
  }

  // -------------------------
  // Sidebar menu filter
  // -------------------------
  function initSidebarFilter(){
    const input = qs('#v4MenuSearch');
    const sidebar = qs('#sidebar');
    if(!input || !sidebar) return;
    const links = qsa('nav a[href]', sidebar);
    const groups = qsa('.menu-group', sidebar);

    input.addEventListener('input', () => {
      const q = normalize(input.value).trim();
      links.forEach(a => {
        const txt = normalize(a.textContent);
        const href = normalize(a.getAttribute('href'));
        const ok = !q || txt.includes(q) || href.includes(q);
        a.style.display = ok ? '' : 'none';
      });

      // Hide group boxes when empty
      groups.forEach(g => {
        const any = qsa('a[href]', g).some(a => a.style.display !== 'none');
        g.style.display = any ? '' : 'none';
      });
    });
  }

  // -------------------------
  // Updates widget in sidebar
  // -------------------------
  async function initSideNews(){
    const box = qs('#v4SideNews');
    if(!box) return;
    const data = await safeFetchJSON('data/updates.json');
    if(!Array.isArray(data) || !data.length){
      box.innerHTML = '';
      return;
    }
    const items = data
      .slice()
      .sort((a,b)=> (Number(b.ts)||0) - (Number(a.ts)||0))
      .slice(0,3);
    box.innerHTML = `
      <div class="h">Nowości</div>
      ${items.map((it, idx)=>{
        const date = String(it.date||'');
        const title = String(it.title||'');
        const anchor = '#u' + (Number(it.ts)||idx);
        return `
          <a href="updates.html${anchor}">
            ${escapeHtml(title)}
            <span class="meta">${escapeHtml(date)}</span>
          </a>
        `;
      }).join('')}
      <a href="updates.html" style="margin-top:6px; font-weight:700;">Zobacz wszystkie →</a>
    `;
  }

  function escapeHtml(s){
    return String(s||'')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  // -------------------------
  // Global search (Ctrl+K / /)
  // -------------------------
  function ensureSearchModal(){
    if(qs('#v4SearchModal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'v4SearchOverlay';
    overlay.setAttribute('data-close','1');

    const modal = document.createElement('div');
    modal.id = 'v4SearchModal';
    modal.innerHTML = `
      <div class="head">
        <strong>Wyszukiwarka</strong>
        <input id="v4SearchInput" type="search" placeholder="Szukaj na stronie… (np. AIO Panel, tuner, one-liner)" autocomplete="off" />
        <button class="close" id="v4SearchClose" type="button">✕</button>
      </div>
      <div class="body" id="v4SearchBody"></div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const close = () => {
      overlay.classList.remove('open');
      modal.classList.remove('open');
    };
    overlay.addEventListener('click', close);
    qs('#v4SearchClose', modal).addEventListener('click', close);
  }

  async function loadSearchIndex(){
    // Allow custom index file if exists; else fallback to menu-derived index.
    const idx = await safeFetchJSON('data/search-index.json');
    if(Array.isArray(idx) && idx.length) return idx;

    // Fallback: derive from sidebar links.
    const sidebar = qs('#sidebar');
    const links = sidebar ? qsa('nav a[href]', sidebar) : [];
    return links.map(a => ({
      title: (a.textContent||'').trim(),
      desc: '',
      url: a.getAttribute('href') || '#',
      tags: []
    }));
  }

  async function initGlobalSearch(){
    ensureSearchModal();
    const overlay = qs('#v4SearchOverlay');
    const modal = qs('#v4SearchModal');
    const input = qs('#v4SearchInput');
    const body = qs('#v4SearchBody');
    if(!overlay || !modal || !input || !body) return;

    const index = await loadSearchIndex();

    const open = () => {
      overlay.classList.add('open');
      modal.classList.add('open');
      input.value = '';
      render('');
      setTimeout(()=>input.focus(), 10);
    };
    const close = () => {
      overlay.classList.remove('open');
      modal.classList.remove('open');
    };

    function render(q){
      const qq = normalize(q).trim();
      const hits = index.filter(it => {
        const hay = normalize([it.title,it.desc,(it.tags||[]).join(' '),it.url].join(' '));
        return !qq || hay.includes(qq);
      }).slice(0, 20);

      body.innerHTML = hits.length ? hits.map(it => {
        const tags = Array.isArray(it.tags) ? it.tags : [];
        return `
          <a class="v4-search-item" href="${escapeHtml(it.url||'#')}">
            <div class="t">${escapeHtml(it.title||'')}</div>
            ${it.desc ? `<div class="d">${escapeHtml(it.desc)}</div>` : `<div class="d">Przejdź do sekcji.</div>`}
            ${tags.length ? `<div class="tags">${tags.slice(0,6).map(t=>`<span class="v4-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </a>
        `;
      }).join('') : `
        <div style="font-family:Arial,Helvetica,sans-serif; color:rgba(255,255,255,.8); padding:10px 2px;">
          Brak wyników. Spróbuj innej frazy.
        </div>
      `;
    }

    input.addEventListener('input', ()=> render(input.value));
    document.addEventListener('keydown', (e)=>{
      const k = e.key;
      if((e.ctrlKey || e.metaKey) && k.toLowerCase()==='k'){
        e.preventDefault();
        open();
      }
      if(!e.ctrlKey && !e.metaKey && k === '/'){
        // Avoid interfering with typing
        const t = (e.target && (e.target.tagName||'')).toLowerCase();
        if(t==='input' || t==='textarea' || (e.target && e.target.isContentEditable)) return;
        e.preventDefault();
        open();
      }
      if(k==='Escape') close();
    });

    // Topnav link
    const topLink = qs('#v4OpenSearch');
    if(topLink){
      topLink.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
    }
  }

  // -------------------------
  // Back-to-top
  // -------------------------
  function initBackToTop(){
    if(qs('#v4BackToTop')) return;
    const btn = document.createElement('button');
    btn.id = 'v4BackToTop';
    btn.type = 'button';
    btn.textContent = '▲ Góra';
    btn.addEventListener('click', ()=>{
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);

    const onScroll = () => {
      if(window.scrollY > 520) btn.classList.add('show');
      else btn.classList.remove('show');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // -------------------------
  // Copy buttons for code/pre blocks
  // -------------------------
  function initCopyButtons(){
    // Wrap pre blocks once
    qsa('pre').forEach((pre) => {
      if(pre.closest('.v4-copy-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'v4-copy-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v4-copy-btn';
      btn.textContent = 'Kopiuj';
      btn.addEventListener('click', async ()=>{
        const text = pre.innerText || pre.textContent || '';
        try{
          await navigator.clipboard.writeText(String(text).trim());
          const prev = btn.textContent;
          btn.textContent = '✅';
          setTimeout(()=>btn.textContent = prev, 1200);
        }catch(_){
          // silent
        }
      });
      wrap.appendChild(btn);
    });
  }

  // -------------------------
  // Boot
  // -------------------------
  function boot(){
    initSidebarFilter();
    initSideNews();
    initGlobalSearch();
    initBackToTop();
    initCopyButtons();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
