/* AIO Poradniki V1 — copy command controls without disabling site-wide protection. */
(() => {
  'use strict';
  if(window.__AIO_GUIDE_TOOLS_V1__)return;
  window.__AIO_GUIDE_TOOLS_V1__=true;
  const $all=(s,root=document)=>Array.from(root.querySelectorAll(s));
  function toast(button,msg){
    const original=button.dataset.originalLabel||button.textContent;
    button.dataset.originalLabel=original;
    button.textContent=msg;
    window.setTimeout(()=>{if(button.isConnected)button.textContent=original;},1800);
  }
  async function copy(value){
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true;}}catch(_){}
    try{
      const ta=document.createElement('textarea');ta.className='aio-allow-copy';ta.value=value;ta.setAttribute('readonly','');
      ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();
      const ok=document.execCommand('copy');ta.remove();return ok;
    }catch(_){return false;}
  }
  function init(){
    const shell=document.querySelector('main.content-main, main#main-content');
    if(!shell)return;
    // Only explicit code blocks; never expose credentials or select whole article content.
    $all('pre',shell).forEach(pre=>{
      if(pre.closest('[data-aio-guide-code]')||pre.closest('[data-aio-no-copy]'))return;
      const code=pre.querySelector('code');
      const value=(code||pre).textContent.trim();
      if(!value||value.length>10000)return;
      const bar=document.createElement('div');bar.className='aio-guide-copybar';bar.setAttribute('data-aio-guide-code','');
      const lbl=document.createElement('span');lbl.textContent='Polecenie / kod';
      const btn=document.createElement('button');btn.type='button';btn.className='aio-guide-copy-button aio-allow-copy';btn.setAttribute('data-copy','');
      btn.textContent='Kopiuj';btn.setAttribute('aria-label','Skopiuj polecenie');
      btn.addEventListener('click',async()=>toast(btn,await copy(value)?'Skopiowano ✓':'Nie udało się skopiować'));
      bar.append(lbl,btn);pre.parentNode.insertBefore(bar,pre);
      pre.classList.add('aio-guide-codeblock');
    });
    // Utility jump link only on pages with steps. Does not alter article text or prints.
    const steps=shell.querySelector('.steps-list, .module ol');
    const hero=shell.querySelector('.hero-compact .action-row');
    if(steps&&hero&&!hero.querySelector('[data-aio-guide-jump]')){
      const section=steps.closest('section')||steps;
      if(!section.id)section.id='aio-guide-kroki';
      const link=document.createElement('a');link.href='#'+section.id;link.textContent='Przejdź do kroków ↓';
      link.className='aio-guide-jump';link.setAttribute('data-aio-guide-jump','');
      hero.append(link);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
