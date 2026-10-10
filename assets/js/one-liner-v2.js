
(function(){
'use strict';
const search=document.getElementById('oneV2Search');
const reset=document.getElementById('oneV2Reset');
const cards=Array.from(document.querySelectorAll('[data-one-card]'));
const filters=Array.from(document.querySelectorAll('[data-one-filter]'));
let active='all';
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function run(){
  const q=norm(search&&search.value);
  cards.forEach(card=>{
    const kind=card.dataset.oneKind||'other';
    const hay=norm(card.dataset.oneSearch||card.textContent);
    card.hidden=!((active==='all'||kind===active)&&(!q||hay.includes(q)));
  });
  document.querySelectorAll('[data-one-section]').forEach(section=>{
    const visible=Array.from(section.querySelectorAll('[data-one-card]')).some(c=>!c.hidden);
    section.hidden=!visible;
  });
}
filters.forEach(btn=>btn.addEventListener('click',()=>{
  active=btn.dataset.oneFilter||'all';
  filters.forEach(b=>b.classList.toggle('active',b===btn));
  run();
}));
if(search) search.addEventListener('input',run);
if(reset) reset.addEventListener('click',()=>{
  if(search) search.value='';
  active='all';
  filters.forEach(b=>b.classList.toggle('active',b.dataset.oneFilter==='all'));
  run();
});
run();
})();
