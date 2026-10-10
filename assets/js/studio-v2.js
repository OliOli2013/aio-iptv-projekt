
(function(){
'use strict';
const input=document.getElementById('studioV2Search');
const cards=Array.from(document.querySelectorAll('[data-studio-card]'));
const buttons=Array.from(document.querySelectorAll('[data-studio-filter]'));
const count=document.getElementById('studioV2Count');
const empty=document.getElementById('studioV2Empty');
let active='all';

function norm(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function run(){
  const q=norm(input&&input.value);
  let n=0;
  cards.forEach(card=>{
    const cat=card.dataset.studioCategory||'other';
    const hay=norm(card.dataset.studioSearch||card.textContent);
    const ok=(active==='all'||cat===active)&&(!q||hay.includes(q));
    card.hidden=!ok;
    if(ok) n++;
  });
  if(count) count.textContent=n+' narzędzi';
  if(empty) empty.classList.toggle('show',n===0);
}
buttons.forEach(btn=>btn.addEventListener('click',()=>{
  active=btn.dataset.studioFilter||'all';
  buttons.forEach(b=>b.classList.toggle('active',b===btn));
  run();
}));
if(input) input.addEventListener('input',run);
run();
})();
