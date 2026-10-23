/* AIO Owner Attention V1 — only Moje konto, owner-only, read-only. */
(()=>{'use strict';
  const AUTH='/api/community-auth', API='/api/aio-owner-attention';
  const $=s=>document.querySelector(s);
  const make=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;};
  let root=null,trigger=null,list=null,note=null,count=null,owner=false,seq=0,busy=false;
  let lastRefresh=0,interacted=false,firstLoad=true,rerun=false;

  async function getJson(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
      const r=await fetch(url,{credentials:'include',cache:'no-store',signal:controller.signal});
      const data=await r.json().catch(()=>null);
      if(!r.ok || !data || data.ok===false){const e=new Error('HTTP '+r.status);e.status=r.status;throw e;}
      return data;
    }finally{clearTimeout(timer);}
  }
  function removeUI(){
    root?.remove();trigger?.remove();root=trigger=list=note=count=null;
    busy=false;rerun=false;lastRefresh=0;firstLoad=true;interacted=false;
  }
  function renderUI(){
    if(root)return;
    const heading=$('.aio-account-heading'),status=$('.aio-account-status');
    if(!heading||!status)return;
    trigger=make('button','aoa1-trigger');trigger.type='button';
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-controls','aio-owner-attention-panel');
    const bell=make('span','aoa1-bell','♧');bell.textContent='🔔';bell.setAttribute('aria-hidden','true');
    const label=make('span','aoa1-trigger-label','Sprawy właściciela');
    count=make('span','aoa1-count','…');count.setAttribute('aria-label','Liczba spraw wymagających uwagi');
    trigger.append(bell,label,count);
    heading.append(trigger);

    root=make('section','aoa1-panel');root.id='aio-owner-attention-panel';
    root.hidden=true;root.setAttribute('aria-label','Powiadomienia właściciela');
    const top=make('div','aoa1-top');
    const title=make('h2','','🔔 Sprawy wymagające uwagi');
    const manual=make('button','aoa1-reload','↻ Odśwież');manual.type='button';
    manual.addEventListener('click',()=>void refresh(true));
    top.append(title,manual);
    note=make('p','aoa1-note','Sprawdzam zgłoszenia…');note.setAttribute('role','status');
    list=make('div','aoa1-list');
    const foot=make('p','aoa1-foot','Licznik pokazuje sprawy nadal oczekujące. Samo otwarcie listy niczego nie zatwierdza ani nie usuwa. Zgłoszenie wpłaty nie oznacza jej otrzymania.');
    root.append(top,note,list,foot);
    status.after(root);

    /* AIO OWNER BELL V1 DEEP LINK */
    if(location.hash==='#aio-owner-attention-panel'){
      interacted=true;setOpen(true);
      requestAnimationFrame(()=>root?.scrollIntoView({block:'start'}));
    }
    trigger.addEventListener('click',()=>{
      interacted=true;
      root.hidden=!root.hidden;
      trigger.setAttribute('aria-expanded',String(!root.hidden));
      if(!root.hidden)void refresh();
    });
  }
  function addRow(item){
    const href=String(item.href||'');
    // Navigation is limited to approved same-site owner destinations.
    if(!/^\/(?:owner-hub(?:#panel=[a-z0-9-]+)?|owner-support-intents\.html|aio-security-center\.html|aio-list-upload\.html#aluAdmin)$/.test(href))return;
    const link=make('a','aoa1-row',undefined);link.href=href;
    const sym=make('span','aoa1-symbol',String(item.icon||'!'));sym.setAttribute('aria-hidden','true');
    const body=make('span','aoa1-copy');body.append(make('strong','',item.title||'Sprawa do obsłużenia'),make('small','',item.detail||''));
    const tally=make('span','aoa1-number',String(item.count||0));
    const arrow=make('span','aoa1-arrow','Otwórz →');
    link.append(sym,body,tally,arrow);list.append(link);
  }
  function setOpen(open){root.hidden=!open;trigger.setAttribute('aria-expanded',String(open));}
  function showError(message){if(!root)return;note.textContent=message;note.classList.add('is-warning');}
  async function refresh(force=false){
    if(!owner || !root)return;
    if(busy){rerun=true;return;}
    if(!force&&Date.now()-lastRefresh<25000)return;
    busy=true;const current=seq;
    try{
      const [result,health]=await Promise.allSettled([
        getJson(API),
        // Shallow health check only (D1 + community media). Not historical Cloudflare logs.
        fetch('/api/aio-health',{cache:'no-store',credentials:'include'})
      ]);
      if(current!==seq||!owner||!root)return;
      if(result.status==='rejected'){
        if([401,403].includes(result.reason?.status)){owner=false;removeUI();return;}
        showError('Nie udało się odczytać aktualnych zgłoszeń. Spróbuj ponownie.');
        count.textContent='!';count.classList.add('is-alert');return;
      }
      const data=result.value;
      list.replaceChildren();
      let total=Number(data.total)||0;
      const categories=Array.isArray(data.items)?data.items:[];
      categories.sort((a,b)=>(a.priority==='high'?0:1)-(b.priority==='high'?0:1));
      categories.forEach(addRow);
      const errors=[];
      if(health.status==='fulfilled'){
        if(health.value.status>=500){
          total+=1;
          const card=make('a','aoa1-row aoa1-critical');card.href='/owner-hub#panel=security-journal';
          card.append(make('span','aoa1-symbol','!'),make('span','aoa1-copy','Podstawowa kontrola D1 / multimediów zgłasza problem'),make('span','aoa1-number','1'),make('span','aoa1-arrow','Sprawdź →'));
          list.prepend(card);
        }
        else if(!health.value.ok)errors.push('Kontrola stanu usług: odpowiedź HTTP '+health.value.status+'.');
      }else{errors.push('Nie udało się wykonać kontroli stanu usług.');}
      if(Array.isArray(data.unavailable) && data.unavailable.length)errors.push('Nie udało się odczytać: '+data.unavailable.join(', ')+'.');
      if(!list.children.length)list.append(make('p','aoa1-empty',errors.length?'Brak wykrytych spraw w dostępnych źródłach.':'✓ Brak spraw wymagających działania.'));
      count.textContent=total>99?'99+':String(total);
      count.classList.toggle('is-alert',total>0);
      note.classList.toggle('is-warning',errors.length>0);
      note.textContent=(total>0?`${total} spraw wymagających uwagi. `:'Brak oczekujących spraw. ')+
        'Odczyt: '+new Date().toLocaleTimeString('pl-PL')+'.'+(errors.length?' '+errors.join(' '):'');
      if(firstLoad && total>0 && !interacted)setOpen(true);
      firstLoad=false;lastRefresh=Date.now();
      // This is only an in-page indicator. No external push or e-mail is sent.
    }catch(error){if(current===seq)showError('Błąd wyświetlania powiadomień.');}
    finally{busy=false;if(rerun&&owner){rerun=false;void refresh(true);}}
  }
  async function sync(){
    const current=++seq;
    try{
      const session=await getJson(AUTH);
      if(current!==seq)return;
      const allowed=session.authenticated===true && session.email_verified===true && session.user?.is_owner===true;
      if(!allowed){owner=false;removeUI();return;}
      owner=true;renderUI();void refresh(true);
    }catch(_){
      if(current!==seq)return;
      // Fail closed: never display last owner's notifications after auth failure.
      owner=false;removeUI();
    }
  }
  function boot(){
    void sync();
    document.addEventListener('aio-community-auth',()=>void sync());
    document.addEventListener('aio-community-ready',()=>void sync());
    window.addEventListener('focus',()=>{if(owner&&!document.hidden)void refresh();});
    document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh();});
    setInterval(()=>{if(owner&&!document.hidden)void refresh(true);},90000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
