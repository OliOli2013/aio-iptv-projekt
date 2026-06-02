
(function(){
  const toggle=document.querySelector('[data-menu-toggle]');
  const nav=document.querySelector('[data-site-nav]');
  if(toggle&&nav){toggle.addEventListener('click',()=>nav.classList.toggle('open'));}
  document.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const text=btn.getAttribute('data-copy')||'';
      try{await navigator.clipboard.writeText(text);btn.textContent='Skopiowano';btn.classList.add('copied');setTimeout(()=>{btn.textContent='Kopiuj';btn.classList.remove('copied')},1300)}catch(e){btn.textContent='Zaznacz ręcznie';}
    });
  });
  const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear();
  const lists=document.querySelector('[data-manifest-url]');
  if(lists){
    const status=document.getElementById('listsStatus');
    const out=document.getElementById('listsOutput');
    const packs=document.getElementById('channelPacks');
    const bouquets=document.getElementById('bouquetLists');
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const fmt=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?String(d).slice(8,10)+'.'+String(d).slice(5,7)+'.'+String(d).slice(0,4):String(d||'');
    fetch(lists.dataset.manifestUrl+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(data=>{
      const arr=Array.isArray(data)?data:[]; let pc=0,bc=0;
      packs.innerHTML=''; bouquets.innerHTML='';
      arr.forEach(item=>{
        const isBouquet=String(item.type||'').toUpperCase()==='BOUQUET';
        const node=document.createElement('div'); node.className='file-item';
        const meta=[item.author, item.version?'Aktualizacja: '+fmt(item.version):'', item.bouquet_id].filter(Boolean).map(esc).join(' • ');
        node.innerHTML='<a href="'+esc(item.url||'#')+'" target="_blank" rel="noopener">'+(isBouquet?'📄 ':'📥 ')+esc(item.name||item.id||'Lista')+'</a>'+(meta?'<small>'+meta+'</small>':'')+(item.description?'<small>'+esc(item.description)+'</small>':'');
        (isBouquet?bouquets:packs).appendChild(node); if(isBouquet)bc++; else pc++;
      });
      if(status)status.textContent='Załadowano: '+pc+' paczek kanałów i '+bc+' bukietów IPTV.';
      if(out)out.hidden=false;
    }).catch(e=>{if(status)status.textContent='Nie udało się wczytać manifestu list: '+e.message;});
  }
  const stats=document.getElementById('statsGrid');
  if(stats){
    const files=['PanelAIO-Plugin.json','IPTV-Dream-Plugin.json','MyUpdater-Plugin.json','PiconUpdater.json'];
    Promise.all(files.map(f=>fetch('traffic/'+f,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null))).then(rows=>{
      stats.innerHTML='';
      rows.filter(Boolean).forEach(x=>{
        const s=x.summary||{}, v=s.views||{}, c=s.clones||{};
        const card=document.createElement('article'); card.className='stat-card';
        card.innerHTML='<h3>'+x.repo+'</h3><strong>'+((v.count||0)+(c.count||0))+'</strong><small>razem: wejścia + klony</small><p>Views: '+(v.count||0)+' / unikalne: '+(v.uniques||0)+'</p><p>Clones: '+(c.count||0)+' / unikalne: '+(c.uniques||0)+'</p><small>Aktualizacja danych: '+(x.updatedAt||'brak')+'</small>';
        stats.appendChild(card);
      });
      if(!stats.children.length) stats.innerHTML='<div class="notice">Brak plików statystyk w katalogu traffic.</div>';
    });
  }
})();
