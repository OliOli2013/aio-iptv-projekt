/* AIOHD NEXT page V2 */
(function(){
'use strict';
function q(s,r){return (r||document).querySelector(s);}
function qa(s,r){return Array.from((r||document).querySelectorAll(s));}

function setInstallTab(name){
  qa('[data-aiohd-install-tab]').forEach(function(btn){
    btn.classList.toggle('is-active',btn.getAttribute('data-aiohd-install-tab')===name);
  });
  qa('[data-aiohd-install-panel]').forEach(function(panel){
    panel.hidden=panel.getAttribute('data-aiohd-install-panel')!==name;
  });
}

function setPalette(name){
  var copy={
    aurora:'Aurora — chłodny turkus i spokojne niebiesko-zielone akcenty.',
    amber:'Amber — cieplejsze bursztynowe akcenty o większym kontraście.',
    violet:'Violet — fioletowy wariant dla osób preferujących chłodniejszy, bardziej wyrazisty wygląd.'
  };
  qa('[data-palette]').forEach(function(btn){
    btn.classList.toggle('is-active',btn.getAttribute('data-palette')===name);
  });
  var out=q('#aiohdPaletteText');
  if(out) out.textContent=copy[name]||copy.aurora;
}

function initNav(){
  var links=qa('.aiohd-v2-nav a');
  if(!links.length||!('IntersectionObserver' in window))return;
  var map=new Map(links.map(function(a){return [a.getAttribute('href').slice(1),a];}));
  var ob=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        links.forEach(function(a){a.classList.remove('is-active');});
        var link=map.get(e.target.id);
        if(link)link.classList.add('is-active');
      }
    });
  },{rootMargin:'-20% 0px -65% 0px',threshold:0});
  map.forEach(function(_,id){var el=document.getElementById(id);if(el)ob.observe(el);});
}

function init(){
  qa('[data-aiohd-install-tab]').forEach(function(btn){
    btn.addEventListener('click',function(){setInstallTab(btn.getAttribute('data-aiohd-install-tab')||'panel');});
  });
  qa('[data-palette]').forEach(function(btn){
    btn.addEventListener('click',function(){setPalette(btn.getAttribute('data-palette')||'aurora');});
  });
  setInstallTab('panel');
  setPalette('aurora');
  initNav();
}
document.addEventListener('DOMContentLoaded',init);
})();
