(() => {
  const KEY_FAV='aio_ux3_favorites';
  const KEY_RECENT='aio_ux3_recent';
  const get=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(e){return[]}};
  const set=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v.slice(0,12)))}catch(e){}};
  const cleanText=s=>(s||'').replace(/\s+/g,' ').trim();
  const addRecent=(item)=>{if(!item||!item.url||item.url.startsWith('#'))return;let a=get(KEY_RECENT).filter(x=>x.url!==item.url);a.unshift(item);set(KEY_RECENT,a);renderPersonal();};
  const toggleFav=(item)=>{let a=get(KEY_FAV);const exists=a.some(x=>x.url===item.url);a=exists?a.filter(x=>x.url!==item.url):[item,...a.filter(x=>x.url!==item.url)];set(KEY_FAV,a);renderPersonal();return !exists;};
  const labelFromLink=a=>cleanText(a.dataset.aioTitle||a.querySelector('strong')?.textContent||a.textContent||a.getAttribute('href'));
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');
    if(!a)return;
    const href=a.getAttribute('href')||'';
    if(/\.html(?:$|[?#])/.test(href) && !/^(?:https?:|mailto:)/.test(href)) addRecent({title:labelFromLink(a),url:href});
  });
  function renderList(el,items,empty){if(!el)return;el.innerHTML='';if(!items.length){el.innerHTML='<p class="portal-empty-state">'+empty+'</p>';return;}items.slice(0,6).forEach(i=>{const a=document.createElement('a');a.href=i.url;a.innerHTML='<span>'+escapeHtml(i.title)+'</span><b>→</b>';el.appendChild(a);});}
  function renderPersonal(){renderList(document.getElementById('aioFavorites'),get(KEY_FAV),'Dodaj gwiazdkę przy projekcie w Centrum pobierania.');renderList(document.getElementById('aioRecent'),get(KEY_RECENT),'Otwierane projekty pojawią się tutaj.');}
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  document.getElementById('aioClearHistory')?.addEventListener('click',()=>{localStorage.removeItem(KEY_RECENT);renderPersonal();});
  renderPersonal();

  // Solution finder from UX2
  const buttons=[...document.querySelectorAll('[data-finder-topic]')];
  const results=[...document.querySelectorAll('[data-finder-result]')];
  if(buttons.length&&results.length){const select=key=>{buttons.forEach(b=>b.classList.toggle('is-active',b.dataset.finderTopic===key));results.forEach(r=>r.classList.toggle('is-active',r.dataset.finderResult===key));};buttons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.finderTopic)));}
  document.querySelectorAll('a[href="#pomoz-mi-znalezc"]').forEach(a=>a.addEventListener('click',e=>{const t=document.getElementById('pomoz-mi-znalezc');if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});}}));

  // Downloads filters + favorites
  const cards=[...document.querySelectorAll('[data-download-card]')];
  if(cards.length){
    const search=document.getElementById('downloadSearch'),cat=document.getElementById('downloadCategory'),status=document.getElementById('downloadStatus'),archive=document.getElementById('downloadArchive'),platform=document.getElementById('downloadPlatform'),license=document.getElementById('downloadLicense'),count=document.getElementById('downloadCount');
    const favs=()=>get(KEY_FAV);
    cards.forEach(card=>{
      const title=card.dataset.aioTitle||cleanText(card.querySelector('h3')?.textContent),url=card.dataset.aioUrl||card.querySelector('.download-source a')?.getAttribute('href')||card.querySelector('.download-actions a[href$=".html"]')?.getAttribute('href');
      if(url){const top=card.querySelector('.download-card-top');if(top&&!top.querySelector('.aio-fav-button')){const btn=document.createElement('button');btn.type='button';btn.className='aio-fav-button';btn.title='Dodaj do Moje AIO';btn.setAttribute('aria-label','Dodaj do ulubionych');const sync=()=>{const on=favs().some(x=>x.url===url);btn.classList.toggle('is-active',on);btn.textContent=on?'★':'☆';};sync();btn.addEventListener('click',()=>{toggleFav({title,url});sync();});top.appendChild(btn);}}
    });
    const apply=()=>{const q=(search?.value||'').toLowerCase().trim(),cv=cat?.value||'',sv=status?.value||'',pv=platform?.value||'',lv=license?.value||'',showArchive=!!archive?.checked;let n=0;cards.forEach(c=>{const text=(c.dataset.search||c.textContent).toLowerCase();const archived=c.dataset.status==='Archiwalna';const okQ=!q||text.includes(q),okC=!cv||c.dataset.category===cv,okP=!pv||c.dataset.platform===pv,okL=!lv||c.dataset.license===lv;let okS=true;if(sv==='ALL')okS=true;else if(sv)okS=c.dataset.status===sv;else okS=!archived;if(!showArchive&&archived&&sv!=='Archiwalna'&&sv!=='ALL')okS=false;const ok=okQ&&okC&&okP&&okL&&okS;c.hidden=!ok;if(ok)n++;});if(count)count.textContent=n;};
    [search,cat,status,archive,platform,license].filter(Boolean).forEach(el=>el.addEventListener(el.tagName==='INPUT'&&el.type==='search'?'input':'change',apply));
    document.getElementById('downloadReset')?.addEventListener('click',()=>{if(search)search.value='';if(cat)cat.value='';if(status)status.value='';if(platform)platform.value='';if(license)license.value='';if(archive)archive.checked=false;apply();});
    document.querySelectorAll('[data-quick-category]').forEach(b=>b.addEventListener('click',()=>{if(cat)cat.value=b.dataset.quickCategory;apply();document.getElementById('downloadCatalog')?.scrollIntoView({behavior:'smooth'});}));
    document.querySelectorAll('[data-quick-license]').forEach(b=>b.addEventListener('click',()=>{if(license)license.value=b.dataset.quickLicense;apply();document.getElementById('downloadCatalog')?.scrollIntoView({behavior:'smooth'});}));
    apply();
  }
})();

