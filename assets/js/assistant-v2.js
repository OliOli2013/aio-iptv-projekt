/* AIO Assistant V2 — UX only, smart-tools.js remains source of recommendations */
(function(){
  'use strict';

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

  function goalLabel(value){
    var map = {
      aio:'Kompletne centrum AIO',
      diagnostics:'Diagnostyka problemu',
      channels:'Listy kanałów',
      iptv:'IPTV / M3U / Xtream',
      remote:'Sterowanie telefonem',
      oscam:'OSCam / NCam',
      system:'Instalacja systemu',
      picons:'Picony',
      unknown:'Nie wiem — podstawowy zestaw'
    };
    return map[value] || 'Nie wybrano';
  }

  function updateSummary(){
    var form = q('#assistantForm');
    var out = q('#assistantV2Summary');
    var bar = q('#assistantV2Bar');
    var note = q('#assistantV2Completeness');
    if(!form || !out) return;

    var data = new FormData(form);
    var vals = {
      goal: String(data.get('goal') || ''),
      model: String(data.get('model') || ''),
      system: String(data.get('system') || ''),
      systemVersion: String(data.get('systemVersion') || ''),
      python: String(data.get('python') || ''),
      satellites: String(data.get('satellites') || '')
    };

    var system = [vals.system, vals.systemVersion].filter(Boolean).join(' ') || 'nie ustawiono';
    out.innerHTML =
      '<div><span>Cel</span><strong>'+escapeHtml(goalLabel(vals.goal))+'</strong></div>'+
      '<div><span>Tuner</span><strong>'+escapeHtml(vals.model || 'nie ustawiono')+'</strong></div>'+
      '<div><span>System</span><strong>'+escapeHtml(system)+'</strong></div>'+
      '<div><span>Python</span><strong>'+escapeHtml(vals.python || 'nie wiem')+'</strong></div>'+
      '<div><span>Satelity</span><strong>'+escapeHtml(vals.satellites || 'nie ustawiono')+'</strong></div>';

    var score = 0;
    if(vals.goal) score += 35;
    if(vals.model) score += 20;
    if(vals.system) score += 20;
    if(vals.python) score += 15;
    if(vals.satellites) score += 10;
    if(bar) bar.style.width = Math.min(100,score)+'%';
    if(note){
      if(score >= 80) note.textContent = 'Profil jest wystarczająco dokładny do sensownego doboru.';
      else if(score >= 55) note.textContent = 'Możesz już dobrać projekty. Dodatkowe dane zwiększą trafność.';
      else note.textContent = 'Wybierz przynajmniej cel. Model i system możesz pozostawić puste, jeśli ich nie znasz.';
    }
  }

  function escapeHtml(v){
    return String(v || '').replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function setGoal(value){
    var form = q('#assistantForm');
    if(!form) return;
    var field = form.elements.namedItem('goal');
    if(field) {
      field.value = value;
      field.dispatchEvent(new Event('change',{bubbles:true}));
    }
    qa('[data-assistant-goal]').forEach(function(btn){
      btn.classList.toggle('is-active', btn.getAttribute('data-assistant-goal') === value);
    });
    updateSummary();
    q('#assistantV2Profile')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function init(){
    var form = q('#assistantForm');
    if(!form) return;

    qa('[data-assistant-goal]').forEach(function(btn){
      btn.addEventListener('click', function(){
        setGoal(btn.getAttribute('data-assistant-goal') || 'unknown');
      });
    });

    form.addEventListener('input',updateSummary);
    form.addEventListener('change',function(){
      var goal = form.elements.namedItem('goal')?.value || '';
      qa('[data-assistant-goal]').forEach(function(btn){
        btn.classList.toggle('is-active',btn.getAttribute('data-assistant-goal')===goal);
      });
      updateSummary();
    });

    q('#assistantUseProfile')?.addEventListener('click',function(){
      setTimeout(updateSummary,30);
    });

    setTimeout(updateSummary,150);
    setTimeout(updateSummary,700);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
