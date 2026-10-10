/* AIO My Tuner V2 — UX layer, local profile remains handled by smart-tools.js */
(function(){
  'use strict';

  function q(sel, root){ return (root || document).querySelector(sel); }

  function esc(v){
    return String(v || '').replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function updateLive(){
    var form = q('#tunerProfileForm');
    var out = q('#myTunerV2Live');
    if(!form || !out) return;
    var d = new FormData(form);
    var model = String(d.get('model') || '');
    var system = [String(d.get('system') || ''),String(d.get('systemVersion') || '')].filter(Boolean).join(' ');
    var python = String(d.get('python') || '');
    var satellites = String(d.get('satellites') || '');
    var connection = String(d.get('connection') || '');

    out.innerHTML =
      '<div><span>Tuner</span><strong>'+esc(model || 'nie wybrano')+'</strong></div>'+
      '<div><span>System</span><strong>'+esc(system || 'nie ustawiono')+'</strong></div>'+
      '<div><span>Python</span><strong>'+esc(python || 'nie wiem')+'</strong></div>'+
      '<div><span>Satelity</span><strong>'+esc(satellites || 'nie ustawiono')+'</strong></div>'+
      '<div><span>Połączenie</span><strong>'+esc(connection || 'nie ustawiono')+'</strong></div>';
  }

  function refreshLoadedHardware(){
    var form = q('#tunerProfileForm');
    if(!form) return;
    var select = form.elements.namedItem('model');
    if(!select || !select.value) return;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function init(){
    var form = q('#tunerProfileForm');
    if(!form) return;

    form.addEventListener('input',updateLive);
    form.addEventListener('change',updateLive);
    form.addEventListener('submit',function(){
      setTimeout(updateLive,20);
    });

    q('#profileReset')?.addEventListener('click',function(){
      setTimeout(function(){
        updateLive();
        var hw = q('#profileHardware');
        if(hw) hw.innerHTML = '<p>Wybierz model tunera, aby wyświetlić dane z bazy.</p>';
      },30);
    });

    /* smart-tools.js populates model list asynchronously */
    setTimeout(updateLive,120);
    setTimeout(function(){ updateLive(); refreshLoadedHardware(); },500);
    setTimeout(function(){ updateLive(); refreshLoadedHardware(); },1200);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
