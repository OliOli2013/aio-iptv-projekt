
(function(){
  'use strict';
  const d=document;
  const body=d.body;
  if(!body || !body.classList.contains('aio-guides-v2')) return;

  const search=d.getElementById('aioGuidesV2Search');
  const resets=[d.getElementById('aioGuidesV2Reset'),d.getElementById('aioGuidesV2ResetTop')].filter(Boolean);
  const count=d.getElementById('aioGuidesV2Count');
  const empty=d.getElementById('aioGuidesV2Empty');
  const chips=[...d.querySelectorAll('[data-guides-v2-category]')];
  const cards=[...d.querySelectorAll('.content-main .choice-card')];
  let category='all';

  const norm=s=>String(s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');

  function classify(text){
    const t=norm(text);
    if(/oscam|softcam|cam feed/.test(t)) return 'oscam';
    if(/xstremity|iptv|playlist/.test(t)) return 'iptv';
    if(/picon|serviceref|satellites|kanal|bukiet/.test(t)) return 'channels';
    if(/terminal|openwebif|root|haslo|siec|diagnost|restart gui/.test(t)) return 'tools';
    if(/image|openatv|pamiec|zgemma|instalacja/.test(t)) return 'system';
    if(/pilot|pierwsze|konfiguracja/.test(t)) return 'start';
    return 'other';
  }

  cards.forEach(card=>{
    const text=card.textContent||'';
    card.dataset.guidesV2Category=classify(text);
    card.dataset.guidesV2Search=norm(text);
    if(!card.querySelector('.aio-guides-v2-badge')){
      const labels={
        start:'Start',system:'System / image',tools:'Narzędzia',
        oscam:'OSCam / SoftCam',iptv:'IPTV',channels:'Kanały',other:'Pomoc'
      };
      const b=d.createElement('span');
      b.className='aio-guides-v2-badge';
      b.textContent=labels[card.dataset.guidesV2Category]||'Poradnik';
      card.appendChild(b);
    }
  });

  function apply(){
    const q=norm(search?.value||'');
    let visible=0;
    cards.forEach(card=>{
      const okQ=!q || card.dataset.guidesV2Search.includes(q);
      const okC=category==='all' || card.dataset.guidesV2Category===category;
      const ok=okQ && okC;
      card.hidden=!ok;
      if(ok) visible++;
    });
    if(count) count.textContent=String(visible);
    if(empty) empty.classList.toggle('is-visible',visible===0);
  }

  search?.addEventListener('input',apply);

  resets.forEach(reset=>reset.addEventListener('click',()=>{
    if(search) search.value='';
    category='all';
    chips.forEach(c=>c.classList.toggle('is-active',c.dataset.guidesV2Category==='all'));
    apply();
    search?.focus();
  }));

  chips.forEach(chip=>chip.addEventListener('click',()=>{
    category=chip.dataset.guidesV2Category||'all';
    chips.forEach(c=>c.classList.toggle('is-active',c===chip));
    apply();
  }));

  apply();
})();
