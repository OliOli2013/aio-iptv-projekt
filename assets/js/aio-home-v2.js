(function(){
'use strict';

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=e=>e?e.textContent.trim():'';
const short=(v,n=145)=>{v=String(v||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v};
const datePL=v=>{try{return new Date(v).toLocaleDateString('pl-PL')}catch(_){return''}};

const previewCache=new Map();

function absoluteUrl(src,base){
  try{return new URL(src,new URL(base,location.href)).href}catch(_){return''}
}

function firstContentImage(doc,pageUrl){
  const blocked=/(?:^|\/)(?:logo|favicon)(?:[-_.]|$)|linuxsat|avatar|badge/i;
  const selectors=[
    'main img[src]',
    'article img[src]',
    '.module img[src]',
    '.content img[src]',
    '.standalone-main img[src]',
    'body img[src]'
  ];
  const seen=new Set();
  for(const selector of selectors){
    for(const img of $$(selector,doc)){
      const src=img.getAttribute('src')||'';
      if(!src||seen.has(src)||blocked.test(src))continue;
      seen.add(src);
      if(img.closest('header,.site-header,.portal-topbar,footer,.site-footer,nav'))continue;
      const out=absoluteUrl(src,pageUrl);
      if(out)return out;
    }
  }
  const og=$('meta[property="og:image"]',doc)?.getAttribute('content')||'';
  if(og&&!blocked.test(og))return absoluteUrl(og,pageUrl);
  return '';
}

async function previewForPage(href){
  if(!href)return'';
  let page;
  try{page=new URL(href,location.href)}catch(_){return''}
  if(page.origin!==location.origin)return'';
  const key=page.href;
  if(previewCache.has(key))return previewCache.get(key);
  const promise=(async()=>{
    try{
      const r=await fetch(page.href,{cache:'force-cache'});
      if(!r.ok)return'';
      const doc=new DOMParser().parseFromString(await r.text(),'text/html');
      return firstContentImage(doc,page.href);
    }catch(_){return''}
  })();
  previewCache.set(key,promise);
  return promise;
}

async function hydrateDownloadPreviews(items){
  await Promise.all(items.map(async(item,i)=>{
    const holder=$(`[data-aio-preview-index="${i}"]`);
    if(!holder)return;
    const src=await previewForPage(item.href);
    if(!src)return;
    const img=document.createElement('img');
    img.src=src;
    img.alt='';
    img.loading='lazy';
    img.decoding='async';
    img.addEventListener('error',()=>holder.classList.remove('has-image'),{once:true});
    holder.textContent='';
    holder.appendChild(img);
    holder.classList.add('has-image');
  }));
}

async function latestDownloads(){
  const box=$('[data-aio-latest-downloads]');
  if(!box)return;
  try{
    const r=await fetch('downloads.html',{cache:'no-store'});
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');
    const cards=$$('[data-download-card]',doc).slice(0,4);
    if(!cards.length)throw 0;

    const items=cards.map(c=>({
      title:c.dataset.aioTitle||txt($('h3',c)),
      cat:c.dataset.category||'Pobieranie',
      kind:txt($('.file-kind',c))||'PLIK',
      href:c.dataset.aioUrl||$('.download-actions a',c)?.getAttribute('href')||'downloads.html',
      source:short(txt($('.download-source',c)).replace(/^Z działu:\s*/i,''),90)
    }));

    box.innerHTML=items.map((x,i)=>`<a class="aio-v2-file-card" href="${esc(x.href)}">
      <div class="aio-v2-file-card-top"><span class="aio-v2-badge">${esc(x.cat)}</span><span class="aio-v2-file-kind">${esc(x.kind)}</span></div>
      <h3>${esc(short(x.title,95))}</h3>
      <p>${esc(x.source)}</p>
      <footer>Otwórz / pobierz →</footer>
    </a>`).join('');
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

let idx=null;
async function getIndex(){
  if(idx)return idx;
  try{
    const r=await fetch('downloads.html',{cache:'force-cache'});
    const doc=new DOMParser().parseFromString(await r.text(),'text/html');
    idx=$$('[data-download-card]',doc).map(c=>({
      title:c.dataset.aioTitle||txt($('h3',c)),
      search:(c.dataset.search||'')+' '+txt(c),
      cat:c.dataset.category||'Pobieranie',
      href:c.dataset.aioUrl||$('.download-actions a',c)?.getAttribute('href')||'downloads.html'
    }));
  }catch(_){idx=[]}
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
