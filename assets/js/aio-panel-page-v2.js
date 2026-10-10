/* AIO Panel project page V2 */
(function(){
'use strict';
function q(s,r){return (r||document).querySelector(s);}
function qa(s,r){return Array.from((r||document).querySelectorAll(s));}

function setInstallTab(name){
  qa('[data-install-tab]').forEach(function(btn){
    btn.classList.toggle('is-active',btn.getAttribute('data-install-tab')===name);
  });
  qa('[data-install-panel]').forEach(function(panel){
    panel.hidden=panel.getAttribute('data-install-panel')!==name;
  });
}

function initInstallTabs(){
  qa('[data-install-tab]').forEach(function(btn){
    btn.addEventListener('click',function(){
      setInstallTab(btn.getAttribute('data-install-tab')||'direct');
    });
  });
}

function initNav(){
  var links=qa('.aio-panel-v2-nav a');
  if(!links.length||!('IntersectionObserver' in window))return;
  var byId=new Map(links.map(function(a){return [a.getAttribute('href').slice(1),a];}));
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        links.forEach(function(a){a.classList.remove('is-active');});
        var link=byId.get(entry.target.id);
        if(link)link.classList.add('is-active');
      }
    });
  },{rootMargin:'-20% 0px -65% 0px',threshold:0});
  byId.forEach(function(_,id){
    var el=document.getElementById(id);
    if(el)observer.observe(el);
  });
}

function init(){
  initInstallTabs();
  initNav();
  setInstallTab('direct');
}
document.addEventListener('DOMContentLoaded',init);
})();
