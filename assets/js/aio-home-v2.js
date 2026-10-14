(function(){
'use strict';

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=e=>e?e.textContent.trim():'';
const short=(v,n=145)=>{v=String(v||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v};
const datePL=v=>{try{return new Date(v).toLocaleDateString('pl-PL')}catch(_){return''}};

/* AIO UX PERFORMANCE V1: lightweight JSON catalog shared by latest cards & search. */
let downloadCatalogPromise = null;
async function loadDownloadCatalog(){
  if(!downloadCatalogPromise){
    downloadCatalogPromise = fetch('data/downloads.json', {cache:'default'})
      .then(r=>{if(!r.ok)throw new Error('catalog '+r.status);return r.json()})
      .then(rows=>{if(!Array.isArray(rows))throw new Error('invalid download catalog');return rows})
      .catch(err=>{downloadCatalogPromise=null;throw err});
  }
  return downloadCatalogPromise;
}
function catalogDate(value){
  const date=String(value||'').trim();
  let m=date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if(m){
    const n=Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]));
    const d=new Date(n);
    return d.getUTCFullYear()===Number(m[3])&&d.getUTCMonth()===Number(m[2])-1&&d.getUTCDate()===Number(m[1])?n:0;
  }
  m=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){
    const n=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]));
    const d=new Date(n);
    return d.getUTCFullYear()===Number(m[1])&&d.getUTCMonth()===Number(m[2])-1&&d.getUTCDate()===Number(m[3])?n:0;
  }
  return 0; // Unknown dates are not silently treated as new releases.
}
function safeCatalogLink(value){
  const url=String(value||'').trim();
  if(!url || /^\/\//.test(url) || /[\\\u0000-\u001f]/.test(url))return '';
  try{const parsed=new URL(url,location.href);return /^https?:$/.test(parsed.protocol)?url:''}catch(_){return ''}
}
async function latestDownloads(){
  const box=$('[data-aio-latest-downloads]');
  if(!box)return;
  try{
    const rows=await loadDownloadCatalog();
    // Downloads with a verified catalog date, newest first. Never infer missing dates.
    const items=rows.map((x,i)=>({...x,dateValue:catalogDate(x.date),catalogOrder:i}))
      .filter(x=>x.dateValue && x.kind!=='LIVE' && safeCatalogLink(x.href))
      .sort((a,b)=>b.dateValue-a.dateValue||a.catalogOrder-b.catalogOrder)
      .slice(0,4);
    if(!items.length)throw new Error('no dated downloads');
    box.innerHTML=items.map(x=>{
      const title=short(x.title||x.sourceTitle||'Plik AIO',95);
      const detail=safeCatalogLink(x.sourcePage)||'downloads.html';
      const download=safeCatalogLink(x.href);
      const external=/^https?:\/\//i.test(download);
      return `<article class="aio-v2-file-card">
        <div class="aio-v2-file-card-top"><span class="aio-v2-badge">${esc(x.category||'Pobieranie')}</span><span class="aio-v2-file-kind">${esc(x.kind||'PLIK')}</span></div>
        <h3>${esc(title)}</h3>
        <p>Wydanie: ${esc(x.date||'Data nieznana')} · ${esc(x.platform||'AIO')}</p>
        <footer class="aio-v2-file-actions">
          <a href="${esc(detail)}" aria-label="Szczegóły: ${esc(title)}">Szczegóły</a>
          <a href="${esc(download)}" ${external?'target="_blank" rel="noopener noreferrer"':''} aria-label="Pobierz: ${esc(title)}">Pobierz ↗</a>
        </footer>
      </article>`;
    }).join('');
  }catch(_){
    box.innerHTML='<a class="aio-v2-file-card" href="downloads.html"><h3>Centrum pobierania</h3><p>Przejdź do pełnego katalogu plików.</p><footer>Otwórz →</footer></a>';
  }
}

async function latestCommunity(){
  const box=$('[data-aio-community-latest]');
  if(!box)return;
  try{
    const r=await fetch('/api/community?action=feed&mode=latest&pageSize=4&page=0',{cache:'no-store',credentials:'include'});
    const d=await r.json();
    if(!r.ok||!d.ok||!d.rows?.length)throw 0;

    box.innerHTML=d.rows.slice(0,4).map(p=>{
      const type=p.kind==='official'?'AKTUALIZACJA':'SPOŁECZNOŚĆ';
      const image=p.attachments?.[0]?.url||'';
      const preview=image
        ? `<div class="aio-v2-post-preview has-image"><img src="${esc(image)}" alt="" loading="lazy" decoding="async"></div>`
        : `<div class="aio-v2-post-preview"><span>${esc(type)}</span></div>`;
      return `<a class="aio-v2-post" href="post.html?id=${encodeURIComponent(p.id)}">
        ${preview}
        <div class="meta"><span>${esc(type)}</span><time>${esc(datePL(p.published_at||p.created_at))}</time></div>
        <h3>${esc(p.title||'Wpis Społeczności AIO')}</h3>
        <p>${esc(short(p.content,145))}</p>
        <footer>${esc(p.author?.display_name||'AIO')} →</footer>
      </a>`;
    }).join('');
  }catch(_){
    box.innerHTML='<a class="aio-v2-post" href="community.html"><div class="aio-v2-post-preview"><span>SPOŁECZNOŚĆ AIO</span></div><h3>Zobacz najnowsze wpisy</h3><p>Pytania, rozwiązania i aktualizacje Społeczności AIO.</p><footer>Przejdź →</footer></a>';
  }
}

/* Shared JSON catalog for quick search; no extra download of downloads.html. */
let idx=null;
async function getIndex(){
  if(idx)return idx;
  const [downloads, pages]=await Promise.all([
    loadDownloadCatalog().catch(()=>[]),
    fetch('data/search-index.json',{cache:'default'})
      .then(r=>r.ok?r.json():[]).catch(()=>[])
  ]);
  const files=downloads.map(x=>({
    title:String(x.title||''),
    search:[x.title,x.sourceTitle,x.category,x.platform,x.version,x.kind,x.status,x.href].join(' '),
    cat:x.category||'Pobieranie',
    href:safeCatalogLink(x.sourcePage)||safeCatalogLink(x.href)||'downloads.html'
  }));
  const sections=(Array.isArray(pages)?pages:[]).map(x=>({
    title:String(x.title||''),
    search:[x.title,x.desc, ...(Array.isArray(x.tags)?x.tags:[])].join(' '),
    cat:'Poradnik lub strona',
    href:safeCatalogLink(x.url)||'guides.html'
  }));
  const seen=new Set();
  idx=[...files,...sections].filter(x=>{
    const key=x.href+'|'+x.title;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  return idx;
}

async function doSearch(q){
  const terms=q.toLowerCase().split(/\s+/);
  const downloads=(await getIndex()).filter(x=>terms.every(t=>(x.title+' '+x.search).toLowerCase().includes(t))).slice(0,8);
  let posts=[];
  try{
    const r=await fetch('/api/community?action=feed&mode=latest&pageSize=5&page=0&search='+encodeURIComponent(q),{cache:'no-store',credentials:'include'});
    const d=await r.json();
    if(r.ok&&d.ok)posts=d.rows||[];
  }catch(_){}
  return{downloads,posts:posts.slice(0,5)};
}

function render(o){
  const b=$('[data-aio-search-results]'),p=[];
  if(o.downloads.length){
    p.push('<div class="aio-v2-result-group-title">Pliki i działy</div>');
    o.downloads.forEach(x=>p.push(`<a class="aio-v2-result" href="${esc(x.href)}"><div><strong>${esc(short(x.title,110))}</strong><small>${esc(x.cat)}</small></div><span>→</span></a>`));
  }
  if(o.posts.length){
    p.push('<div class="aio-v2-result-group-title">Społeczność AIO</div>');
    o.posts.forEach(x=>p.push(`<a class="aio-v2-result" href="post.html?id=${encodeURIComponent(x.id)}"><div><strong>${esc(x.title||'Wpis')}</strong><small>${esc(short(x.content,90))}</small></div><span>→</span></a>`));
  }
  b.innerHTML=p.length?p.join(''):'<div class="aio-v2-empty">Brak wyników. Spróbuj innej nazwy.</div>';
}

function searchInit(){
  const m=$('[data-aio-search-modal]'),i=$('[data-aio-search-input]'),h=$('[data-aio-search-hints]');
  if(!m||!i)return;
  const open=()=>{m.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>i.focus(),30)};
  const close=()=>{m.hidden=true;document.body.style.overflow=''};
  $$('[data-aio-search-open]').forEach(x=>x.onclick=open);
  $$('[data-aio-search-close]',m).forEach(x=>x.onclick=close);
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}
    if(e.key==='Escape'&&!m.hidden)close();
  });
  let t;
  i.oninput=()=>{
    clearTimeout(t);
    const q=i.value.trim();
    if(q.length<2){$('[data-aio-search-results]').innerHTML='';h.hidden=false;return}
    h.hidden=true;
    $('[data-aio-search-results]').innerHTML='<div class="aio-v2-empty">Szukam…</div>';
    t=setTimeout(async()=>render(await doSearch(q)),180);
  };
}

function init(){
  latestDownloads();
  latestCommunity();
  searchInit();
  const y=$('#year');if(y)y.textContent=new Date().getFullYear();
  const b=$('[data-copy-command]');
  if(b)b.onclick=async()=>{
    const c=txt($('.aio-v2-command code'));
    try{await navigator.clipboard.writeText(c);b.textContent='Skopiowano ✓';setTimeout(()=>b.textContent='Kopiuj',1600)}catch(_){}
  };
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
