/* AIO Project Status V2 — UX layer, renderer stays in project-studio.js */
(function(){
  'use strict';

  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel));}

  function trigger(el,type){
    if(el) el.dispatchEvent(new Event(type,{bubbles:true}));
  }

  function setStatus(value){
    var select=q('#projectStatusFilter');
    if(!select) return;
    select.value=value;
    trigger(select,'change');
    qa('[data-project-status]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-project-status')===value);
    });
  }

  function setCategory(value){
    var select=q('#projectCategoryFilter');
    if(!select) return;
    select.value=value;
    trigger(select,'change');
    qa('[data-project-category]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-project-category')===value);
    });
  }

  function buildCategoryChips(){
    var select=q('#projectCategoryFilter');
    var box=q('#projectStatusV2Categories');
    if(!select||!box) return;
    var opts=Array.from(select.options).filter(function(o){return o.value;});
    if(!opts.length) return;

    box.innerHTML='';
    var all=document.createElement('button');
    all.type='button'; all.className='project-status-v2-chip is-active';
    all.dataset.projectCategory=''; all.textContent='Wszystkie';
    all.addEventListener('click',function(){setCategory('');});
    box.appendChild(all);

    opts.forEach(function(opt){
      var btn=document.createElement('button');
      btn.type='button'; btn.className='project-status-v2-chip';
      btn.dataset.projectCategory=opt.value; btn.textContent=opt.textContent;
      btn.addEventListener('click',function(){setCategory(opt.value);});
      box.appendChild(btn);
    });
  }

  function sync(){
    var status=q('#projectStatusFilter')?.value || '';
    var cat=q('#projectCategoryFilter')?.value || '';
    qa('[data-project-status]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-project-status')===status);
    });
    qa('[data-project-category]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-project-category')===cat);
    });

    var cards=qa('#projectStatusGrid .project-status-card');
    var count=q('#projectStatusV2Count');
    if(count) count.textContent=String(cards.length);
  }

  function resetAll(){
    var search=q('#projectStatusSearch');
    if(search){search.value='';trigger(search,'input');}
    setStatus('');
    setCategory('');
  }

  function init(){
    var filter=q('#projectStatusFilter');
    var cat=q('#projectCategoryFilter');
    var grid=q('#projectStatusGrid');
    if(!filter||!cat||!grid) return;

    qa('[data-project-status]').forEach(function(btn){
      btn.addEventListener('click',function(){
        setStatus(btn.getAttribute('data-project-status')||'');
      });
    });

    q('#projectStatusV2Reset')?.addEventListener('click',resetAll);
    filter.addEventListener('change',function(){setTimeout(sync,20);});
    cat.addEventListener('change',function(){setTimeout(sync,20);});
    q('#projectStatusSearch')?.addEventListener('input',function(){setTimeout(sync,20);});

    new MutationObserver(function(){
      if(cat.options.length>1 && !q('#projectStatusV2Categories [data-project-category]')) buildCategoryChips();
      setTimeout(sync,10);
    }).observe(grid,{childList:true,subtree:true});

    new MutationObserver(function(){
      if(cat.options.length>1 && !q('#projectStatusV2Categories [data-project-category]')) buildCategoryChips();
    }).observe(cat,{childList:true});

    setTimeout(buildCategoryChips,150);
    setTimeout(buildCategoryChips,600);
    setTimeout(sync,250);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
