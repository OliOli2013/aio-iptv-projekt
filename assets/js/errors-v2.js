/* AIO Errors V2 — UX layer, database renderer stays in project-studio.js */
(function(){
  'use strict';

  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel));}

  function trigger(el,type){
    if(el) el.dispatchEvent(new Event(type,{bubbles:true}));
  }

  function setSeverity(value){
    var select=q('#errorSeverity');
    if(!select) return;
    select.value=value;
    trigger(select,'change');
    qa('[data-errors-severity]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-errors-severity')===value);
    });
  }

  function setCategory(value){
    var select=q('#errorCategory');
    if(!select) return;
    select.value=value;
    trigger(select,'change');
    qa('[data-errors-category]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-errors-category')===value);
    });
  }

  function setSearch(value){
    var input=q('#errorSearch');
    if(!input) return;
    input.value=value;
    trigger(input,'input');
    input.focus();
  }

  function buildCategoryChips(){
    var select=q('#errorCategory');
    var box=q('#errorsV2Categories');
    if(!select||!box) return;
    var opts=Array.from(select.options).filter(function(o){return o.value;});
    if(!opts.length) return;

    box.innerHTML='';
    var all=document.createElement('button');
    all.type='button'; all.className='errors-v2-chip is-active'; all.dataset.errorsCategory='';
    all.textContent='Wszystkie';
    all.addEventListener('click',function(){setCategory('');});
    box.appendChild(all);

    opts.forEach(function(opt){
      var btn=document.createElement('button');
      btn.type='button'; btn.className='errors-v2-chip';
      btn.dataset.errorsCategory=opt.value; btn.textContent=opt.textContent;
      btn.addEventListener('click',function(){setCategory(opt.value);});
      box.appendChild(btn);
    });
  }

  function expandAll(open){
    qa('#errorDatabase .error-card').forEach(function(card){card.open=open;});
  }

  function syncFromSelects(){
    var sev=q('#errorSeverity')?.value || '';
    var cat=q('#errorCategory')?.value || '';
    qa('[data-errors-severity]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-errors-severity')===sev);
    });
    qa('[data-errors-category]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-errors-category')===cat);
    });
  }

  function init(){
    var cat=q('#errorCategory');
    var sev=q('#errorSeverity');
    var db=q('#errorDatabase');
    if(!cat||!sev||!db) return;

    qa('[data-errors-severity]').forEach(function(btn){
      btn.addEventListener('click',function(){setSeverity(btn.getAttribute('data-errors-severity')||'');});
    });

    qa('[data-error-query]').forEach(function(btn){
      btn.addEventListener('click',function(){setSearch(btn.getAttribute('data-error-query')||'');});
    });

    q('#errorsV2Expand')?.addEventListener('click',function(){expandAll(true);});
    q('#errorsV2Collapse')?.addEventListener('click',function(){expandAll(false);});
    q('#errorsV2Reset')?.addEventListener('click',function(){
      setSearch('');
      setSeverity('');
      setCategory('');
    });

    cat.addEventListener('change',syncFromSelects);
    sev.addEventListener('change',syncFromSelects);

    new MutationObserver(function(){
      if(cat.options.length>1 && !q('#errorsV2Categories [data-errors-category]')) buildCategoryChips();
    }).observe(cat,{childList:true});

    setTimeout(buildCategoryChips,150);
    setTimeout(buildCategoryChips,600);
    setTimeout(syncFromSelects,200);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
