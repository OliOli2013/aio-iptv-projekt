(function(){
  const d=document;
  const body=d.body;
  if(!body) return;
  body.classList.add('aio-header-v2');

  const topbar=d.querySelector('.portal-topbar');
  const header=d.querySelector('.site-header');
  const nav=d.querySelector('.main-nav, .site-nav, .aio-v2-main-nav');
  if(!header || !nav) return;

  const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();

  if(topbar && !d.querySelector('.aio-header-shortcuts')){
    const shortcuts=[
      ['downloads.html','↓','Centrum pobierania'],
      ['compatibility.html','✓','Sprawdź zgodność'],
      ['report-error.html','⚠','Zgłoś błąd'],
      ['news.html','🔥','Nowości'],
      ['one-liner.html','⚡','One-Liner'],
      ['ai-chat.html','🤖','AI Chat']
    ];
    const row=d.createElement('div');
    row.className='aio-header-shortcuts';
    row.innerHTML='<span class="aio-header-shortcuts-label">Skróty</span>';
    shortcuts.forEach(([href,icon,label])=>{
      const a=d.createElement('a');
      a.className='aio-header-shortcut'+(current===href.toLowerCase()?' is-active':'');
      a.href=href;
      a.innerHTML='<span>'+icon+'</span><span>'+label+'</span>';
      row.appendChild(a);
    });
    topbar.insertAdjacentElement('afterend', row);
  }

  if(!header.querySelector('.aio-header-menu-toggle')){
    const row=header.querySelector('.brand-row') || header.firstElementChild || header;
    const btn=d.createElement('button');
    btn.type='button';
    btn.className='aio-header-menu-toggle';
    btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-label','Otwórz menu');
    btn.textContent='Menu';
    btn.addEventListener('click',()=>{
      const open=header.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded',open?'true':'false');
    });
    row.appendChild(btn);
  }

  const updateScroll=()=> header.classList.toggle('is-scrolled', window.scrollY > 8);
  updateScroll();
  window.addEventListener('scroll', updateScroll, {passive:true});
  window.addEventListener('resize',()=>{
    if(window.innerWidth > 920) header.classList.remove('nav-open');
  });

  d.addEventListener('click',(ev)=>{
    const openMore=header.querySelector('details.nav-more[open]');
    if(openMore && !openMore.contains(ev.target)) openMore.removeAttribute('open');
  });
})();
