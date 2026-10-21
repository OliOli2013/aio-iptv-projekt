/* AIO Centrum Wlasciciela V2 — unified, read-only owner overview.
 * All administrative source APIs enforce owner/admin permissions server-side.
 * No payments are claimed to be confirmed on the basis of access requests.
 */
(()=>{'use strict';
  const $=(sel,root=document)=>root.querySelector(sel);
  const create=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;};
  const sections=[
    {id:'lists',name:'Listy kanałów',icon:'▦',href:'/aio-list-upload.html#aluAdmin',description:'Zgłoszenia ZIP, aktualizacje i moderacja'},
    {id:'messages',name:'Wiadomości',icon:'✉',href:'/community-admin.html?aio_section=inbox',description:'Wiadomości i korespondencja użytkowników'},
    {id:'support',name:'Wsparcie AIO',icon:'♡',href:'/community-admin.html?aio_section=approvals',description:'Deklaracje wsparcia wymagające weryfikacji'},
    {id:'posts',name:'Posty',icon:'▤',href:'/community-admin.html?aio_section=pending',description:'Wpisy do moderacji'},
    {id:'reports',name:'Zgłoszenia',icon:'⚑',href:'/community-admin.html?aio_section=reports',description:'Zgłoszone naruszenia zasad'},
    {id:'resets',name:'Reset haseł',icon:'⚿',href:'/community-admin.html?aio_section=password-resets',description:'Wnioski o odzyskanie dostępu'}
  ];
  const tools=[
    {name:'Dostęp i wsparcie',items:[
      ['Zgłoszenia wsparcia','/community-admin.html?aio_section=approvals'],
      ['Dostępy 7 dni','/community-admin.html?aio_section=grants'],
      ['Konta VIP (30 dni)','/community-admin.html?aio_section=vip'],
      ['Historia pobrań','/community-admin.html?aio_section=downloads'],
      ['Pliki z postów — historia','/owner-hub#aio-post-links-history'],
      ['Aktywność AIO Access','/community-admin.html?aio_section=access-activity']]},
    {name:'Społeczność i wiadomości',items:[
      ['Wiadomości od użytkowników','/community-admin.html?aio_section=inbox'],
      ['Posty do akceptacji','/community-admin.html?aio_section=pending'],
      ['Zgłoszenia naruszeń','/community-admin.html?aio_section=reports'],
      ['Opublikowane posty','/community-admin.html?aio_section=published'],
      ['Komentarze','/community-admin.html?aio_section=comments'],
      ['Czat','/community-admin.html?aio_section=chat']]},
    {name:'Listy kanałów',items:[
      ['Moderacja list ZIP','/aio-list-upload.html#aluAdmin'],
      ['Wiadomości o listach','/community-admin.html?aio_section=inbox'],
      ['Opublikowane listy','/channel-lists.html']]},
    {name:'Konta i bezpieczeństwo',items:[
      ['Użytkownicy','/community-admin.html?aio_section=users'],
      ['Prośby o reset hasła','/community-admin.html?aio_section=password-resets'],
      ['Sesje','/community-admin.html?aio_section=sessions'],
      ['Blokady IP','/community-admin.html?aio_section=ip'],
      ['Bezpieczeństwo','/community-admin.html?aio_section=security'],
      ['Trwały dziennik bezpieczeństwa','/owner-hub#aio-security-journal'],
      ['Dziennik','/community-admin.html?aio_section=logs']]},
    {name:'Statystyki i techniczne',items:[
      ['Statystyki','/community-admin.html?aio_section=statistics'],
      ['Pobrania i eksport','/community-admin.html?aio_section=downloads'],
      ['Konserwacja D1 / R2','/aio-maintenance.html'],
      ['Pełny panel administracyjny','/community-admin.html']]}
  ];
  const sources=[
    {id:'lists',url:'/api/list-submissions?view=admin',extract:d=>d.items||[]},
    {id:'messages',url:'/api/list-inbox?scope=admin',extract:d=>d.items||[]},
    {id:'support',url:'/api/aio-access-approvals?scope=admin',extract:d=>d.requests||[]},
    {id:'posts',url:'/api/community?action=admin&tab=pending',extract:d=>d.rows||[]},
    {id:'reports',url:'/api/community?action=admin&tab=reports',extract:d=>d.rows||[]},
    {id:'resets',url:'/api/community?action=admin&tab=password-resets',extract:d=>d.rows||[]}
  ];
  let container=null,lastRefresh=0,running=false,currentItems=[],active='pending',busySources=[],owner=false;
  function time(value){if(!value)return 'Brak daty';const d=new Date(value);return Number.isNaN(+d)?String(value).slice(0,16):new Intl.DateTimeFormat('pl-PL',{dateStyle:'short',timeStyle:'short'}).format(d);}
  async function get(url){const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});const d=await r.json().catch(()=>null);if(!r.ok||!d||d.ok!==true)throw new Error('HTTP '+r.status);return d;}
  async function getRetry(url){try{return await get(url);}catch(e){await new Promise(resolve=>setTimeout(resolve,750));return get(url);}}
  function entry(group,item){
    const date=item.created_at||item.priority_sent_at||'';
    const section=sections.find(x=>x.id===group);
    let person='',title='',details='',pending=false;
    if(group==='lists'){
      person=item.author||'Użytkownik';title=item.name||'Nowa lista kanałów';
      details=(item.update_of?'Aktualizacja • ':'')+(item.satellite_slot||'Bez zestawu satelitów')+' • '+(item.status||'brak statusu');
      pending=['pending','publish_failed'].includes(item.status);
    }else if(group==='messages'){
      person=item.sender_name||'Użytkownik';title=item.subject||'Wiadomość od użytkownika';
      details=({submission:'Lista ZIP',update:'Aktualizacja listy',contact:'Wiadomość'})[item.kind]||'Wiadomość';
      pending=item.status==='new';
    }else if(group==='support'){
      person=item.display_name||'Użytkownik';title='Zgłoszenie wsparcia AIO Access';
      details=(item.method||'Metoda niepodana')+' • deklaracja, nie potwierdzona płatność';
      pending=item.status==='pending';
    }else if(group==='posts'){
      person=item.author?.display_name||item.author_name||'Użytkownik';title=item.title||'Post do zatwierdzenia';
      details='Oczekuje na moderację';pending=true;
    }else if(group==='reports'){
      person=item.reporter?.display_name||item.reporter_name||'Użytkownik';title='Zgłoszenie naruszenia zasad';
      details=String(item.reason||item.category||'Zgłoszenie treści').slice(0,95);pending=true;
    }else if(group==='resets'){
      person=item.display_name||'Użytkownik';title='Prośba o reset hasła';
      details='Status: '+String(item.status||'pending');pending=item.status==='pending';
    }
    return {id:String(item.id||''),group,person:String(person),title:String(title),details:String(details),date:String(date),pending,href:section.href};
  }
  function build(){
    const inAccount=!!$('.aio-account-main');const host=inAccount?$('.aio-account-panels'):$('.oh-urgent');
    if(!host)return null;
    const wrap=create('section','aov2','');wrap.id='aov2-owner';wrap.setAttribute('aria-label','Centrum właściciela AIO');
    const top=create('div','aov2-head');const headTxt=create('div');
    headTxt.append(create('p','aov2-kicker','WYŁĄCZNIE DLA WŁAŚCICIELA'),create('h2','','Centrum właściciela — wszystkie sprawy w jednym miejscu'),create('p','aov2-sub','Zgłoszenia są pobierane z istniejących modułów D1. Dane odświeżają się co 2 minuty, gdy karta jest otwarta.'));
    const actions=create('div','aov2-head-actions');const reload=create('button','aov2-btn','⟳ Odśwież');reload.type='button';reload.addEventListener('click',()=>load(true));
    const hub=create('a','aov2-btn aov2-main-link','Otwórz pełne centrum →');hub.href='/owner-hub';actions.append(reload,hub);top.append(headTxt,actions);wrap.append(top);
    const metrics=create('div','aov2-metrics');metrics.setAttribute('aria-label','Bieżące zgłoszenia');
    for(const s of sections){const card=create('a','aov2-metric');card.href=s.href;card.dataset.aovMetric=s.id;const c=create('span','aov2-metric-icon',s.icon);const num=create('strong','aov2-metric-count','—');const name=create('span','aov2-metric-title',s.name);card.append(c,num,name);metrics.append(card);}
    wrap.append(metrics);
    const feed=create('div','aov2-feed');const feedHead=create('div','aov2-feed-head');const h=create('h3','','Najnowsze zgłoszenia i działania');
    const tabs=create('div','aov2-tabs');for(const [id,label] of [['pending','Do załatwienia'],['all','Ostatnie sprawy']]){const b=create('button','aov2-tab',label);b.type='button';b.dataset.aovFilter=id;b.setAttribute('aria-pressed',String(id===active));b.addEventListener('click',()=>{active=id;drawItems();});tabs.append(b);}feedHead.append(h,tabs);
    const hint=create('p','aov2-hint');hint.dataset.aovState='';hint.textContent='Wczytywanie zgłoszeń…';const rows=create('div','aov2-rows');rows.dataset.aovRows='';feed.append(feedHead,hint,rows);
    const note=create('p','aov2-explain','Zgłoszenie wsparcia nie oznacza otrzymanej wpłaty. Decyzję podejmujesz w module AIO Access. Starsze sprawy i pełną historię otworzysz w odpowiednich działach.');feed.append(note);wrap.append(feed);
    if(inAccount){
      const quick=create('section','aov2-tools');quick.append(create('h3','','Wszystkie narzędzia administracyjne'));
      const grid=create('div','aov2-tools-grid');for(const g of tools){const col=create('section','aov2-tools-group');col.append(create('h4','',g.name));for(const [name,href] of g.items){const a=create('a','',name+' ↗');a.href=href;col.append(a);}grid.append(col);}quick.append(grid);wrap.append(quick);
      host.parentNode.insertBefore(wrap,host);
    }else{host.parentNode.insertBefore(wrap,host);}
    container=wrap;return wrap;
  }
  function drawItems(){if(!container)return;const rows=$('[data-aov-rows]',container),hint=$('[data-aov-state]',container);rows.replaceChildren();
    container.querySelectorAll('[data-aov-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aovFilter===active)));
    const all=currentItems.filter(x=>active==='all'||x.pending);const list=all.slice(0,90);
    for(const item of list){const a=create('a','aov2-item');a.href=item.href;
      const ico=create('span','aov2-item-icon',sections.find(s=>s.id===item.group)?.icon||'✉');
      const body=create('div','aov2-item-body');const label=create('strong','',item.title);const line=create('p','',item.person+' • '+item.details);const date=create('small','',time(item.date));body.append(label,line,date);
      const tail=create('span','aov2-item-action',item.pending?'Obsłuż →':'Otwórz →');a.append(ico,body,tail);rows.append(a);
    }
    if(!list.length)rows.append(create('p','aov2-empty',active==='pending'?'Brak spraw wymagających działania w dostępnych źródłach.':'Nie ma ostatnich spraw do pokazania.'));
    const unavailable=busySources.length?' Nie można odczytać: '+busySources.map(id=>sections.find(s=>s.id===id)?.name||id).join(', ')+'.':' ';
    hint.textContent=(lastRefresh?'Odczytano: '+time(new Date(lastRefresh).toISOString())+'. ':'')+
      'Wyniki obejmują ostatnie rekordy udostępniane przez moduły; szczegółową historię znajdziesz w panelach.'+unavailable;
    hint.classList.toggle('is-warning',busySources.length>0);
  }
  async function load(force=false){if(!container||running)return;if(!force && Date.now()-lastRefresh<40000)return;running=true;
    const results=await Promise.allSettled(sources.map(s=>getRetry(s.url)));
    const events=[];busySources=[];
    for(let i=0;i<sources.length;i++){
      const src=sources[i],r=results[i];const badge=$(`[data-aov-metric="${src.id}"] .aov2-metric-count`,container);
      if(r.status==='rejected'){busySources.push(src.id);if(badge&&!lastRefresh)badge.textContent='!';events.push(...currentItems.filter(x=>x.group===src.id));continue;}
      const list=src.extract(r.value);let count=0;
      for(const item of list){const e=entry(src.id,item);events.push(e);if(e.pending)count++;}
      if(badge)badge.textContent=String(src.id==='messages'&&Number.isFinite(Number(r.value.unread))?r.value.unread:count);
      $(`[data-aov-metric="${src.id}"]`,container)?.setAttribute('title',src.description+' — '+count+' widocznych spraw wymagających działania');
    }
    currentItems=events.sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''));
    lastRefresh=Date.now();drawItems();running=false;
  }
  let authFailures=0;
  async function sync(){
    try{
      const s=await get('/api/community-auth');
      const allowed=!!(s.authenticated&&s.user?.is_owner===true&&s.email_verified===true);
      owner=allowed;
      if(!owner){if(container){container.remove();container=null;}if(++authFailures<4&&!s.authenticated)setTimeout(()=>void sync(),1200*authFailures);return;}
      authFailures=0;
      if(!container)build();
      if(container)void load(true);
    }catch(e){console.warn('AIO Owner: problem odczytu sesji',e.message);if(container){const hint=$('[data-aov-state]',container);if(hint)hint.textContent='Chwilowy problem z odświeżeniem. Ostatnie dane pozostają widoczne; spróbuję ponownie.';}if(++authFailures<4)setTimeout(()=>void sync(),1200*authFailures);}
  }
  const boot=()=>{void sync();document.addEventListener('aio-community-auth',()=>void sync());
    document.addEventListener('aio-community-ready',()=>void sync());
    window.addEventListener('focus',()=>{if(owner)void load();});
    window.setInterval(()=>{if(owner&&!document.hidden)void load(true);},120000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
