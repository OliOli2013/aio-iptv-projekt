/* AIO Status V2 — UX layer, status data/rendering remains in smart-tools.js */
(function(){
  'use strict';

  var state = { text:'', status:'all' };

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

  function normalize(v){
    return String(v || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
  }

  function visibleCards(){
    return qa('#statusDashboard .service-card').filter(function(card){ return !card.hidden; });
  }

  function applyFilters(){
    var box = q('#statusDashboard');
    if(!box) return;
    var cards = qa('.service-card',box);
    var count = 0;

    cards.forEach(function(card){
      var textOk = !state.text || normalize(card.textContent).includes(normalize(state.text));
      var statusOk = state.status === 'all' || card.classList.contains('status-'+state.status);
      var show = textOk && statusOk;
      card.hidden = !show;
      if(show) count++;
    });

    var empty = q('#statusV2Empty');
    if(empty) empty.classList.toggle('is-visible',cards.length>0 && count===0);
    updateOverall();
  }

  function updateOverall(){
    var allCards = qa('#statusDashboard .service-card');
    var scope = visibleCards();
    if(!scope.length && allCards.length) scope = allCards.filter(function(c){return !c.hidden;});

    var online = scope.filter(function(c){return c.classList.contains('status-online');}).length;
    var warning = scope.filter(function(c){return c.classList.contains('status-warning');}).length;
    var offline = scope.filter(function(c){return c.classList.contains('status-offline');}).length;
    var unknown = scope.filter(function(c){return c.classList.contains('status-unknown');}).length;

    var pill = q('#statusV2Overall');
    var text = q('#statusV2OverallText');
    if(!pill || !text) return;

    pill.classList.remove('is-online','is-warning','is-offline');
    if(offline>0){
      pill.classList.add('is-offline');
      text.textContent = offline+' niedostępne';
    }else if(warning>0 || unknown>0){
      pill.classList.add('is-warning');
      text.textContent = warning ? warning+' ostrzeżenia' : unknown+' oczekuje';
    }else if(scope.length){
      pill.classList.add('is-online');
      text.textContent = 'Wszystkie widoczne usługi działają';
    }else{
      text.textContent = 'Ładowanie statusu…';
    }

    var total = q('#statusV2Count');
    if(total) total.textContent = String(scope.length || 0);
  }

  function setStatusFilter(value){
    state.status = value;
    qa('[data-status-v2]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-status-v2')===value);
    });
    applyFilters();
  }

  function setCategory(value){
    var select = q('#statusFilter');
    if(!select) return;
    select.value = value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function init(){
    var dashboard = q('#statusDashboard');
    if(!dashboard) return;

    q('#statusV2Search')?.addEventListener('input',function(e){
      state.text = e.target.value || '';
      applyFilters();
    });

    qa('[data-status-v2]').forEach(function(btn){
      btn.addEventListener('click',function(){
        setStatusFilter(btn.getAttribute('data-status-v2') || 'all');
      });
    });

    qa('[data-category-v2]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var value = btn.getAttribute('data-category-v2') || '';
        setCategory(value);
        qa('[data-category-v2]').forEach(function(b){
          b.classList.toggle('is-active',b===btn);
        });
      });
    });

    q('#statusFilter')?.addEventListener('change',function(){
      setTimeout(applyFilters,20);
    });

    new MutationObserver(function(){
      setTimeout(applyFilters,10);
    }).observe(dashboard,{childList:true,subtree:true});

    setTimeout(applyFilters,150);
    setTimeout(applyFilters,700);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
