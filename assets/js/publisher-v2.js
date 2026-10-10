/* AIO Publisher V2 — UX layer, ZIP engine remains in project-studio.js */
(function(){
  'use strict';
  function q(sel,root){return (root||document).querySelector(sel);}
  function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  function updateLive(){
    var form=q('#publisherForm');
    var out=q('#publisherV2Live');
    if(!form||!out) return;
    var d=new FormData(form);
    var pkg=q('#publisherPackage')?.files?.[0];
    var imgs=q('#publisherImages')?.files||[];
    out.innerHTML=
      '<div><span>Projekt</span><strong>'+esc(d.get('name')||'nie ustawiono')+'</strong></div>'+
      '<div><span>Wersja</span><strong>'+esc(d.get('version')||'nie ustawiono')+'</strong></div>'+
      '<div><span>Strona</span><strong>'+esc(d.get('page')||'nie ustawiono')+'</strong></div>'+
      '<div><span>Status</span><strong>'+esc(d.get('status')||'nie ustawiono')+'</strong></div>'+
      '<div><span>Plik</span><strong>'+esc(pkg?pkg.name:'brak')+'</strong></div>'+
      '<div><span>Zdjęcia</span><strong>'+String(imgs.length)+'</strong></div>';
  }

  function updateFiles(){
    var box=q('#publisherV2Files');
    if(!box) return;
    var update=q('#publisherUpdateData')?.checked;
    var page=q('#publisherIncludePage')?.checked;
    var pkg=q('#publisherPackage')?.files?.[0];
    var imgs=q('#publisherImages')?.files||[];
    var rows=[];
    if(page) rows.push(['Strona projektu','TAK']);
    if(pkg) rows.push(['Plik wydania',pkg.name]);
    if(imgs.length) rows.push(['Obrazy',String(imgs.length)]);
    if(update){
      rows.push(['projects.json','TAK'],['downloads.json','TAK'],['search-index.json','TAK'],['updates.json','TAK']);
    }
    rows.push(['Fragment strony głównej','TAK'],['Instrukcja podmiany','TAK']);
    box.innerHTML=rows.map(function(r){return '<span><strong>'+esc(r[0])+'</strong><em>'+esc(r[1])+'</em></span>';}).join('');
  }

  function init(){
    var form=q('#publisherForm');
    if(!form) return;
    form.addEventListener('input',function(){updateLive();updateFiles();});
    form.addEventListener('change',function(){setTimeout(function(){updateLive();updateFiles();},20);});
    q('#publisherExisting')?.addEventListener('change',function(){setTimeout(updateLive,80);});
    q('#publisherPreviewButton')?.addEventListener('click',function(){setTimeout(updateLive,20);});
    setTimeout(function(){updateLive();updateFiles();},250);
    setTimeout(function(){updateLive();updateFiles();},800);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
