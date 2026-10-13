/* Single source of truth: data/projects.json for selected homepage release labels. */
(()=>{
  'use strict';
  const root=document.querySelector('.aio-v2-projects');
  if(!root)return;
  fetch('data/projects.json',{cache:'default'}).then(r=>{
    if(!r.ok)throw Error('catalog');
    return r.json();
  }).then(rows=>{
    if(!Array.isArray(rows))return;
    for(const item of rows){
      if(!item||!item.page||!item.name||!item.version)continue;
      // Only modify a title inside the homepage projects group, never links or URLs.
      const link=[...root.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===item.page);
      const label=link?.querySelector('strong');
      if(!label)continue;
      label.textContent=String(item.name)+' '+String(item.version);
    }
  }).catch(()=>{}); // Static fallback remains visible during outages.
})();
