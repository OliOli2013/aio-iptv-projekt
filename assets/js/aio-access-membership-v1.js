/* AIO Access Membership V1 — display only; never grants or extends an entitlement.
 * Dates and status always come from /api/aio-account-access (Cloudflare/D1).
 */
(()=>{'use strict';
  if(window.__aioAccessMembershipV1)return;
  window.__aioAccessMembershipV1=true;
  const account=document.querySelector('.aio-account-status');
  if(!account)return;
  const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;};
  const root=el('section','aam1-membership');
  root.id='aio-membership-status';root.hidden=true;root.setAttribute('aria-label','Odznaka i ważność dostępu do pobierania');
  account.insertAdjacentElement('afterend',root);
  const fmt=iso=>new Intl.DateTimeFormat('pl-PL',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Warsaw'}).format(new Date(iso));
  let requestNumber=0,reminderKey='';
  function clear(){root.hidden=true;root.replaceChildren();reminderKey='';}
  async function refresh(){
    const mine=++requestNumber;
    try{
      const response=await fetch('/api/aio-account-access',{credentials:'include',cache:'no-store',headers:{'Accept':'application/json'}});
      if(!response.ok)throw Error('status');
      const data=await response.json();
      if(mine!==requestNumber)return;
      const expiry=Date.parse(data.expires_at||'');
      const source=String(data.source||'');
      const vip=data.vip===true;
      const seven=['verified_receipt','owner_verified_support','owner_manual_grant'].includes(source);
      const kind=data.authenticated&&data.email_verified!==false&&data.owner!==true&&Number.isFinite(expiry)&&expiry>Date.now()?(vip?'vip':seven?'seven':null):null;
      if(!kind){clear();return;}
      root.hidden=false;root.replaceChildren();root.classList.toggle('aam1-vip',kind==='vip');root.classList.toggle('aam1-seven',kind==='seven');
      const top=el('div','aam1-top');
      const mark=el('span','aam1-mark',kind==='vip'?'★ AIO VIP':'✦ AIO 7 DNI');
      const caption=el('div','aam1-caption');
      caption.append(el('strong','',kind==='vip'?'Konto VIP — 30 dni':'Dostęp bez limitu — 7 dni'),el('span','',`Ważne do: ${fmt(data.expires_at)}`));
      top.append(mark,caption);root.append(top);
      if(data.restricted===true)root.append(el('p','aam1-restricted','Uprawnienie jest aktywne, ale pobieranie zostało czasowo ograniczone ze względów bezpieczeństwa.'));
      const remaining=expiry-Date.now();
      if(remaining<=24*60*60*1000){
        const warn=el('div','aam1-warning');
        warn.setAttribute('role','status');
        warn.append(el('strong','','⏳ Ostatnie 24 godziny ważności dostępu'),
          el('p','',`Twój ${kind==='vip'?'VIP':'7-dniowy dostęp'} wkrótce wygaśnie (${fmt(data.expires_at)}). Jeżeli chcesz nadal korzystać z nielimitowanego pobierania, wesprzyj projekt i zgłoś wpłatę do weryfikacji administracji.`));
        const link=el('a','aam1-support','Wesprzyj projekt i przedłuż dostęp →');link.href='/support.html#wesprzyj-projekt';warn.append(link);
        root.append(warn);
        const key=kind+'|'+data.expires_at;
        if(reminderKey!==key){reminderKey=key;document.dispatchEvent(new Event('aio-owner-messages-updated'));}
      }else{reminderKey='';}
    }catch(_){if(mine===requestNumber)clear();}
  }
  function force(){requestNumber++;clear();void refresh();}
  document.addEventListener('aio-community-auth',force);
  document.addEventListener('aio-community-ready',()=>void refresh());
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.setInterval(()=>{if(!document.hidden)void refresh();},60000);
  void refresh();
})();
