
(function(){
  'use strict';

  const root = document.getElementById('updatesV2List');
  const countEl = document.getElementById('updatesV2Count');
  const searchEl = document.getElementById('updatesV2Search');
  const resetEl = document.getElementById('updatesV2Reset');
  const filters = Array.from(document.querySelectorAll('[data-updates-v2-filter]'));
  if(!root || !countEl) return;

  let items = [];
  let activeFilter = 'all';

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();

  function fmtDate(value){
    if(!value) return '';
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : value;
  }

  function classify(item){
    const hay = normalize([
      item.title,
      item.desc,
      item.details,
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(' '));

    if(hay.includes('aio panel')) return 'aio';
    if(hay.includes('epg') || hay.includes('iptv') || hay.includes('xmltv') || hay.includes('m3u') || hay.includes('stalker')) return 'iptv';
    if(hay.includes('skin') || hay.includes('aiohd') || hay.includes('fhd')) return 'skin';
    if(hay.includes('android') || hay.includes('windows') || hay.includes('remote')) return 'apps';
    return 'tools';
  }

  function route(item){
    if(item.url) return item.url;
    const title = normalize(item.title);
    const routes = [
      ['simple iptv epg','plugin-simple-iptv-epg.html'],
      ['nagrania on demand','plugin-nagrania-on-demand.html'],
      ['neoradio','plugin-neoradio.html'],
      ['iptv dream','plugin-iptv-dream.html'],
      ['aio panel remote','app-aio-panel-remote.html'],
      ['aio panel','plugin-aio-panel.html'],
      ['pp channel sync','plugin-pp-channel-sync.html'],
      ['e2 doctor','plugin-e2-doctor.html'],
      ['picon updater','plugin-picon-updater.html'],
      ['myupdater','plugin-myupdater.html'],
      ['cambridge pl','android-apps.html']
    ];
    const found = routes.find(([key]) => title.includes(key));
    return found ? found[1] : 'plugins.html';
  }

  function matches(item){
    const q = normalize(searchEl ? searchEl.value : '');
    const category = classify(item);
    if(activeFilter !== 'all' && category !== activeFilter) return false;
    if(!q) return true;
    const hay = normalize([
      item.title,
      item.desc,
      item.details,
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(' '));
    return hay.includes(q);
  }

  function labelFor(category){
    return {
      aio:'AIO Panel',
      iptv:'IPTV / EPG',
      skin:'Skiny',
      apps:'Aplikacje',
      tools:'Narzędzia'
    }[category] || 'Projekt';
  }

  function render(){
    const visible = items.filter(matches);
    countEl.textContent = visible.length;
    root.textContent = '';

    if(!visible.length){
      const empty = document.createElement('div');
      empty.className = 'updates-v2-empty';
      empty.textContent = 'Brak aktualizacji pasujących do wybranego filtra lub wyszukiwania.';
      root.appendChild(empty);
      return;
    }

    visible.forEach((item,index)=>{
      const category = classify(item);
      const card = document.createElement('article');
      card.className = 'updates-v2-item';

      const head = document.createElement('div');
      head.className = 'updates-v2-item-head';

      const copy = document.createElement('div');
      const meta = document.createElement('span');
      meta.className = 'updates-v2-meta';
      meta.textContent = labelFor(category);

      const title = document.createElement('h3');
      title.textContent = (index === 0 && activeFilter === 'all' && !normalize(searchEl?.value) ? '🔥 ' : '') + (item.title || 'Aktualizacja');

      const tags = document.createElement('div');
      tags.className = 'updates-v2-tags';
      const sourceTags = Array.isArray(item.tags) ? item.tags.slice(0,5) : [];
      sourceTags.forEach(tag=>{
        const el = document.createElement('span');
        el.className = 'updates-v2-tag';
        el.textContent = tag;
        tags.appendChild(el);
      });

      copy.append(meta,title,tags);

      const time = document.createElement('time');
      time.dateTime = item.date || '';
      time.textContent = fmtDate(item.date);

      head.append(copy,time);
      card.appendChild(head);

      const details = document.createElement('details');
      if(index < 2 && activeFilter === 'all' && !normalize(searchEl?.value)) details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = item.desc || 'Najważniejsze zmiany';

      const p = document.createElement('p');
      p.className = 'updates-v2-details';
      p.textContent = item.details || item.desc || 'Brak dodatkowego opisu.';

      details.append(summary,p);
      card.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'updates-v2-item-actions';

      const project = document.createElement('a');
      project.href = route(item);
      project.textContent = 'Zobacz projekt / aktualizację';

      const download = document.createElement('a');
      download.href = 'downloads.html';
      download.textContent = 'Centrum pobierania';

      actions.append(project,download);
      card.appendChild(actions);
      root.appendChild(card);
    });
  }

  filters.forEach(button=>{
    button.addEventListener('click',()=>{
      activeFilter = button.dataset.updatesV2Filter || 'all';
      filters.forEach(b=>b.classList.toggle('active', b === button));
      render();
    });
  });

  searchEl?.addEventListener('input',render);
  resetEl?.addEventListener('click',()=>{
    if(searchEl) searchEl.value = '';
    activeFilter = 'all';
    filters.forEach(b=>b.classList.toggle('active', b.dataset.updatesV2Filter === 'all'));
    searchEl?.focus();
    render();
  });

  fetch('data/updates.json',{cache:'no-store'})
    .then(response=>{
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data=>{
      items = Array.isArray(data) ? data : [];
      render();
    })
    .catch(()=>{
      root.innerHTML = '<div class="updates-v2-empty">Nie udało się wczytać historii aktualizacji. Spróbuj odświeżyć stronę.</div>';
      countEl.textContent = '0';
    });
})();
