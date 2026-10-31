/* Multi-Click systems V2: read-only catalogue; source of truth is data/downloads.json.
   No changes to Cloudflare auth, quotas or original download URLs. */
(() => {
  'use strict';
  const grid=document.getElementById('aio-mc-grid');
  const count=document.getElementById('aio-mc-count');
  const search=document.getElementById('aio-mc-search');
  const tabs=document.getElementById('aio-mc-tabs');
  if(!grid||!count||!search||!tabs)return;
  let systems=[],maker='all';
  const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;};
  function safeDownload(raw){
    const s=String(raw||'').trim();
    try{const u=new URL(s,location.origin);
      if(u.protocol!=='https:' && !(u.origin===location.origin && u.pathname.startsWith('/pliki/')))return '';
      return u.href;
    }catch(_){return ''}
  }
  function makerOf(title){const t=String(title||'');
    if(/\bzgemma\b/i.test(t))return 'Zgemma';
    if(/\boctagon\b/i.test(t))return 'Octagon';
    if(/\bustym\b/i.test(t))return 'Ustym';
    return 'Inne';
  }
  function card(item){
    const name=String(item.title||'System Enigma2');
    const who=makerOf(name);
    const article=el('article','aio-mc-card aio-mc-'+who.toLowerCase());
    article.dataset.maker=who;
    const art=el('div','aio-mc-card-visual');art.setAttribute('aria-hidden','true');
    art.append(el('span','aio-mc-card-icon',who==='Zgemma'?'Z':who==='Octagon'?'O':who==='Ustym'?'U':'E2'));
    art.append(el('span','aio-mc-card-chip','Enigma2'));
    article.append(art);
    const body=el('div','aio-mc-card-content');
    body.append(el('span','aio-mc-maker',who+' · '+(item.version||'image')));
    body.append(el('h3','aio-mc-card-title',name));
    body.append(el('p','aio-mc-card-description','Gotowy obraz systemu Multi-Click. Sprawdź model tunera przed instalacją.'));
    const actions=el('div','aio-mc-card-actions');
    const href=safeDownload(item.href);
    if(href){const download=el('a','aio-ia-action','Pobierz system');download.href=href;
      if(!href.startsWith(location.origin)){download.target='_blank';download.rel='noopener noreferrer';}
      actions.append(download);
    }
    const detail=el('a','aio-ia-action secondary','Opis / instalacja');detail.href='systems.html#multi-click';actions.append(detail);
    body.append(actions);article.append(body);
    return article;
  }
  function render(){
    const query=search.value.trim().toLocaleLowerCase('pl');
    const visible=systems.filter(x=> (maker==='all'||makerOf(x.title)===maker)
      &&(!query||String([x.title,x.version,x.sourceTitle].join(' ')).toLocaleLowerCase('pl').includes(query)));
    grid.replaceChildren(...visible.map(card));
    count.textContent=visible.length ? `Znaleziono ${visible.length} ${visible.length===1?'system':'systemów'}.` : 'Nie znaleziono systemu. Sprawdź nazwę modelu.';
    for(const b of tabs.querySelectorAll('button[data-maker]')){const on=b.dataset.maker===maker;b.classList.toggle('is-active',on);b.setAttribute('aria-pressed',String(on));}
  }
  tabs.addEventListener('click',e=>{const b=e.target.closest('button[data-maker]');if(!b)return;maker=b.dataset.maker;render();});
  search.addEventListener('input',render);
  document.getElementById('aio-mc-reset')?.addEventListener('click',()=>{maker='all';search.value='';render();search.focus();});
  (async()=>{try{
    const r=await fetch('data/downloads.json',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const all=await r.json();if(!Array.isArray(all))throw new Error('Niepoprawny katalog');
    systems=all.filter(x=>x&&x.category==='Systemy'&&safeDownload(x.href));
    render();
  }catch(err){count.textContent='Nie udało się wczytać katalogu. Otwórz istniejący dział Systemy Enigma2.';
    const a=el('a','aio-ia-action','Systemy Enigma2');a.href='systems.html#multi-click';grid.append(a);
  }})();
})();
