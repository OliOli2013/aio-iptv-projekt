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
const cards=$$('[data-download-card]');
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
  $('#downloadCatalog')?.scrollIntoView({behavior:'smooth',block:'start'});
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

const params=new URLSearchParams(location.search);
const initialQ=normalize(params.get('q')||'');
if(initialQ){
  freeQuery=initialQ;
  if(mainSearch)mainSearch.value=initialQ;
  updateSearch();
}

setMode('current');
scheduleRefresh();
})();