/* ===== Home compact/full view — 2026-09-11 ===== */
(function () {
  'use strict';
  if (!document.body.classList.contains('aio-portal-home')) return;
  const main = document.querySelector('#main-content');
  const firstExtra = main && main.querySelector('.portal-onboarding');
  if (!main || !firstExtra || main.querySelector('.home-more-hub')) return;

  const children = Array.from(main.children);
  const start = children.indexOf(firstExtra);
  if (start < 0) return;
  const extras = children.slice(start).filter(el => !el.classList.contains('home-more-hub'));
  if (!extras.length) return;

  const hub = document.createElement('section');
  hub.className = 'home-more-hub portal-panel';
  hub.innerHTML = `
    <div class="home-more-head">
      <div><p class="aio-kicker">PEŁNA ZAWARTOŚĆ AIO-IPTV.PL</p><h2>Więcej z AIO-IPTV.pl</h2><p>Najważniejsze funkcje są już wyżej. Pozostałe sekcje zostały zachowane tutaj, żeby strona startowa była krótsza i czytelniejsza.</p></div>
      <button class="home-more-toggle" type="button" aria-expanded="false"><span>Pokaż pełną stronę</span><b>↓</b></button>
    </div>
    <div class="home-more-summary"><span>${extras.length} dodatkowych sekcji</span><span>projekty • aplikacje • narzędzia • wsparcie</span></div>
    <div class="home-more-content" hidden></div>`;
  main.insertBefore(hub, firstExtra);
  const content = hub.querySelector('.home-more-content');
  extras.forEach(el => content.appendChild(el));

  const button = hub.querySelector('.home-more-toggle');
  const label = button.querySelector('span');
  const arrow = button.querySelector('b');
  const key = 'aio_home_full_view_v21';

  function setExpanded(expanded, persist = true) {
    content.hidden = !expanded;
    hub.classList.toggle('is-expanded', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    label.textContent = expanded ? 'Włącz krótszy widok' : 'Pokaż pełną stronę';
    arrow.textContent = expanded ? '↑' : '↓';
    if (persist) { try { localStorage.setItem(key, expanded ? '1' : '0'); } catch (error) {} }
  }

  let stored = false;
  try { stored = localStorage.getItem(key) === '1'; } catch (error) {}
  const hashTarget = location.hash ? document.querySelector(location.hash) : null;
  const needsHashOpen = Boolean(hashTarget && content.contains(hashTarget));
  setExpanded(stored || needsHashOpen, false);

  button.addEventListener('click', () => setExpanded(button.getAttribute('aria-expanded') !== 'true'));
  window.addEventListener('hashchange', () => {
    const target = location.hash ? document.querySelector(location.hash) : null;
    if (target && content.contains(target)) setExpanded(true, false);
  });
}());
