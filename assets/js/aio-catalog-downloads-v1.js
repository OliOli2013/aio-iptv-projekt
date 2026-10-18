/* AIO Catalog V1: read-only featured releases from the same catalog as homepage/search. */
(() => {
  'use strict';
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = raw => {
    const s=String(raw||'').trim();
    if(!s || /^\/\//.test(s) || /[\\\u0000-\u001f]/.test(s))return '';
    try{const u=new URL(s,location.href);return /^https?:$/.test(u.protocol)?s:'';}catch(_){return '';}
  };
  const dateOf = raw => {
    let m=String(raw||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)||0;
    m=String(raw||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m?(Date.parse(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`)||0):0;
  };
  async function init(){
    const root=document.querySelector('#downloadCatalog');
    if(!root || document.querySelector('#aio-catalog-v1-featured'))return;
    try{
      const res=await fetch('data/aio-catalog-v1.json',{cache:'default',credentials:'same-origin'});
      if(!res.ok) return;
      const catalog=await res.json();
      if(!catalog || !Array.isArray(catalog.files))return;
      const top=catalog.files.map((f,i)=>({...f,order:i,dateValue:dateOf(f.date)}))
        .filter(f=>f.dateValue>0 && f.kind!=='LIVE' && safe(f.href))
        .sort((a,b)=>b.dateValue-a.dateValue || Number(b.origin==='aio_v1')-Number(a.origin==='aio_v1') || a.order-b.order)
        .slice(0,4);
      if(!top.length)return;
      const section=document.createElement('section');
      section.id='aio-catalog-v1-featured';
      section.className='aio-catalog-v1-featured';
      section.setAttribute('aria-label','Nowości z centralnego katalogu AIO');
      section.innerHTML='<div class="aio-catalog-v1-head"><div><small>JEDEN KATALOG WYDAŃ</small><h2>Nowe i zaktualizowane</h2><p>Wybrane pliki i wydania z katalogu AIO. Pełna lista i filtry są poniżej.</p></div><span class="aio-catalog-v1-total">'+Number(catalog.counts?.files||catalog.files.length)+' pozycji</span></div>'+
        '<div class="aio-catalog-v1-items">'+top.map(f=>{
          const name=String(f.sourceTitle||f.title||'Plik AIO').replace(/\s+/g,' ').trim();
          const version=String(f.version||'').trim();
          const title=(version && !name.includes(version))?name+' '+version:name;
          const description=safe(f.sourcePage)||'downloads.html';
          const link=safe(f.href);
          return '<article class="aio-catalog-v1-item"><div class="aio-catalog-v1-item-main"><span>'+esc(f.kind||'PLIK')+' · '+esc(f.date)+'</span><strong>'+esc(title)+'</strong><small>'+esc(f.category||'AIO')+' · '+esc(f.platform||'')+'</small></div><div class="aio-catalog-v1-actions"><a href="'+esc(description)+'">Opis</a><a class="aio-catalog-v1-download" href="'+esc(link)+'"'+(/^https?:\/\//i.test(link)?' target="_blank" rel="noopener noreferrer"':'')+' aria-label="Pobierz: '+esc(title)+'">Pobierz ↗</a></div></article>';
        }).join('')+'</div>';
      // New publications also appear among the EXISTING filterable download cards.
      // Legacy cards stay as they are; no duplicated Multi-Click entries.
      const newFiles=catalog.files.filter(f=>f.origin==='aio_v1' && safe(f.href));
      const already=new Set([...root.querySelectorAll('a[href]')].map(a=>{
        try{return new URL(a.getAttribute('href'),location.href).href;}catch(_){return '';}
      }));
      let added=0;
      for(const file of [...newFiles].reverse()){
        const href=safe(file.href);
        const absolute=new URL(href,location.href).href;
        if(already.has(absolute))continue;
        already.add(absolute);
        const title=String(file.title||file.sourceTitle||'Plik AIO');
        const page=safe(file.sourcePage)||'downloads.html';
        const card=document.createElement('article');
        card.className='download-card aio-catalog-v1-new-card';
        card.setAttribute('data-download-card','');
        card.dataset.aioTitle=title;
        card.dataset.aioUrl=page;
        card.dataset.category=String(file.category||'Inne');
        card.dataset.platform=String(file.platform||'Inne');
        card.dataset.status=String(file.status||'Aktualna');
        card.dataset.license='UNKNOWN'; // license must never be guessed from download access
        card.dataset.search=[file.title,file.sourceTitle,file.category,file.platform,file.version,file.kind].join(' ');
        const isExternal=/^https?:\/\//i.test(href);
        card.innerHTML='<div class="download-card-top"><div class="download-badges"><span class="download-badge">'+esc(file.category||'Wydanie AIO')+'</span><span class="download-badge platform">'+esc(file.platform||'')+'</span><span class="download-badge status-aktualna">Aktualna</span></div><span class="file-kind">'+esc(file.kind||'PLIK')+'</span></div>'+
          '<h3>'+esc(title)+'</h3><p class="download-source">Wydanie z katalogu AIO</p>'+
          '<div class="download-meta"><span><b>Wersja</b>'+esc(file.version||'—')+'</span><span><b>Wydano</b>'+esc(file.date||'—')+'</span><span><b>Rozmiar</b>'+esc(file.size||'—')+'</span></div>'+
          '<div class="download-trust"><span>'+esc(file.official||'Źródło podane przez autora')+'</span>'+
          (file.sha256?'<button class="sha-copy" data-copy="'+esc(file.sha256)+'" type="button" title="Kopiuj sumę SHA-256">SHA-256</button>':'')+'</div>'+
          '<div class="download-actions"><a class="button primary" href="'+esc(href)+'"'+(isExternal?' target="_blank" rel="noopener noreferrer"':'')+'>Pobierz</a><a class="button" href="'+esc(page)+'">Opis / instrukcja</a></div>';
        root.prepend(card);added++;
      }
      // Refresh existing filter/counter implementations after adding new cards.
      // The explicit event keeps future filter implementations independent of the legacy search field.
      root.insertAdjacentElement('beforebegin',section);
      if(added){
        document.querySelector('#downloadSearch')?.dispatchEvent(new Event('input',{bubbles:true}));
        document.dispatchEvent(new CustomEvent('aio:download-catalog-updated',{detail:{added}}));
      }
    }catch(e){console.warn('AIO Catalog V1: katalog opcjonalny niedostępny.',e);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
