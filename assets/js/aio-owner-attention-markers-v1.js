/* AIO TunerHub — owner action markers V1.
 * Read-only UI overlay on Owner Desk V3 / Layout V4.
 * Routine task markers reuse V3 counters. Security markers use owner-only
 * /api/aio-owner-attention and ONLY signals awaiting review, not all bans.
 * No data writes, permission changes or new admin actions.
 */
(()=>{'use strict';
  const ROOT=document.documentElement;
  const $=s=>document.querySelector(s);
  const TASKS={approvals:'support',pending:'posts',inbox:'inbox',resets:'resets',reports:'reports',lists:'lists'};
  const SECURITY_IDS=new Set(['v6-blocks','ip-policy-blocks','ip-denials','ip-history-pending','anonymous-bursts','distributed-anonymous']);
  const SECURITY_FEATURES={
    'security-center-v1':SECURITY_IDS,
    'wyszukiwarka-blokad':new Set(['v6-blocks','ip-policy-blocks','ip-denials','ip-history-pending']),
    'multikonta-blokady':new Set(['ip-policy-blocks','ip-denials','ip-history-pending']),
    'security-journal':new Set(['v6-blocks','ip-policy-blocks','ip-denials','anonymous-bursts','distributed-anonymous'])
  };
  let working=false,frame=0,lastSecurityRead=0,securityEntries=null,securityUnknown=false;
  const amount=s=>{const t=String(s??'').trim();if(!/\d/.test(t))return null;
    const n=Number(t.replace(/[^0-9]/g,''));return Number.isSafeInteger(n)?n:null;};
  const countFor=key=>{
    // V3 writes all its counters; use an existing V4 card as source, never a copied badge.
    const node=document.querySelector(`#aop4-dashboard .aop4-task [data-aop-count="${key}"]`);
    return amount(node?.textContent);
  };
  const flags=(node,number)=>{
    if(!node)return;
    const active=typeof number==='number'&&number>0;
    if(node.classList.contains('aop5-needs-attention')!==active)node.classList.toggle('aop5-needs-attention',active);
    let badge=Array.from(node.children).find(x=>x.classList?.contains('aop5-alert'));
    if(active){
      const label=`Wymaga uwagi: ${number.toLocaleString('pl-PL')} ${number===1?'sprawa':'spraw'}`;
      if(!badge){badge=document.createElement('span');badge.className='aop5-alert';badge.textContent='!';
        badge.setAttribute('role','img');node.append(badge);}
      if(badge.getAttribute('aria-label')!==label)badge.setAttribute('aria-label',label);
      if(node.getAttribute('data-aop5-items')!==String(number))node.setAttribute('data-aop5-items',String(number));
    }else{
      if(badge)badge.remove();if(node.hasAttribute('data-aop5-items'))node.removeAttribute('data-aop5-items');
    }
  };
  function group(name){return Array.from(document.querySelectorAll('#aop4-nav .aop4-nav-group'))
    .find(el=>el.querySelector('summary')?.textContent?.includes(name));}
  function securityCount(allowed){if(!securityEntries)return null;
    return securityEntries.filter(x=>allowed.has(x.id)).reduce((sum,x)=>sum+x.count,0);}
  function markNavAndCards(){
    for(const [id,key] of Object.entries(TASKS)){
      const count=countFor(key);
      document.querySelectorAll(`#aop4-dashboard .aop4-task[data-aop-go="${id}"],#aop4-nav .aop4-nav-item[data-aop-go="${id}"],#aop-nav .aop-nav-item[data-aop-go="${id}"]`)
        .forEach(node=>flags(node,count));
    }
    const actions=Object.values(TASKS).map(countFor);
    const actionTotal=actions.every(x=>x===null)?null:actions.reduce((s,x)=>s+(x||0),0);
    flags(group('Na co dzień')?.querySelector('summary'),actionTotal);
    flags($('#aop4-important')?.closest('.aop4-section')?.querySelector('.aop4-section-heading'),actionTotal);
    {
      for(const [id,ids] of Object.entries(SECURITY_FEATURES)){
        const count=securityCount(ids);
        const item=document.querySelector(`#aop4-dashboard .aop4-feature [data-aop-go="${id}"]`);
        flags(item?.closest('.aop4-feature'),count);
        document.querySelectorAll(`#aop4-nav .aop4-nav-item[data-aop-go="${id}"],#aop-nav .aop-nav-item[data-aop-go="${id}"]`)
          .forEach(node=>flags(node,count));
      }
      const sum=securityCount(SECURITY_IDS);
      flags(group('Bezpieczeństwo')?.querySelector('summary'),sum);
      flags($('#aop4-security')?.closest('.aop4-section')?.querySelector('.aop4-section-heading'),sum);
    }
    const status=$('#aop4-security')?.closest('.aop4-section')?.querySelector('.aop4-section-heading');
    if(status){
      let note=status.querySelector('.aop5-read-warning');
      if(securityUnknown){if(!note){note=document.createElement('small');note.className='aop5-read-warning';
        note.textContent='Niepełny odczyt alertów bezpieczeństwa';status.append(note);}}
      else if(note)note.remove();
    }
    const hero=$('#aop4-dashboard .aop4-hero-actions');
    if(hero && !hero.querySelector('.aop5-account-link')){
      const link=document.createElement('a');link.className='aop5-account-link';link.href='/konto.html?widok=konto';
      link.textContent='Ustawienia mojego konta ↗';link.title='Otwórz zwykły widok konta właściciela, bez przekierowania';hero.append(link);
    }
  }
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;markNavAndCards();});}
  async function readSecurity(){
    if(working||document.hidden)return;working=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('/api/aio-owner-attention',{credentials:'include',cache:'no-store',
        headers:{accept:'application/json'},signal:controller.signal});
      if(!response.ok)throw new Error('Brak danych');
      const data=await response.json();
      if(data?.ok!==true||!Array.isArray(data.items))throw new Error('Nieprawidłowa odpowiedź');
      securityEntries=data.items.filter(item=>SECURITY_IDS.has(item.id))
        .map(item=>({id:item.id,count:Math.max(0,Number(item.count)||0)}));
      securityUnknown=data.complete===false;
    }catch(_){securityEntries=null;securityUnknown=true;/* Do not turn failed reads into zero warnings. */}
    finally{clearTimeout(timer);working=false;lastSecurityRead=Date.now();schedule();}
  }
  function begin(){
    if(ROOT.dataset.aopV3!=='ready'||!$('#aop-v3')||!$('#aop4-dashboard')||!$('#aop4-nav'))return false;
    const shell=$('#aop-v3');
    const observer=new MutationObserver(()=>schedule());
    // V3 redraws counters and navigation, V4 recreates its own dashboard; all badges are idempotent.
    observer.observe(shell,{childList:true,characterData:true,subtree:true});
    schedule();void readSecurity();
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&Date.now()-lastSecurityRead>3*60*1000)void readSecurity();
    });
    document.addEventListener('click',event=>{
      if(event.target.closest('#aop-refresh-dash')||event.target.closest('#aop4-nav [data-aop-go="dashboard"]'))
        void readSecurity();
    });
    return true;
  }
  if(begin())return;
  const boot=new MutationObserver(()=>{if(begin())boot.disconnect();});
  boot.observe(ROOT,{subtree:true,attributes:true,childList:true,attributeFilter:['data-aop-v3','data-aop-v4']});
  setTimeout(()=>boot.disconnect(),16000);
})();
