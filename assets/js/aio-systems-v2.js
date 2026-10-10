(function(){
'use strict';

const $=(s,c=document)=>c.querySelector(s);
const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
const legacy=$('#systemFilter');
const search=$('#systemsV2Search');
const count=$('#systemsV2Count');
const note=$('#systemsV2NoResults');
const cards=$$('[data-system-card]');
const reset=$('#systemsV2Reset');

if(!legacy||!cards.length)return;

let freeQuery='';
let brand='';
let model='';

const norm=v=>String(v||'').trim().replace(/\s+/g,' ');

function combined(){
  return [brand,model,freeQuery].filter(Boolean).join(' ');
}
function mirror(){
  legacy.value=combined();
  legacy.dispatchEvent(new Event('input',{bubbles:true}));
  setTimeout(refresh,0);
}
function refresh(){
  const visible=cards.filter(c=>!c.hidden).length;
  if(count)count.textContent=String(visible);
  if(note)note.classList.toggle('is-visible',visible===0);

  $$('[data-sv2-brand]').forEach(b=>b.classList.toggle('is-active',b.dataset.sv2Brand===brand));
  $$('[data-sv2-model]').forEach(b=>b.classList.toggle('is-active',b.dataset.sv2Model===model));
}
function clearAll(){
  freeQuery='';brand='';model='';
  if(search)search.value='';
  mirror();
}
function goToResults(){
  $('#multi-click')?.scrollIntoView({behavior:'smooth',block:'start'});
}

search?.addEventListener('input',()=>{
  freeQuery=norm(search.value);
  mirror();
});

reset?.addEventListener('click',clearAll);

$$('[data-sv2-brand]').forEach(b=>b.addEventListener('click',()=>{
  brand=brand===b.dataset.sv2Brand?'':b.dataset.sv2Brand;
  mirror();
}));

$$('[data-sv2-model]').forEach(b=>b.addEventListener('click',()=>{
  model=model===b.dataset.sv2Model?'':b.dataset.sv2Model;
  mirror();
}));

$('#systemsV2Show')?.addEventListener('click',goToResults);

$('#systemsV2OpenVisible')?.addEventListener('click',()=>{
  cards.filter(c=>!c.hidden).forEach(c=>{
    const d=$('details',c);
    if(d)d.open=true;
  });
  goToResults();
});

$('#systemsV2CloseAll')?.addEventListener('click',()=>{
  cards.forEach(c=>{
    const d=$('details',c);
    if(d)d.open=false;
  });
});

$$('[data-sv2-clean]').forEach(b=>b.addEventListener('click',()=>{
  const wanted=(b.dataset.sv2Clean||'').toLowerCase();
  const section=$('#czyste-systemy');
  if(!section)return;

  const targets=$$('.choice-card',section);
  targets.forEach(x=>x.classList.remove('systems-v2-highlight'));

  const target=targets.find(x=>{
    const strong=$('strong',x);
    return strong&&strong.textContent.trim().toLowerCase()===wanted;
  });

  if(target){
    target.classList.add('systems-v2-highlight');
    target.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>target.classList.remove('systems-v2-highlight'),2600);
  }else{
    section.scrollIntoView({behavior:'smooth',block:'start'});
  }
}));

legacy.addEventListener('input',refresh);
mirror();
})();
