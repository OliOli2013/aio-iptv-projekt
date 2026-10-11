/* AIO Mascot V2 -> Existing AI Chat: prefill only, never submit automatically. */
(function(){
  'use strict';
  const KEY='aio_mascot_v2_chat_draft';
  function init(){
    const field=document.getElementById('inlineAiInput');
    if(!field) return;
    let draft='';
    try{ draft=sessionStorage.getItem(KEY)||''; sessionStorage.removeItem(KEY); }catch(_){}
    if(!draft) return;
    field.value=draft.slice(0,800);
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.focus({preventScroll:true});
    const form=document.getElementById('inlineAiForm');
    if(form) form.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
