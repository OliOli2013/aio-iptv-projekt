/* AIO Log Analyzer V2 — UX layer, analyzer engine remains in smart-tools.js */
(function(){
  'use strict';

  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel));}

  function detectType(text){
    var t = String(text || '');
    if(!t.trim()) return 'Brak danych';
    if(/traceback \(most recent call last\):/i.test(t)) return 'Traceback Python';
    if(/opkg|collected errors|cannot satisfy/i.test(t)) return 'OPKG / instalacja';
    if(/skinerror|screen .* not found|pixmap .* not found/i.test(t)) return 'Skin / GUI';
    if(/lamedb|#service|service reference/i.test(t)) return 'Listy kanałów';
    if(/network|dns|connection|timeout|http|ssl/i.test(t)) return 'Sieć / HTTP';
    return 'Log ogólny';
  }

  function updateMeta(){
    var input = q('#logInput');
    var chars = q('#logV2Chars');
    var lines = q('#logV2Lines');
    var type = q('#logV2Type');
    if(!input) return;
    var value = input.value || '';
    if(chars) chars.textContent = String(value.length);
    if(lines) lines.textContent = value ? String(value.split(/\r?\n/).length) : '0';
    if(type) type.textContent = detectType(value);
  }

  function setSample(text){
    var input = q('#logInput');
    if(!input) return;
    input.value = text;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
  }

  function init(){
    var input = q('#logInput');
    var file = q('#logFile');
    var results = q('#logResults');
    if(!input) return;

    input.addEventListener('input',updateMeta);

    file?.addEventListener('change',function(){
      setTimeout(function(){
        updateMeta();
        var name = q('#logV2FileName');
        var f = file.files && file.files[0];
        if(name) name.textContent = f ? f.name : 'brak';
      },80);
    });

    q('#logV2Clear')?.addEventListener('click',function(){
      input.value = '';
      if(file) file.value = '';
      var name = q('#logV2FileName');
      if(name) name.textContent = 'brak';
      if(results) results.hidden = true;
      updateMeta();
      input.focus();
    });

    q('#logSanitize')?.addEventListener('click',function(){
      setTimeout(updateMeta,20);
    });

    qa('[data-log-sample]').forEach(function(btn){
      btn.addEventListener('click',function(){
        setSample(btn.getAttribute('data-log-sample') || '');
      });
    });

    new MutationObserver(function(){
      if(results && !results.hidden){
        results.classList.add('log-v2-results');
      }
    }).observe(results || document.body,{attributes:true,childList:true,subtree:true});

    setTimeout(updateMeta,100);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
