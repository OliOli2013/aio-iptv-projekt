/* Single source of truth: data/projects.json for selected homepage release labels. */
(()=>{
  'use strict';
  const root=document.querySelector('.aio-v2-projects');
  if(!root)return;
  async function homepageProjects(){
    // AIO Home loads this catalog for its featured files; reuse its in-memory Promise.
    if(typeof window.AIOHomeCatalogV1==='function'){
      try{
        const c=await window.AIOHomeCatalogV1();
        if(c && Array.isArray(c.projects) && c.projects.length)return c.projects;
      }catch(_){}
    }
    // Legacy fallback for temporary catalog outages.
    const response=await fetch('data/projects.json',{cache:'default'});
    if(!response.ok)throw Error('projects catalog '+response.status);
    return response.json();
  }
  homepageProjects().then(rows=>{
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
