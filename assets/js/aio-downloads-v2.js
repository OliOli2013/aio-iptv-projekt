(function(){
'use strict';

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const mainSearch=$('#downloadV2Search');
const oldSearch=$('#downloadSearch');
const category=$('#downloadCategory');
const status=$('#downloadStatus');
const archive=$('#downloadArchive');
const platform=$('#downloadPlatform');
const license=$('#downloadLicense');
let cards=$$('[data-download-card]');
const count=$('#downloadV2Count');
const empty=$('#downloadV2Empty');
const advanced=$('#downloadV2Advanced');
const reset=$('#downloadV2Reset');

if(!cards.length)return;

let freeQuery='';
let tuner='';
let imageSystem='';
let mode='current';

function normalize(v){
  return String(v||'').trim().replace(/\s+/g,' ');
}
function composeSearch(){
  return [freeQuery,tuner,imageSystem].filter(Boolean).join(' ');
}
function dispatch(el,type){
  if(!el)return;
  el.dispatchEvent(new Event(type||'change',{bubbles:true}));
}
function updateSearch(){
  if(oldSearch){
    oldSearch.value=composeSearch();
    dispatch(oldSearch,'input');
  }
  scheduleRefresh();
}
function setCategory(value){
  if(category){
    category.value=value||'';
    dispatch(category,'change');
  }
  scheduleRefresh();
}
function setMode(next){
  mode=next;
  if(status&&archive){
    if(next==='archive'){
      status.value='Archiwalna';
      archive.checked=true;
    }else if(next==='all'){
      status.value='ALL';
      archive.checked=true;
    }else{
      status.value='';
      archive.checked=false;
    }
    dispatch(status,'change');
    dispatch(archive,'change');
  }
  $$('[data-dv2-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.dv2Mode===mode));
  scheduleRefresh();
}
function refresh(){
  cards=$$('[data-download-card]');
  cards.forEach(c=>c.classList.remove('dv2-latest-hidden'));

  let visible=cards.filter(c=>!c.hidden);

  if(mode==='latest'){
    visible.slice(12).forEach(c=>c.classList.add('dv2-latest-hidden'));
    visible=visible.slice(0,12);
  }

  if(count)count.textContent=String(visible.length);
  if(empty)empty.classList.toggle('is-visible',visible.length===0);

  $$('[data-dv2-tuner]').forEach(b=>b.classList.toggle('is-active',b.dataset.dv2Tuner===tuner));
  $$('[data-dv2-system]').forEach(b=>b.classList.toggle('is-active',b.dataset.dv2System===imageSystem));
}
let timer;
function scheduleRefresh(){
  clearTimeout(timer);
  timer=setTimeout(refresh,0);
}

mainSearch?.addEventListener('input',()=>{
  freeQuery=normalize(mainSearch.value);
  updateSearch();
});

reset?.addEventListener('click',()=>{
  freeQuery='';tuner='';imageSystem='';mode='current';
  if(mainSearch)mainSearch.value='';
  if(oldSearch)oldSearch.value='';
  if(category)category.value='';
  if(platform)platform.value='';
  if(license)license.value='';
  if(status)status.value='';
  if(archive)archive.checked=false;
  [oldSearch,category,platform,license,status,archive].filter(Boolean).forEach(el=>
    dispatch(el,el===oldSearch?'input':'change')
  );
  $$('[data-dv2-category]').forEach(b=>b.classList.remove('is-active'));
  setMode('current');
  scheduleRefresh();
});

$$('[data-dv2-category]').forEach(b=>b.addEventListener('click',()=>{
  const value=b.dataset.dv2Category||'';
  const active=b.classList.contains('is-active');
  $$('[data-dv2-category]').forEach(x=>x.classList.remove('is-active'));
  b.classList.toggle('is-active',!active);
  setCategory(active?'':value);
  const destination=document.body.classList.contains('aio-ia-grouped-view')?$('#aio-grouped-downloads'):$('#downloadCatalog');
  destination?.scrollIntoView({behavior:'smooth',block:'start'});
}));

$$('[data-dv2-tuner]').forEach(b=>b.addEventListener('click',()=>{
  tuner=tuner===b.dataset.dv2Tuner?'':b.dataset.dv2Tuner;
  updateSearch();
}));

$$('[data-dv2-system]').forEach(b=>b.addEventListener('click',()=>{
  imageSystem=imageSystem===b.dataset.dv2System?'':b.dataset.dv2System;
  updateSearch();
}));

$$('[data-dv2-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.dv2Mode)));

advanced?.addEventListener('click',()=>{
  const open=document.body.classList.toggle('show-download-controls');
  advanced.setAttribute('aria-expanded',String(open));
  advanced.textContent=open?'Ukryj filtry':'Więcej filtrów';
});

[oldSearch,category,status,archive,platform,license].filter(Boolean).forEach(el=>{
  el.addEventListener(el===oldSearch?'input':'change',scheduleRefresh);
});
// AIO AUDIT FIX V1: new catalog cards already use dynamic selectors in refresh().
document.addEventListener('aio:download-catalog-updated',scheduleRefresh);

const params=new URLSearchParams(location.search);
const initialQ=normalize(params.get('q')||'');
if(initialQ){
  freeQuery=initialQ;
  if(mainSearch)mainSearch.value=initialQ;
  updateSearch();
}
// Linkable deep categories from the homepage, e.g. ?category=Windows.
const categoryFromUrl=params.get('category')||'';
if(categoryFromUrl && category && [...category.options].some(o=>o.value===categoryFromUrl)){
  setCategory(categoryFromUrl);
  $$('[data-dv2-category]').forEach(b=>b.classList.toggle('is-active',b.dataset.dv2Category===categoryFromUrl));
}
// The old hero counter was static. Refresh from actual visible catalogue cards.
const total=document.getElementById('aio-dynamic-catalog-total');
if(total){
  const updateTotal=()=>{total.textContent=String($$('[data-download-card]').length);};
  updateTotal();document.addEventListener('aio:download-catalog-updated',updateTotal);
}
setMode('current');
scheduleRefresh();
})();

/* AIO TunerHub Downloads UX V3 — read-only source badges + active filter hints.
 * No download routing, session, quota, or permissions handling.
 */
(()=>{'use strict';
  if(!document.body.classList.contains('aio-downloads-v2') || window.__aioDownloadsUXV3)return;
  window.__aioDownloadsUXV3=true;
  const q=(s,root=document)=>root.querySelector(s);
  const qa=(s,root=document)=>[...root.querySelectorAll(s)];
  const root=q('#downloadCatalog');
  if(!root)return;
  const active=q('#downloadV3Selection');
  const text=(s)=>String(s||'').trim();
  const pagePath=(url)=>{try{const u=new URL(url,location.href);if(u.origin!==location.origin)return '';return u.pathname.replace(/^\//,'').split('/').pop().toLowerCase();}catch(_){return '';}};
  const isMultiClick=(card)=>qa('.download-actions a[href]',card).some(a=>{
    try{return new URL(a.href,location.href).hostname.toLowerCase()==='multi-click.pl';}catch(_){return false;}
  });
  let aioPages=new Set();
  function addBadge(card){
    if(card.querySelector('.download-v3-provenance'))return;
    const external=isMultiClick(card);
    const page=pagePath(card.dataset.aioUrl||card.querySelector('.download-source a')?.getAttribute('href'));
    const isAio=Boolean(page&&aioPages.has(page));
    if(!external&&!isAio)return;
    const top=q('.download-card-top',card);if(!top)return;
    const item=document.createElement('div');item.className='download-v3-provenance';
    const span=document.createElement('span');span.className=external?'external':'aio';
    span.textContent=external?'System zewnętrzny · Multi-Click':'Autorski projekt AIO Team';
    item.append(span);top.insertAdjacentElement('afterend',item);
  }
  function decorate(){qa('[data-download-card]',root).forEach(addBadge);}
  let queued=false;
  function queueDecorate(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate();});}
  const watch=new MutationObserver(records=>{
    // Only direct additions to the catalogue, never a full subtree observer.
    if(records.some(x=>x.addedNodes.length))queueDecorate();
  });
  watch.observe(root,{childList:true});
  decorate();
  fetch('data/projects.json',{credentials:'same-origin',cache:'default'}).then(r=>r.ok?r.json():[])
    .then(items=>{if(!Array.isArray(items))return;aioPages=new Set(items.map(x=>pagePath(x.page)).filter(Boolean));decorate();})
    .catch(()=>{});

  function updateState(){
    qa('[data-dv2-category]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.classList.contains('is-active'))));
    qa('[data-dv2-tuner],[data-dv2-system]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.classList.contains('is-active'))));
    qa('[data-dv2-mode]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.classList.contains('is-active'))));
    if(!active)return;
    const tags=[];
    const phrase=text(q('#downloadV2Search')?.value);
    if(phrase)tags.push('Szukasz: '+phrase.slice(0,70));
    const selectedCategory=q('[data-dv2-category].is-active');
    const legacyCategory=text(q('#downloadCategory')?.value);
    if(selectedCategory)tags.push('Kategoria: '+selectedCategory.dataset.dv2Category);
    else if(legacyCategory)tags.push('Kategoria: '+legacyCategory);
    const tuner=q('[data-dv2-tuner].is-active');if(tuner)tags.push('Tuner: '+tuner.dataset.dv2Tuner);
    const system=q('[data-dv2-system].is-active');if(system)tags.push('System: '+system.dataset.dv2System);
    const state=q('[data-dv2-mode].is-active');if(state&&state.dataset.dv2Mode!=='current')tags.push('Widok: '+state.textContent.trim());
    for(const [selector,label] of [['#downloadPlatform','Platforma'],['#downloadLicense','Licencja'],['#downloadStatus','Status']]){
      const v=text(q(selector)?.value);if(v&&v!=='ALL')tags.push(label+': '+v);
    }
    active.replaceChildren();active.hidden=!tags.length;
    if(!tags.length)return;
    for(const s of tags){const badge=document.createElement('span');badge.textContent=s;active.append(badge);}
    const button=document.createElement('button');button.type='button';button.textContent='Wyczyść filtry';
    button.addEventListener('click',()=>q('#downloadV2Reset')?.click());active.append(button);
  }
  let task=0;
  function schedule(){cancelAnimationFrame(task);task=requestAnimationFrame(updateState);}
  document.addEventListener('input',ev=>{if(ev.target?.matches('#downloadV2Search,#downloadSearch'))schedule();});
  document.addEventListener('change',ev=>{if(ev.target?.matches('#downloadCategory,#downloadStatus,#downloadArchive,#downloadPlatform,#downloadLicense'))schedule();});
  document.addEventListener('click',ev=>{if(ev.target?.closest('[data-dv2-category],[data-dv2-tuner],[data-dv2-system],[data-dv2-mode],#downloadV2Reset,#downloadReset'))schedule();});
  document.addEventListener('aio:download-catalog-updated',()=>{queueDecorate();schedule();});
  // Existing search is delegated to old filter input. Do not register a second filter implementation.
  updateState();
})();
