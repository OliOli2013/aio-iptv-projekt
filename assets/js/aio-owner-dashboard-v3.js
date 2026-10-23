/* AIO Owner Account Dashboard V3 — short, actionable owner-only account view.
 * Read-only: decisions, older messages and all management remain in /owner-hub.
 * All source APIs authorize the owner server-side; no entitlement is changed here.
 */
(()=>{'use strict';
  if(window.__aioOwnerAccountDashboardV3)return;
  window.__aioOwnerAccountDashboardV3=true;
  const AUTH='/api/community-auth';
  const ATTENTION='/api/aio-owner-attention';
  const INBOX='/api/list-inbox?scope=admin';
  const HEALTH='/api/aio-health';
  const FULL='/owner-hub';
  const SECURITY=new Set(['security-holds','v6-blocks','ip-policy-blocks','ip-denials','ip-history-pending','anonymous-bursts']);
  const $=(selector,scope=document)=>scope.querySelector(selector);
  const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
  const fmt=iso=>{const n=Date.parse(iso||'');return Number.isFinite(n)?new Date(n).toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'}):'';};
  const digits=n=>Math.max(0,Number(n)||0).toLocaleString('pl-PL');
  const safeHref=h=>/^\/(?:owner-hub(?:#panel=[a-z0-9-]+)?|owner-support-intents\.html|aio-security-center\.html|aio-list-upload\.html#aluAdmin)$/.test(String(h||''));
  const typed=(url,timeout=14000)=>{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
    return fetch(url,{credentials:'include',cache:'no-store',headers:{accept:'application/json'},signal:ac.signal})
      .then(async r=>{const d=await r.json().catch(()=>null);return {status:r.status,ok:r.ok,data:d};})
      .finally(()=>clearTimeout(timer));
  };
  let root=null,owner=false,epoch=0,working=false,pending=false,last=0;
  let fields={};
  function link(label,href,cls=''){
    const a=el('a','aod3-link '+cls,label);a.href=href;return a;
  }
  function section(title,id){
    const box=el('section','aod3-section');box.dataset.aodSection=id;
    box.append(el('h3','',title));return box;
  }
  function build(){
    if(root)return;
    const host=$('.aio-account-main'),anchor=$('.aio-account-notice');
    if(!host||!anchor)return;
    root=el('section','aod3');root.id='aio-owner-attention-panel';
    root.setAttribute('aria-labelledby','aod3-title');
    const head=el('div','aod3-head'),intro=el('div','aod3-intro');
    intro.append(el('p','aod3-eyebrow','TYLKO DLA WŁAŚCICIELA'));
    const title=el('h2','','Pulpit spraw wymagających uwagi');title.id='aod3-title';intro.append(title);
    intro.append(el('p','aod3-lead','Tutaj widzisz tylko nowe wiadomości, oczekujące decyzje i istotne alerty. Pełna korespondencja, historia i narzędzia są w Centrum Właściciela.'));
    const actions=el('div','aod3-actions'),reload=el('button','aod3-button','↻ Odśwież');reload.type='button';
    reload.addEventListener('click',()=>void refresh(true));actions.append(reload,link('Pełne Centrum →',FULL,'aod3-primary'));
    head.append(intro,actions);root.append(head);
    const counters=el('div','aod3-counters');
    const metrics=[['all','Do obsłużenia'],['messages','Nowe wiadomości'],['security','Bezpieczeństwo'],['other','Inne decyzje']];
    for(const [key,label] of metrics){const card=el('div','aod3-counter');card.append(el('span','aod3-counter-name',label));
      const number=el('strong','aod3-counter-value','—');number.dataset.aodCount=key;card.append(number);counters.append(card);}
    root.append(counters);
    const state=el('p','aod3-state','Sprawdzam aktualne zgłoszenia…');state.dataset.aodState='';state.setAttribute('role','status');state.setAttribute('aria-live','polite');root.append(state);
    const msgs=section('✉ Nowe wiadomości od użytkowników','messages');
    msgs.append(el('div','aod3-entries'));msgs.append(link('Otwórz skrzynkę w Pełnym Centrum →','/owner-hub#panel=inbox','aod3-section-footer'));
    const sec=section('⛨ Bezpieczeństwo — wymaga uwagi','security');sec.append(el('div','aod3-entries'));
    sec.append(link('Centrum Bezpieczeństwa →','/aio-security-center.html','aod3-section-footer'));
    const tasks=section('▤ Decyzje i moderacja','tasks');tasks.append(el('div','aod3-entries'));
    const grid=el('div','aod3-grid');grid.append(msgs,sec,tasks);root.append(grid);
    const footer=el('div','aod3-footer');
    const health=el('p','aod3-health','Stan D1 i R2: sprawdzanie…');health.dataset.aodHealth='';
    footer.append(health,link('Przejdź do Pełnego Centrum →',FULL,'aod3-secondary'));root.append(footer);
    anchor.after(root);
    fields={state,health,grid,msgs,sec,tasks,reload};
    if(location.hash==='#aio-owner-attention-panel')requestAnimationFrame(()=>root?.scrollIntoView({block:'start'}));
  }
  function reset(){root?.remove();root=null;fields={};owner=false;working=false;pending=false;last=0;document.body.classList.remove('aio-owner-dashboard-v3-active');}
  function counter(key,text){const n=$('[data-aod-count="'+key+'"]',root);if(n)n.textContent=text;}
  function messageRow(msg){
    const a=link('', '/owner-hub#panel=inbox','aod3-item');a.setAttribute('aria-label','Otwórz nową wiadomość');
    const wrap=el('div','aod3-item-text');wrap.append(el('strong','',msg.subject||'Wiadomość bez tematu'));
    const kind={submission:'Nowa lista',update:'Aktualizacja listy',contact:'Kontakt'}[msg.kind]||'Wiadomość';
    wrap.append(el('small','',String(msg.sender_name||'Użytkownik')+' • '+kind+(fmt(msg.created_at)?' • '+fmt(msg.created_at):'')));
    a.append(wrap,el('span','aod3-arrow','Otwórz →'));return a;
  }
  function taskRow(item){
    const a=link('',safeHref(item.href)?item.href:FULL,'aod3-item');
    const wrap=el('div','aod3-item-text');wrap.append(el('strong','',item.title||'Sprawa do obsłużenia'));
    wrap.append(el('small','',String(item.detail||'')+(fmt(item.latest)?' • '+fmt(item.latest):'')));
    a.append(el('span','aod3-pill',digits(item.count)),wrap,el('span','aod3-arrow','Przejdź →'));return a;
  }
  function empty(parent,text){parent.append(el('p','aod3-empty',text));}
  function setErrorArea(area,text){const list=$('.aod3-entries',area);list.replaceChildren();empty(list,text);}
  function order(a,b){const ah=a.priority==='high'?1:0,bh=b.priority==='high'?1:0;
    if(ah!==bh)return bh-ah;return (Date.parse(b.latest||'')||0)-(Date.parse(a.latest||'')||0);}
  function showData(att,inbox,health){
    const missing=[];
    const a=att?.ok && att.data?.ok===true ? att.data:null;
    const m=inbox?.ok && inbox.data?.ok===true ? inbox.data:null;
    const h=health?.data;
    if(!a)missing.push('licznika spraw');
    if(!m)missing.push('skrzynki wiadomości');
    if(!health || !health.ok || h?.ok!==true)missing.push('kontroli usług');
    if(a && Array.isArray(a.unavailable) && a.unavailable.length)missing.push('części źródeł zgłoszeń');
    const all=a?Math.max(0,Number(a.total)||0):null;
    const items=a&&Array.isArray(a.items)?a.items.filter(x=>Number(x.count)>0):[];
    const messageItem=items.find(x=>x.id==='messages');
    const security=items.filter(x=>SECURITY.has(x.id));
    const other=items.filter(x=>x.id!=='messages'&&!SECURITY.has(x.id));
    const sum=arr=>arr.reduce((n,x)=>n+Math.max(0,Number(x.count)||0),0);
    counter('all',all===null?'—':(a.complete===false?'≥ ':'')+digits(all));
    counter('messages',a?digits(messageItem?.count||0):m?digits(m.unread):'—');
    counter('security',a?digits(sum(security)):'—');counter('other',a?digits(sum(other)):'—');
    const msgList=$('.aod3-entries',fields.msgs);msgList.replaceChildren();
    if(m){
      const unread=(m.items||[]).filter(x=>x.status==='new');
      if(unread.length)unread.slice(0,3).forEach(x=>msgList.append(messageRow(x)));
      else empty(msgList,'✓ Brak nowych wiadomości. Przeczytane wiadomości pozostają w Pełnym Centrum.');
      if(unread.length>3 || Number(m.unread)>3)msgList.append(el('p','aod3-more','Wyświetlono 3 najnowsze. Wszystkie nowe wiadomości znajdziesz w skrzynce.'));
      if(a&&Number(messageItem?.count||0)!==Number(m.unread||0))missing.push('zgodności liczników wiadomości');
    }else setErrorArea(fields.msgs,'Nie udało się odczytać nowych wiadomości. Nie oznacza to, że skrzynka jest pusta.');
    for(const [area,records] of [[fields.sec,security],[fields.tasks,other]]){
      const list=$('.aod3-entries',area);list.replaceChildren();
      if(!a)empty(list,'Nie udało się odczytać tych spraw. Otwórz Pełne Centrum.');
      else if(!records.length)empty(list,'✓ Brak nowych spraw wymagających działania.');
      else records.sort(order).forEach(x=>list.append(taskRow(x)));
    }
    fields.health.textContent=health?.ok&&h?.ok===true?'● D1 i magazyn R2 odpowiadają prawidłowo.':'⚠ Stan D1/R2 niepotwierdzony lub usługi zgłaszają problem.';
    fields.health.classList.toggle('aod3-warning',!(health?.ok&&h?.ok===true));
    fields.state.textContent=(a?'Odczyt '+new Date().toLocaleTimeString('pl-PL')+'. ':'Nie udało się odczytać zgłoszeń. ')+
      (missing.length?'Uwaga: dane niepełne ('+[...new Set(missing)].join(', ')+').':'Pokazano tylko bieżące sprawy. Otwarcie pulpitu niczego nie oznacza jako przeczytane.');
    fields.state.classList.toggle('aod3-warning',missing.length>0);
  }
  async function refresh(force=false){
    if(!owner||!root)return;
    if(working){pending=true;return;}
    if(!force && Date.now()-last<45000)return;
    const current=epoch;working=true;fields.reload.disabled=true;
    try{
      const results=await Promise.allSettled([typed(ATTENTION),typed(INBOX),typed(HEALTH)]);
      if(!owner||current!==epoch||!root)return;
      const value=i=>results[i].status==='fulfilled'?results[i].value:null;
      if([value(0),value(1)].some(x=>x&&(x.status===401||x.status===403))){reset();return;}
      showData(value(0),value(1),value(2));last=Date.now();
    }catch(_){if(root&&owner&&current===epoch){fields.state.textContent='Nie udało się odświeżyć pulpitu. Sprawdź Pełne Centrum.';fields.state.classList.add('aod3-warning');}}
    finally{working=false;if(root)fields.reload.disabled=false;if(pending&&owner){pending=false;void refresh(true);}}
  }
  async function sync(){
    const current=++epoch;
    reset(); // Clear owner-only content immediately during logout or session switch.
    try{
      const response=await typed(AUTH);
      if(current!==epoch)return;
      const d=response.data;
      const allowed=!!(response.ok&&d?.authenticated===true&&d?.user?.is_owner===true&&d?.email_verified===true);
      if(!allowed){reset();return;}
      owner=true;document.body.classList.add('aio-owner-dashboard-v3-active');build();void refresh(true);
    }catch(_){if(current===epoch)reset();}
  }
  function boot(){
    void sync();
    document.addEventListener('aio-community-ready',()=>void sync());
    document.addEventListener('aio-community-auth',()=>void sync());
    window.addEventListener('focus',()=>{if(owner&&!document.hidden)void refresh();});
    document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh();});
    window.setInterval(()=>{if(owner&&!document.hidden)void refresh(true);},120000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
