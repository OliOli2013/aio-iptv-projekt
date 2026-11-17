/* AIO TunerHub Owner Unified V1.2: always-visible entry in Owner Hub.
 * Reuses the original /api/owner-unified-access status and release operation.
 */
(()=>{'use strict';
  if(window.__aioUnifiedShortcutV12)return;
  if(!/^\/owner-hub\/?$/i.test(location.pathname))return;
  window.__aioUnifiedShortcutV12=true;
  const $=(q,root=document)=>root.querySelector(q);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  async function api(url,body){
    const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{'accept':'application/json',...(body?{'content-type':'application/json'}:{})},
      ...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error(data.error||'Odpowiedź HTTP '+response.status);
    return data;
  }
  let allowed=false,modal=null,record=null,latest=null,busy=false;
  function button(label,cls,fn){const b=el('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;}
  function close(){if(modal){if(modal.open)modal.close();modal.remove();modal=null;}record=null;latest=null;}
  const fields=[['profile','Blokada profilu'],['blocked_ip','Blokady IP'],['strict_v42','Strict V4.2'],['ip_v8','IP Policy V8'],
    ['ip_v7','IP Policy V7'],['ip_claim_conflict','Konflikt przypisania IP'],['email_block','Blokada e-mail'],['security_v6','Security V6'],
    ['shared_download','Współdzielony dostęp'],['paid_download','Dostęp płatny'],['manual_review','AIO Review'],
    ['multikonta_review','Multikonta V2'],['email_verification','Weryfikacja e-mail']];
  function show(){
    if(!allowed)return;
    if(modal?.open)return;
    close();modal=el('dialog','aou12-dialog');
    const box=el('div','aou12-inner');modal.append(box);
    const top=el('div','aou12-top');top.append(el('h2','','Sprawdź i odblokuj konto'),button('Zamknij','aou12-close',close));box.append(top);
    box.append(el('p','aou12-hint','Podaj pełny e-mail albo ID konta. Narzędzie pokaże wszystkie znane ograniczenia i pozwoli zwolnić je jedną decyzją.'));
    const form=el('form','aou12-search'),input=el('input','aou12-input'),search=button('Sprawdź konto','aou12-action',()=>void lookup());
    input.type='search';input.placeholder='e-mail@example.com lub UUID';input.autocomplete='off';input.maxLength=254;input.required=true;
    form.append(input,search);form.addEventListener('submit',ev=>{ev.preventDefault();void lookup();});box.append(form);
    const feedback=el('p','aou12-feedback','');feedback.setAttribute('role','status');box.append(feedback);
    const info=el('section','aou12-result');info.hidden=true;box.append(info);
    const userTitle=el('h3','',''),userID=el('p','aou12-sub',''),status=el('p','aou12-verdict','');
    const grid=el('div','aou12-grid'),issues=el('div','aou12-issues');info.append(userTitle,userID,status,grid,issues);
    const label=el('label','aou12-label','Uzasadnienie decyzji'),reason=el('input','aou12-input');
    reason.value='Weryfikacja właściciela — przywrócenie dostępu do konta';reason.maxLength=300;label.append(reason);info.append(label);
    const controls=el('div','aou12-controls');
    const release=button('Odblokuj dostęp — wszystkie warstwy','aou12-action aou12-release',()=>void unblock());
    const more=button('Zarządzanie kontem i IP','aou12-secondary',()=>{
      const id=record?.id;if(!id)return;close();
      window.dispatchEvent(new CustomEvent('aio-owner-security-manage',{detail:{user_id:id}}));
    });
    controls.append(release,more);info.append(controls);
    box.append(el('p','aou12-fine','Sprawdzenie obejmuje znane sieci konta, nie dowodzi logowania z nowego IP ani nie omija Cloudflare WAF.'));
    async function render(){
      if(!record)return;
      const data=await api('/api/owner-unified-access?user_id='+encodeURIComponent(record.id));
      latest=data;info.hidden=false;userTitle.textContent=record.name+' — '+record.email;userID.textContent='ID: '+record.id;
      status.textContent=data.status==='no_known_blocks'?'Brak znanych aktywnych blokad':data.status==='blocked'?'Aktywne blokady konta':'Dostęp wymaga dodatkowej weryfikacji';
      grid.replaceChildren();issues.replaceChildren();
      for(const [key,title] of fields){const n=Number(data.signals?.[key]||0);const line=el('div','aou12-line');
        line.append(el('span','',title),el('strong',n?'aou12-alert':'aou12-clean',n?'Wymaga uwagi ('+n+')':'Brak'));grid.append(line);}
      for(const issue of data.issues||[])issues.append(el('p','',issue));
      release.disabled=!data.can_release;
      release.title=data.can_release?'Zwolnij blokady przypisane do tego konkretnego konta':'Sieć współdzielona lub cudza/globalna blokada — wymagane wyjaśnienie';
    }
    async function lookup(){
      if(busy)return;
      const q=input.value.trim();record=null;latest=null;info.hidden=true;
      if(!q){feedback.textContent='Podaj pełny adres e-mail lub ID konta.';return;}
      busy=true;search.disabled=true;feedback.textContent='Sprawdzam konto i zabezpieczenia…';
      try{const found=await api('/api/owner-unified-lookup?q='+encodeURIComponent(q));record=found.user;await render();feedback.textContent='Dane sprawdzone w D1.';}
      catch(e){feedback.textContent='Nie można sprawdzić: '+e.message;info.hidden=true;}
      finally{busy=false;search.disabled=false;}
    }
    async function unblock(){
      if(busy||!record||!latest?.can_release)return;
      const text=reason.value.trim();if(text.length<8){feedback.textContent='Wpisz powód (minimum 8 znaków).';return;}
      if(!confirm('Przywrócić dostęp do konta?\n'+record.name+'\n'+record.email+'\nID: '+record.id+'\n\nOperacja nie zwolni blokad innych kont ani cudzych sieci.'))return;
      busy=true;release.disabled=true;feedback.textContent='Zwolnienie blokad i ponowny odczyt wszystkich warstw…';
      try{const done=await api('/api/owner-unified-access',{action:'release_all',confirm:'ODBLOKUJ',user_id:record.id,email:record.email,reason:text});
        await render();feedback.textContent=done.message||'Zapisano decyzję.';}
      catch(e){feedback.textContent='Nie odblokowano: '+e.message;try{await render();}catch(_){} }
      finally{busy=false;if(latest)release.disabled=!latest.can_release;}
    }
    document.body.append(modal);
    modal.addEventListener('click',ev=>{if(ev.target===modal)close();});
    modal.showModal();input.focus();
  }
  function mount(){
    if(!allowed)return;
    const form=$('#aop-account-form');
    if(form&&!$('#aou12-side')){const b=button('Odblokuj użytkownika','aou12-sidebtn',show);b.id='aou12-side';
      b.title='Sprawdź dokładny e-mail lub ID oraz odblokuj wszystkie warstwy';form.insertAdjacentElement('afterend',b);}
    const dashboard=$('#aop-dashboard');
    if(dashboard&&!dashboard.querySelector('#aou12-dashboard')){
      const callout=el('section','aou12-dashboard');callout.id='aou12-dashboard';
      const text=el('div','');text.append(el('strong','','Sprawdź i odblokuj konto'),el('p','','Jeden status dostępu i jedna decyzja. Wyszukaj użytkownika po e-mailu lub ID.'));
      callout.append(text,button('Otwórz odblokowanie','aou12-action',show));
      const anchor=dashboard.querySelector('.aop5-searchbox')||dashboard.querySelector('.aop5-intro')||dashboard.firstElementChild;
      if(anchor)anchor.insertAdjacentElement('afterend',callout);else dashboard.prepend(callout);
    }
  }
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled||!allowed)return;scheduled=true;
    queueMicrotask(()=>{scheduled=false;mount();});
  });
  async function boot(){
    try{const auth=await api('/api/community-auth');allowed=auth.authenticated===true&&auth.user?.is_owner===true&&auth.user?.role==='admin';
      if(!allowed)return;
      mount();observer.observe(document.body,{subtree:true,childList:true});
    }catch(e){console.warn('[AIO unified shortcut]',String(e?.message||e));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
})();
