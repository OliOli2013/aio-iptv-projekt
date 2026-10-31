/* AIO Downloads Grouped V1 — PRESENTATION ONLY. The ORIGINAL file anchors stay
   in #downloadCatalog, so Cloudflare /pliki/ and AIO Access enforcement are unchanged. */
import {downloadIdentity, safePage} from './aio-ia-core-v1.mjs';
const catalog=document.getElementById('downloadCatalog');
const container=document.getElementById('aio-grouped-downloads');
const grid=document.getElementById('aio-grouped-grid');
const count=document.getElementById('aio-grouped-count');
const current=document.getElementById('aio-grouped-current');
const groupButton=document.getElementById('aio-view-groups');
const filesButton=document.getElementById('aio-view-files');
const resetButton=document.getElementById('aio-group-reset');
if(catalog&&container&&grid&&count&&current&&groupButton&&filesButton){
  let grouping=true,selected=null,projectNames=new Map(),timer=null;
  const el=(tag,cls,label)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=String(label);return e;};
  const allCards=()=>[...catalog.querySelectorAll('[data-download-card]')];
  function record(card){
    const category=card.dataset.category||'Inne';
    const page=safePage(card.dataset.aioUrl||'');
    const title=card.dataset.aioTitle||card.querySelector('h3')?.textContent?.trim()||'Plik';
    const identity=downloadIdentity({category,title,page});
    const label=(category==='Systemy'||category==='Dodatki'||!page) ? title :
      (projectNames.get(page.split('#')[0]) || card.querySelector('.download-source a')?.textContent?.trim() || title);
    const type=card.querySelector('.file-kind')?.textContent?.trim()||'PLIK';
    return {card,category,page,title,label,identity,type};
  }
  function build(){
    // Respect legacy filters. No new permission checks are made in this UI.
    const visible=allCards().filter(x=>!x.hidden && !x.classList.contains('dv2-latest-hidden'));
    const groups=new Map();
    for(const card of visible){
      const item=record(card);
      let g=groups.get(item.identity);
      if(!g){g={...item,items:[],types:new Set()};groups.set(item.identity,g);}
      g.items.push(item);g.types.add(item.type);
    }
    return [...groups.values()];
  }
  function display(){
    const results=build();
    grid.replaceChildren();
    for(const group of results){
      const article=el('article','aio-ia-group-card');
      article.dataset.category=group.category;
      const label=el('div','aio-ia-group-category',group.category);article.append(label);
      article.append(el('h3','aio-ia-card-title',group.label));
      article.append(el('p','aio-ia-group-types',[...group.types].join(' · ')+' · '+group.items.length+' '+(group.items.length===1?'pozycja':'pozycje')));
      const row=el('div','aio-ia-actions');
      const choose=el('button','aio-ia-action','Zobacz warianty i pobierz');choose.type='button';
      choose.addEventListener('click',()=>{
        selected=group.identity;setMode(false);catalog.scrollIntoView({behavior:'smooth',block:'start'});
      });row.append(choose);
      if(group.page){const a=el('a','aio-ia-action secondary','Opis projektu');a.href=group.page;row.append(a);}
      article.append(row);grid.append(article);
    }
    count.textContent=results.length?`${results.length} grup · ${results.reduce((n,g)=>n+g.items.length,0)} pozycji`:'Nie znaleziono plików. Zmień filtry lub wyszukiwaną frazę.';
    if(selected && !results.some(g=>g.identity===selected))selected=null;
    updateVisibility();
  }
  function updateVisibility(){
    const body=document.body;
    body.classList.toggle('aio-ia-grouped-view',grouping);
    body.classList.toggle('aio-ia-files-view',!grouping);
    groupButton.setAttribute('aria-pressed',String(grouping));
    filesButton.setAttribute('aria-pressed',String(!grouping));
    for(const card of allCards())card.classList.toggle('aio-ia-other-group',Boolean(selected && record(card).identity!==selected));
    current.hidden=!selected || grouping;
    if(selected&&!grouping){current.textContent='Wybrana grupa plików. Użyj „Wszystkie pliki”, aby wrócić do pełnej listy.';}
    if(resetButton)resetButton.hidden=!selected || grouping;
  }
  function setMode(isGrouped){
    grouping=isGrouped;
    if(grouping)selected=null;
    updateVisibility();
    if(grouping)display();
  }
  function queue(){clearTimeout(timer);timer=setTimeout(display,40);}
  groupButton.addEventListener('click',()=>setMode(true));
  filesButton.addEventListener('click',()=>{selected=null;setMode(false)});
  resetButton?.addEventListener('click',()=>{selected=null;setMode(false)});
  // Existing filtering scripts write the hidden attribute; observe it without touching it.
  const mo=new MutationObserver(records=>{if(records.some(x=>x.type==='childList'||(x.type==='attributes'&&x.attributeName==='hidden')))queue();});
  mo.observe(catalog,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  for(const id of ['downloadV2Search','downloadSearch','downloadCategory','downloadStatus','downloadPlatform','downloadLicense','downloadArchive']){
    const node=document.getElementById(id);
    if(node)for(const ev of ['input','change'])node.addEventListener(ev,()=>{selected=null;queue();});
  }
  document.addEventListener('aio:download-catalog-updated',queue);
  (async()=>{try{
    const r=await fetch('data/projects.json',{cache:'no-store'});
    if(r.ok){const data=await r.json();if(Array.isArray(data))for(const p of data){const page=safePage(p.page).split('#')[0];if(page&&p.name)projectNames.set(page,p.name);}}
  }catch(_){}finally{display();}})();
  display();
}
