/* AIO Projects Hub V1 — data/projects.json is canonical; no duplicate content DB. */
import {PROJECT_CATEGORIES, projectCategory, isAioProject, safePage, latestProjectFirst} from './aio-ia-core-v1.mjs';
const root=document.getElementById('aio-projects-grid');
const counter=document.getElementById('aio-projects-count');
const tabs=document.getElementById('aio-projects-tabs');
const search=document.getElementById('aio-projects-search');
const scope=document.getElementById('aio-projects-scope');
if(root && tabs && search && counter){
  let all=[];
  const valid = new Set(PROJECT_CATEGORIES.map(([id])=>id));
  const start=new URLSearchParams(location.search).get('category')||'all';
  let active=valid.has(start)?start:'all';
  const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
  function tabButton(id,label){
    const b=el('button','aio-ia-tab',label);b.type='button';b.dataset.category=id;
    b.setAttribute('aria-pressed',String(id===active));
    b.addEventListener('click',()=>{
      active=id; render();
      const u=new URL(location.href);if(active==='all')u.searchParams.delete('category');else u.searchParams.set('category',active);
      history.replaceState(null,'',u.pathname+u.search+u.hash);
    });return b;
  }
  tabs.replaceChildren(...PROJECT_CATEGORIES.map(([id,label])=>tabButton(id,label)));
  function projectCard(p){
    const card=el('article','aio-ia-project-card');
    card.dataset.type=projectCategory(p.category);
    const type=projectCategory(p.category);
    const visuals={'Wtyczki':['◈','ENIGMA2'],'Skórki':['✦','FHD SKIN'],'Android':['▣','ANDROID'],'Windows':['▦','WINDOWS'],'Listy kanałów':['≋','AIO TEAM']};
    const [mark,tag]=visuals[type]||['◉','AIO'];
    const art=el('div','aio-v2-project-art');art.setAttribute('aria-hidden','true');
    art.append(el('strong','',mark),el('em','',tag));card.append(art);
    const meta=el('div','aio-ia-project-meta');
    meta.append(el('span','aio-ia-pill',projectCategory(p.category)));
    // For ambiguous authorship use catalog label; do not assert sole ownership.
    meta.append(el('span','aio-ia-pill '+(isAioProject(p)?'aio-ia-pill-primary':''),isAioProject(p)?'AIO Team':'W katalogu AIO'));
    card.append(meta);
    const h=el('h2','aio-ia-card-title',p.name||'Projekt');card.append(h);
    const line=el('p','aio-ia-project-version','Wersja: '+(p.version||'—')+' · Aktualizacja: '+(p.updated||'brak daty'));card.append(line);
    card.append(el('p','aio-ia-project-summary',p.summary||'Szczegóły na stronie projektu.'));
    const actions=el('div','aio-ia-actions');
    const page=safePage(p.page);
    if(page){const a=el('a','aio-ia-action','Opis i pliki');a.href=page;actions.append(a);}
    card.append(actions);
    return card;
  }
  function render(){
    for(const b of tabs.querySelectorAll('button')){
      const on=b.dataset.category===active;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));
    }
    const q=search.value.trim().toLocaleLowerCase('pl');
    const scopeMode=scope?.value||'all';
    const results=all.filter(p=>
      (active==='all'||projectCategory(p.category)===active) &&
      (scopeMode!=='aio'||isAioProject(p)) &&
      (!q||[p.name,p.version,p.summary,p.category].join(' ').toLocaleLowerCase('pl').includes(q))
    );
    root.replaceChildren(...results.map(projectCard));
    counter.textContent=results.length?`Wyświetlono ${results.length} projektów.`:'Brak projektów spełniających kryteria.';
  }
  search.addEventListener('input',render);
  scope?.addEventListener('change',render);
  (async()=>{
    try{
      const r=await fetch('data/projects.json',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const data=await r.json();if(!Array.isArray(data))throw new Error('Nieprawidłowy katalog projektów');
      all=data.filter(x=>x&&typeof x==='object'&&safePage(x.page)).sort(latestProjectFirst);
      render();
    }catch(e){counter.textContent='Nie udało się wczytać projektów. Skorzystaj z działów Wtyczki, Android i Windows.';}
  })();
}
