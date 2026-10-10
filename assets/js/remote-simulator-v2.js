/* AIO Remote Simulator V2 — UX layer, button logic stays in project-studio.js */
(function(){
  'use strict';

  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel));}

  function setContext(value){
    var select=q('#remoteContext');
    if(!select) return;
    select.value=value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    qa('[data-remote-context]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-remote-context')===value);
    });
  }

  function syncContext(){
    var value=q('#remoteContext')?.value || 'tv';
    qa('[data-remote-context]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-remote-context')===value);
    });
  }

  function init(){
    var shell=q('#remoteShell');
    var context=q('#remoteContext');
    var system=q('#remoteSystem');
    if(!shell||!context||!system) return;

    qa('[data-remote-context]').forEach(function(btn){
      btn.addEventListener('click',function(){
        setContext(btn.getAttribute('data-remote-context')||'tv');
      });
    });

    context.addEventListener('change',syncContext);

    shell.addEventListener('click',function(e){
      var btn=e.target.closest('[data-remote-key]');
      if(!btn) return;
      var selected=q('#remoteV2SelectedKey');
      if(selected) selected.textContent=(btn.textContent||btn.getAttribute('aria-label')||'przycisk').trim();
    });

    var last=localStorage.getItem('aio_remote_last_key') || 'ok';
    var lastBtn=shell.querySelector('[data-remote-key="'+last+'"]');
    var selected=q('#remoteV2SelectedKey');
    if(selected && lastBtn) selected.textContent=(lastBtn.textContent||lastBtn.getAttribute('aria-label')||last).trim();

    syncContext();
  }

  document.addEventListener('DOMContentLoaded',init);
})();
