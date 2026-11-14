/* AIO Security Core V1.2 — read-only preview inside verified Owner Hub.
 * No public route, no privilege escalation and no requests that change state.
 */
(()=>{'use strict';
  const id='aio-owner-core-preview-v12';
  const keys=[['profiles','Blokady profili'],['strict_v4','Strict V4'],['ip_v8','IP V8'],
    ['v6','Blokady V6'],['multikonta','Weryfikacja multikont'],['manual_related','Powiązane ręcznie']];
  const panel=()=>document.getElementById(id);
  const status=(el,message)=>{const target=el.querySelector('[data-core-status]');if(target)target.textContent=message;};
  async function reload(el){
    if(el.dataset.loading==='1')return;
    el.dataset.loading='1';
    const button=el.querySelector('[data-core-reload]');if(button)button.disabled=true;
    status(el,'Odczytuję aktualne dane z serwera…');
    try{
      const res=await fetch('/api/aio-security-core',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const data=await res.json();
      if(!res.ok||data?.ok!==true)throw new Error('Odczyt niedostępny. Sprawdź pełny moduł Security Core.');
      for(const [key] of keys){
        const elem=el.querySelector('[data-core-count="'+key+'"]');
        if(elem){const value=data.active_holds_by_source?.[key];elem.textContent=Number.isInteger(value)?value.toLocaleString('pl-PL'):'—';}
      }
      status(el,'Ostatni odczyt: '+new Date(data.generated_at).toLocaleString('pl-PL')+'. Różne typy blokad mogą dotyczyć tych samych kont.');
    }catch(err){status(el,err.message||'Nie udało się pobrać danych.');}
    finally{el.dataset.loading='0';if(button)button.disabled=false;}
  }
  function mount(){
    // Owner Desk V3 sets this flag only after server-verified owner authentication.
    if(document.documentElement.dataset.aopV3!=='ready')return false;
    const root=document.getElementById('aop4-dashboard');
    if(!root)return false;
    if(panel())return true;
    const section=document.createElement('section');section.className='aop4-section';section.id=id;
    section.setAttribute('aria-label','AIO Security Core — podgląd właściciela');
    const heading=document.createElement('div');heading.className='aop4-section-heading';
    const title=document.createElement('div');
    const label=document.createElement('span');label.className='aop4-eyebrow';label.textContent='BEZPIECZEŃSTWO · PODGLĄD';
    const h2=document.createElement('h2');h2.textContent='Security Core V1';title.append(label,h2);
    const open=document.createElement('a');open.href='/aio-security-core.html';open.textContent='Otwórz pełny raport ↗';heading.append(title,open);
    const desc=document.createElement('p');desc.textContent='Bieżące odczyty blokad z D1. To podgląd wyłącznie do odczytu; nie zmienia żadnych kont ani limitów.';
    const grid=document.createElement('div');grid.className='aop4-feature-grid';
    for(const [key,name] of keys){
      const article=document.createElement('article');article.className='aop4-feature';
      const strong=document.createElement('strong');strong.style.fontSize='1.65rem';strong.dataset.coreCount=key;strong.textContent='—';
      const tag=document.createElement('p');tag.textContent=name;article.append(strong,tag);grid.append(article);
    }
    const footer=document.createElement('div');footer.className='aop4-section-heading';
    const msg=document.createElement('p');msg.className='aop4-footnote';msg.dataset.coreStatus='';msg.setAttribute('role','status');msg.textContent='Oczekiwanie na odczyt…';
    const btn=document.createElement('button');btn.type='button';btn.dataset.coreReload='';btn.textContent='↻ Odśwież';btn.addEventListener('click',()=>reload(section));footer.append(msg,btn);
    section.append(heading,desc,grid,footer);
    const security=document.getElementById('aop4-security');
    const existing=security?.closest('.aop4-section');
    if(existing)existing.insertAdjacentElement('afterend',section);else root.append(section);
    void reload(section);return true;
  }
  // Dashboard may be rebuilt; observe it without changing owner routing.
  const observer=new MutationObserver(()=>{void mount();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void mount(),{once:true});
  else void mount();
})();
