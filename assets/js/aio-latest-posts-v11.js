/* AIO TunerHub — Najnowsze Posty V1.1. Existing Community API; no new data store. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const list = $('latest-grid'), feedback = $('latest-feedback'), more = $('latest-more');
  const form = $('latest-search-form'), input = $('latest-search-input');
  if (!list || !feedback || !more || !form || !input) return;
  const buttons = [...document.querySelectorAll('[data-latest-mode]')];
  let mode = 'recent', search = '', page = 0, busy = false, hasMore = true, serial = 0, controller = null;
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = String(text);
    return n;
  };
  const safeDate = raw => {
    const ms = Date.parse(raw || '');
    return Number.isFinite(ms) ? new Date(ms).toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'}) : 'Data niedostępna';
  };
  const safeImage = raw => {
    if (typeof raw !== 'string' || !raw || raw.length > 2048) return '';
    try {
      const u = new URL(raw, location.origin);
      return (u.protocol === 'https:' || (u.protocol === 'http:' && u.origin === location.origin)) ? u.href : '';
    } catch (_) { return ''; }
  };
  function card(p) {
    const article = el('article','latest-card');
    const teaser = p.teaser === true;
    const official = p.kind === 'official';
    const id = String(p.id || '');
    const href = 'post.html?id=' + encodeURIComponent(id);
    const img = safeImage(p.attachments?.[0]?.url);
    if (img) {
      const thumb = el('a','latest-thumb'); thumb.href = href;
      const photo = document.createElement('img'); photo.src = img; photo.alt = 'Grafika wpisu';
      photo.loading = 'lazy'; photo.decoding = 'async'; thumb.append(photo); article.append(thumb);
    } else {
      const fallback = el('a','latest-thumb latest-thumb-fallback',official?'AIO':'POST');
      fallback.href = href; fallback.setAttribute('aria-label','Otwórz '+String(p.title||'wpis')); article.append(fallback);
    }
    const wrap = el('div','latest-card-main');
    const badge = el('span','latest-badge '+(official?'official':'community'),official?'✓ OFICJALNY':'◉ SPOŁECZNOŚĆ');
    wrap.append(badge);
    wrap.append(el('time','latest-time',safeDate(p.published_at||p.created_at)));
    const h = el('h2','latest-title'); const link = el('a','',p.title||'Post Społeczności AIO'); link.href=href;h.append(link);wrap.append(h);
    if (teaser) {
      wrap.append(el('p','latest-excerpt','🔒 Zapowiedź wpisu. Pełna treść i komentarze są dostępne po zalogowaniu.'));
    } else {
      const preview=String(p.content||'').replace(/\s+/g,' ').trim();
      wrap.append(el('p','latest-excerpt',preview.length>190?preview.slice(0,190)+'…':preview));
      if (p.author?.display_name) wrap.append(el('span','latest-author','Autor: '+p.author.display_name));
    }
    const bottom = el('a','latest-open',teaser?'Zobacz zapowiedź →':'Czytaj cały wpis →');bottom.href=href;wrap.append(bottom);
    article.append(wrap);return article;
  }
  function setFilter() {
    buttons.forEach(button => {
      const active = button.dataset.latestMode === mode;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  async function load(reset) {
    if (!reset && (busy || !hasMore)) return;
    if (reset) {
      serial++;
      controller?.abort();
      list.replaceChildren(); page = 0; hasMore = true;
    }
    const seq=serial, requestedPage=page;
    const ac = new AbortController(); controller=ac; busy=true; more.hidden=true;
    feedback.textContent='Wczytuję '+(reset?'najnowsze':'kolejne')+' posty…';
    try {
      const params = new URLSearchParams({action:'feed',mode,page:String(requestedPage),pageSize:'12'});
      if (search) params.set('search',search);
      const response = await fetch('/api/community?'+params,{credentials:'include',cache:'no-store',signal:ac.signal,headers:{accept:'application/json'}});
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error||'Nie udało się odczytać publikacji.');
      if (ac.signal.aborted || serial !== seq) return;
      const rows=Array.isArray(data.rows)?data.rows:[];
      const fragment=document.createDocumentFragment(); rows.forEach(p=>fragment.append(card(p)));list.append(fragment);
      hasMore=Boolean(data.hasMore) && rows.length>0;
      if (hasMore) page=requestedPage+1;
      more.hidden=!hasMore;
      feedback.textContent=list.children.length?`Wyświetlono ${list.children.length} wpisów${hasMore?' • dostępne kolejne':''}.`:'Nie znaleziono opublikowanych postów spełniających kryteria.';
    } catch (err) {
      if(ac.signal.aborted || serial!==seq)return;
      feedback.textContent='Nie udało się pobrać postów. '+String(err.message||'Spróbuj ponownie.');
      // Preserve the current page number; the user can retry without losing earlier cards.
      more.hidden=false;more.textContent='Ponów pobieranie';
    } finally {
      if(serial===seq){busy=false; if(controller===ac)controller=null; if(more.hidden)more.textContent='Pokaż kolejne posty ↓';}
    }
  }
  buttons.forEach(b=>b.addEventListener('click',()=>{if(b.dataset.latestMode===mode)return;mode=b.dataset.latestMode;setFilter();void load(true);}));
  form.addEventListener('submit',e=>{e.preventDefault();search=input.value.trim().slice(0,80);void load(true);});
  input.addEventListener('search',()=>{if(!input.value){search='';void load(true);}});
  more.addEventListener('click',()=>void load(false));
  // Keep list in sync if login changes; the API decides what may be returned.
  document.addEventListener('aio-community-auth',()=>void load(true));
  setFilter();void load(true);
})();
