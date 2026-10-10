/* AIO AI Chat V2 — warstwa UX, bez zmian backendu */
(function(){
  'use strict';

  function byId(id){ return document.getElementById(id); }

  function submitPrompt(text){
    var input = byId('inlineAiInput');
    var form = byId('inlineAiForm');
    if(!input || !form) return;
    input.value = text;
    input.focus();
    if(typeof form.requestSubmit === 'function') form.requestSubmit();
    else {
      var ev = document.createEvent('Event');
      ev.initEvent('submit', true, true);
      form.dispatchEvent(ev);
    }
  }

  function addCopyButton(node){
    if(!node || node.nodeType !== 1) return;
    if(!node.classList.contains('bot')) return;
    if(node.dataset.temporary === '1') return;
    if(node.dataset.v2copy === '1') return;
    if(node.querySelector && node.querySelector('.action-row')) return;
    node.dataset.v2copy = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-chat-v2-copy';
    btn.textContent = 'Kopiuj odpowiedź';
    btn.addEventListener('click', function(){
      var text = node.innerText || node.textContent || '';
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){
          btn.textContent = 'Skopiowano ✓';
          setTimeout(function(){ btn.textContent = 'Kopiuj odpowiedź'; }, 1500);
        });
      }
    });
    node.insertAdjacentElement('afterend', btn);
  }

  function syncStatus(){
    var source = byId('aiChatStatus');
    var hero = byId('aiChatV2State');
    if(!source || !hero) return;

    function apply(){
      var state = source.dataset.state || 'info';
      hero.dataset.state = state;
      var label = hero.querySelector('[data-status-label]');
      if(label){
        if(state === 'online') label.textContent = 'Asystent online';
        else if(state === 'loading') label.textContent = 'Łączenie / analiza';
        else if(state === 'offline') label.textContent = 'Tryb awaryjny';
        else label.textContent = 'Status asystenta';
      }
    }
    apply();
    new MutationObserver(apply).observe(source,{attributes:true,childList:true,subtree:true});
  }

  function init(){
    var form = byId('inlineAiForm');
    var input = byId('inlineAiInput');
    var box = byId('chatMessages');

    document.querySelectorAll('[data-ai-prompt]').forEach(function(btn){
      btn.addEventListener('click', function(){
        submitPrompt(btn.getAttribute('data-ai-prompt') || btn.textContent || '');
      });
    });

    if(input && input.tagName === 'TEXTAREA'){
      input.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && !e.shiftKey){
          e.preventDefault();
          if(form && typeof form.requestSubmit === 'function') form.requestSubmit();
        }
      });
    }

    var clearBtn = byId('aiChatV2Clear');
    if(clearBtn && box){
      clearBtn.addEventListener('click', function(){
        box.innerHTML = '<p class="bot">Rozmowa została wyczyszczona. Napisz krótko, czego potrzebujesz.</p>';
        Array.from(box.children).forEach(addCopyButton);
      });
    }

    if(box){
      Array.from(box.children).forEach(addCopyButton);
      new MutationObserver(function(mutations){
        mutations.forEach(function(m){
          Array.from(m.addedNodes || []).forEach(function(n){
            if(n.nodeType === 1){
              if(n.classList && n.classList.contains('bot')) addCopyButton(n);
              if(n.querySelectorAll) n.querySelectorAll('.bot').forEach(addCopyButton);
            }
          });
        });
      }).observe(box,{childList:true,subtree:true});
    }

    syncStatus();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
