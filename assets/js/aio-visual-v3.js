/* AIO TunerHub Visual V3 — small client-side enhancer for icons and accent labels. */
(()=>{
  const d=document;
  if(d.documentElement.dataset.aioVisualV3==='1') return;
  d.documentElement.dataset.aioVisualV3='1';
  const body=d.body;if(!body) return;
  body.classList.add('aio-visual-v3');

  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const pageMap=[
    [/latest-posts|post\.html/,'posts'],[/downloads/,'downloads'],[/projects-aio/,'projects'],
    [/systems-multiclick|systems/,'systems'],[/guide|help|errors/,'help'],[/community/,'community'],
    [/android/,'android'],[/windows/,'windows']
  ];
  for(const [rx,name] of pageMap){ if(rx.test(path)){ body.classList.add('aio-v3-page-'+name); break; } }

  const ICON_RULES=[
    [/downloads?|pobieranie|pliki/i,'⬇'],[/plugin|wtyczk/i,'🧩'],[/systems|multi-click|image/i,'🛰'],[/channel-lists|listy/i,'📺'],
    [/guide|help|poradnik|baza błędów/i,'📘'],[/community|społeczność|post/i,'💬'],[/android/i,'🤖'],[/windows/i,'🪟'],
    [/skin|skórk/i,'🎨'],[/epg|picon/i,'🗂'],[/security/i,'🛡'],[/camera|cam|opencamview/i,'📷']
  ];
  const accentRules=[
    [/plugin|wtyczk/i,'Wtyczki'],[/systems|multi-click|openatv|vix|pli|ustym|octagon|zgemma/i,'Systemy'],
    [/channel-lists|listy/i,'Listy kanałów'],[/android/i,'Android'],[/windows/i,'Windows'],[/guide|help|poradnik|errors/i,'Poradniki'],[/community|post/i,'Społeczność']
  ];

  function iconFor(text=''){ for(const [rx,ico] of ICON_RULES){ if(rx.test(text)) return ico; } return '✦'; }
  function accentFor(text=''){ for(const [rx,a] of accentRules){ if(rx.test(text)) return a; } return ''; }
  function decorateLink(a){
    if(!a || a.dataset.aioIconized==='1') return;
    const t=((a.getAttribute('href')||'')+' '+(a.textContent||'')).trim();
    const ico=iconFor(t);
    const span=d.createElement('span'); span.className='aio-v3-icon'; span.textContent=ico;
    a.classList.add('aio-v3-has-icon','aio-v3-decor-link');
    a.prepend(span); a.dataset.aioIconized='1';
  }

  [
    '.main-nav > a','.site-nav > a','.nav-more-menu a','.aio-v3-category','.aio-v2-post-topics a',
    '.site-footer a','footer a','.quick-links a','.aio-v2-linklist a','.aio-ia-action','.download-card a','.latest-card a.more'
  ].forEach(sel=>d.querySelectorAll(sel).forEach(decorateLink));

  d.querySelectorAll('h1,h2,h3').forEach(h=>{
    const text=(h.textContent||'').trim().toLowerCase();
    if(!text) return;
    if(/najnowsze|projekty|pliki|poradniki|społeczność|systemy|windows|android|multi-click|tuner/.test(text)) h.classList.add('aio-v3-gradient');
  });

  const cardSelectors=[
    '.latest-card','.download-card','.aio-ia-project-card','.aio-ia-group-card','.aio-mc-card','.guide-card','.system-card','.help-card','.faq-card','.community-card','.aio-v2-help'
  ].join(',');
  d.querySelectorAll(cardSelectors).forEach(card=>{
    const basis=[card.getAttribute('data-category')||'', card.getAttribute('data-type')||'', card.textContent||''].join(' ');
    const accent=accentFor(basis);
    if(accent) card.setAttribute('data-aio-accent', accent);
    if(!card.querySelector('.aio-v3-card-kicker')){
      const kicker=d.createElement('div');
      kicker.className='aio-v3-card-kicker';
      const icon=d.createElement('span'); icon.className='aio-v3-icon'; icon.textContent=iconFor(basis);
      const txt=d.createElement('span'); txt.textContent=accent || 'AIO TunerHub';
      kicker.append(icon,txt);
      const target=card.querySelector('h3,h2,.latest-card-title,.aio-mc-card-title,.aio-ia-card-title') || card.firstElementChild;
      if(target && target.parentNode===card) card.insertBefore(kicker,target);
      else if(target?.parentNode) target.parentNode.insertBefore(kicker,target);
      else card.prepend(kicker);
    }
  });
})();
