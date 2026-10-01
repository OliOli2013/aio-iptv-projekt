(function(){
  'use strict';
  const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  const header=$('[data-nx-header]');
  const menuBtn=$('[data-nx-menu]'), nav=$('[data-nx-nav]');
  const syncHeader=()=>header&&header.classList.toggle('is-scrolled',window.scrollY>8);
  syncHeader(); window.addEventListener('scroll',syncHeader,{passive:true});
  if(menuBtn&&nav){menuBtn.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menuBtn.setAttribute('aria-expanded',String(open));});$$('a',nav).forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('is-open');menuBtn.setAttribute('aria-expanded','false');}));}

  const year=$('#year'); if(year)year.textContent=new Date().getFullYear();

  const fmtDate=iso=>{if(!iso)return'';const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:iso;};
  const initials=name=>String(name||'AIO').split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase();

  async function loadUpdates(){
    const root=$('[data-nx-updates]'); if(!root)return;
    try{
      const r=await fetch('data/updates.json',{cache:'no-store'}); if(!r.ok)throw new Error('updates');
      const data=await r.json();
      root.innerHTML=(Array.isArray(data)?data:[]).slice(0,3).map(item=>`<a class="nx-update-card" href="${esc(item.url||'updates.html')}"><span class="nx-update-meta"><b>${esc(item.type==='release'?'wydanie':item.type||'aktualizacja')}</b><time>${esc(fmtDate(item.date))}</time></span><h3>${esc(item.title)}</h3><p>${esc(item.desc||'')}</p><span>Czytaj więcej →</span></a>`).join('')||'<a class="nx-update-card" href="updates.html"><h3>Historia aktualizacji</h3><p>Sprawdź najnowsze informacje o projektach AIO.</p><span>Otwórz →</span></a>';
    }catch(e){root.innerHTML='<a class="nx-update-card" href="updates.html"><span class="nx-update-meta"><b>aktualizacje</b></span><h3>Sprawdź historię wydań</h3><p>Nie udało się pobrać listy na stronie głównej. Pełna historia nadal jest dostępna.</p><span>Otwórz →</span></a>';}
  }

  async function loadProjects(){
    const root=$('[data-nx-projects]'); if(!root)return;
    try{
      const r=await fetch('data/projects.json',{cache:'no-store'}); if(!r.ok)throw new Error('projects');
      const data=await r.json();
      const active=(Array.isArray(data)?data:[]).filter(p=>p.status==='active').slice(0,8);
      root.innerHTML=active.map(p=>`<a class="nx-project-card" href="${esc(p.page||'plugins.html')}"><span class="nx-project-top"><i class="nx-project-mark">${esc(initials(p.name))}</i><b class="nx-project-version">${esc(p.version||'')}</b></span><h3>${esc(p.name)}</h3><p>${esc(p.summary||p.category||'')}</p><span>${esc(p.category||'Projekt AIO')} • ${esc(p.updated||'')}</span></a>`).join('');
    }catch(e){root.innerHTML='<a class="nx-project-card" href="plugins.html"><span class="nx-project-top"><i class="nx-project-mark">AIO</i></span><h3>Pełny katalog projektów</h3><p>Otwórz wszystkie dostępne wtyczki, skiny i aplikacje.</p><span>Przejdź do projektów →</span></a>';}
  }

  $$('[data-nx-copy]').forEach(btn=>btn.addEventListener('click',async()=>{const value=btn.getAttribute('data-nx-copy')||'';try{await navigator.clipboard.writeText(value);const old=btn.textContent;btn.textContent='Skopiowano';setTimeout(()=>btn.textContent=old,1600);}catch(e){const ta=document.createElement('textarea');ta.value=value;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();btn.textContent='Skopiowano';}}));

  const modal=$('[data-nx-search-modal]'), input=$('[data-nx-search-input]'), results=$('[data-nx-search-results]'), empty=$('[data-nx-search-empty]'), count=$('[data-nx-search-count]');
  let index=[],selected=0,lastResults=[];
  async function ensureIndex(){if(index.length)return;try{const r=await fetch('data/search-index.json',{cache:'no-store'});if(r.ok)index=await r.json();}catch(e){index=[];}}
  function score(item,q){const hayTitle=norm(item.title),hayDesc=norm(item.desc),hayTags=norm((item.tags||[]).join(' '));let n=0;if(hayTitle===q)n+=100;if(hayTitle.startsWith(q))n+=45;if(hayTitle.includes(q))n+=30;if(hayTags.includes(q))n+=18;if(hayDesc.includes(q))n+=10;for(const w of q.split(/\s+/).filter(Boolean)){if(hayTitle.includes(w))n+=8;if(hayTags.includes(w))n+=4;if(hayDesc.includes(w))n+=2;}return n;}
  function renderSearch(){const q=norm(input.value.trim());selected=0;if(!q){results.innerHTML='';empty.hidden=true;count.textContent='Zacznij pisać, aby przeszukać serwis.';lastResults=[];return;}lastResults=index.map(x=>({x,s:score(x,q)})).filter(o=>o.s>0).sort((a,b)=>b.s-a.s).slice(0,12).map(o=>o.x);count.textContent=`Wyniki: ${lastResults.length}`;empty.hidden=lastResults.length>0;results.innerHTML=lastResults.map((item,i)=>`<a class="nx-search-result${i===0?' is-selected':''}" href="${esc(item.url||'#')}"><span class="nx-search-result-mark">${esc(initials(item.title))}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.desc||'')}</small></span><b>→</b></a>`).join('');}
  function moveSelection(delta){const links=$$('.nx-search-result',results);if(!links.length)return;links[selected]?.classList.remove('is-selected');selected=(selected+delta+links.length)%links.length;links[selected].classList.add('is-selected');links[selected].scrollIntoView({block:'nearest'});}
  async function openSearch(){if(!modal)return;await ensureIndex();modal.hidden=false;document.body.classList.add('nx-modal-open');setTimeout(()=>input&&input.focus(),20);renderSearch();}
  function closeSearch(){if(!modal)return;modal.hidden=true;document.body.classList.remove('nx-modal-open');}
  $$('[data-nx-search-open]').forEach(b=>b.addEventListener('click',openSearch));$$('[data-nx-search-close]').forEach(b=>b.addEventListener('click',closeSearch));if(input)input.addEventListener('input',renderSearch);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();return;}if(!modal||modal.hidden)return;if(e.key==='Escape'){e.preventDefault();closeSearch();}else if(e.key==='ArrowDown'){e.preventDefault();moveSelection(1);}else if(e.key==='ArrowUp'){e.preventDefault();moveSelection(-1);}else if(e.key==='Enter'&&lastResults.length){const links=$$('.nx-search-result',results);if(links[selected]){e.preventDefault();links[selected].click();}}});

  loadUpdates(); loadProjects();
})();
