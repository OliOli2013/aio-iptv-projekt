/* AIO Security Control V5. Progressive enhancement of owner-only V4 dashboard. */
(()=>{'use strict';
  if(window.__aioSecurityControlV5)return;window.__aioSecurityControlV5=true;
  const API='/api/owner-security-oversight';
  const kinds=[
    ['accounts','Blokady kont'],['ips','Blokady IP'],['emails','Blokady e-mail'],
    ['holds','Wstrzymane pobieranie'],['allowances','Wyjątki sieci'],
    ['reports','Zgłoszenia naruszeń'],['messages','Wiadomości'],
    ['support','Zgłoszenia wsparcia'],['resets','Reset haseł']
  ];
  const kindNames=Object.fromEntries(kinds);
  const desc={
    accounts:'Konta z aktywną datą blokady',ips:'Adresy z aktywnymi regułami blokowania',
    emails:'Trwałe blokady e-mail zapisane jako skróty',holds:'Aktywne wstrzymania pobierania',
    allowances:'Ważne wyjątki dla wspólnych sieci',reports:'Otwarte zgłoszenia naruszeń',
    messages:'Nieprzeczytane wiadomości do właściciela',support:'Zgłoszone wpłaty i prośby o dostęp',
    resets:'Prośby o reset hasła wymagające obsługi'
  };
  const $=(sel,root=document)=>root.querySelector(sel);
  const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
  const date=v=>{if(!v)return 'Bez terminu';const d=new Date(v);return Number.isFinite(+d)?d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'}):String(v);};
  const get=async url=>{const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||'HTTP '+r.status);return j;};
  let root,kind='accounts',offset=0,loading=false,auth=false,last=null;
  const refs={};
  function button(label,handler,cls=''){const b=make('button','aosc5-button '+cls,label);b.type='button';b.addEventListener('click',handler);return b;}
  function link(label,href,cls=''){const a=make('a','aosc5-button '+cls,label);a.href=href;return a;}
  function countText(n){return n===null?'—':String(n??0);}
  function status(text,error=false){if(refs.status){refs.status.textContent=text;refs.status.classList.toggle('aosc5-error',!!error);}}
  function makeCards(totals){refs.cards.replaceChildren();for(const [id,label] of kinds){const b=button(label+' · '+countText(totals[id]),()=>select(id),'aosc5-tab'+(kind===id?' is-selected':''));b.title=desc[id];refs.cards.append(b);}}
  function select(id){if(!kindNames[id]||loading)return;kind=id;offset=0;void load();}
  function exportCurrent(){const url=API+'?kind='+encodeURIComponent(kind)+'&format=csv';const a=make('a');a.href=url;a.download='AIO-security-control-'+kind+'.csv';document.body.append(a);a.click();a.remove();}
  function cell(label,value){const n=make('div','aosc5-field');n.append(make('span','aosc5-label',label),make('span','aosc5-value',value??'—'));return n;}
  function manageAccount(id){if(!id)return;window.dispatchEvent(new CustomEvent('aio-owner-security-manage',{detail:{user_id:id}}));}
  function row(item){
    const r=make('article','aosc5-record');
    const head=make('div','aosc5-record-head'),title=make('strong','','');
    title.textContent=item.account_name||'Brak profilu / nieprzypisane';
    head.append(title,make('span','aosc5-kind',item.kind||kind));r.append(head);
    const grid=make('div','aosc5-record-grid');
    grid.append(cell('ID wpisu',item.id),cell('ID konta',item.user_id||'Brak powiązania'),
      cell('Utworzono',date(item.created_at)),cell('Ważność',item.expires_at?date(item.expires_at):'Bezterminowo / nie dotyczy'),
      cell('Stan',item.status||'—'));
    if(item.related_user_id)grid.append(cell('Powiązane konto',((item.related_name||'Konto bez nazwy')+' · '+item.related_user_id)));
    if(item.extra)grid.append(cell(kind==='ips'?'Adres IP':kind==='emails'?'Skrót e-mail':'Dodatkowe',item.extra));
    if(item.detail)grid.append(cell('Informacje',item.detail));
    r.append(grid);
    const actions=make('div','aosc5-record-actions');
    if(item.user_id && (!item.role || item.role==='user'))actions.append(button('Zarządzaj kontem',()=>manageAccount(item.user_id)));
    if(item.related_user_id)actions.append(button('Powiązane konto',()=>manageAccount(item.related_user_id)));
    if(kind==='holds'||kind==='allowances')actions.append(link('Decyzje o ograniczeniach','/owner-hub#aio-security-journal'));
    if(kind==='ips')actions.append(link('Zarządzaj blokadami IP','/community-admin.html?aio_section=ip'));
    if(kind==='reports')actions.append(link('Otwórz zgłoszenia','/community-admin.html?aio_section=reports'));
    if(kind==='messages')actions.append(link('Otwórz wiadomości','/community-admin.html?aio_section=inbox'));
    if(kind==='support')actions.append(link(item.kind==='access-request'?'Wnioski o 7 dni':'Weryfikacja wsparcia',item.kind==='access-request'?'/community-admin.html?aio_section=approvals':'/owner-support-intents.html'));
    if(kind==='resets')actions.append(link('Otwórz prośby o reset','/community-admin.html?aio_section=password-resets'));
    if(actions.childNodes.length)r.append(actions);
    return r;
  }
  function render(data){
    last=data;makeCards(data.totals);refs.list.replaceChildren();
    for(const item of data.rows||[])refs.list.append(row(item));
    if(!(data.rows||[]).length)refs.list.append(make('p','aosc5-empty','Brak rekordów w tym zakresie.'));
    const p=data.pagination||{};refs.page.textContent='Pozycje '+((data.rows||[]).length?p.offset+1:0)+'–'+(p.offset+(data.rows||[]).length)+' z '+p.total;
    refs.prev.disabled=offset===0;refs.next.disabled=!p.has_more;
    const incomplete=(data.warnings||[]).length?' Nie można odczytać: '+data.warnings.join(', ')+'.':'';
    status('Odczyt: '+date(data.generated_at)+'. Dane z serwera; nie są to statystyki wszystkich żądań HTTP.'+incomplete,(data.warnings||[]).length>0);
    refs.search.value='';
  }
  async function load(){if(!root||loading)return;loading=true;status('Pobieranie bieżących blokad i zgłoszeń…');try{
    const d=await get(API+'?kind='+encodeURIComponent(kind)+'&offset='+offset);render(d);
  }catch(e){status('Błąd odczytu: '+e.message+' — ostatnio wczytane dane pozostają widoczne.',true);}finally{loading=false;}}
  function filterLocal(value){const q=value.trim().toLocaleLowerCase('pl-PL');
    for(const card of refs.list.children)card.hidden=!!q&&!card.textContent.toLocaleLowerCase('pl-PL').includes(q);
  }
  function mount(){if(root||!auth)return;
    const anchor=$('#aio-security-journal');const host=anchor||$('.aio-account-main')||$('.oh-content');if(!host)return;
    root=make('section','aosc5-root');root.id='aio-security-control-v5';
    const heading=make('div','aosc5-top'),txt=make('div');txt.append(make('p','aosc5-kicker','TYLKO DLA WŁAŚCICIELA'),make('h2','','Kontrola bezpieczeństwa — aktywne blokady i sprawy'),
      make('p','aosc5-muted','Jednoznaczne ID kont, daty wygaśnięcia i powiązania zgłoszeń. Żadnych nowych automatycznych kar.'));
    const act=make('div','aosc5-top-actions');act.append(button('↻ Odśwież',()=>void load()),button('↓ Eksport CSV',exportCurrent));heading.append(txt,act);root.append(heading);
    refs.cards=make('div','aosc5-tabs');root.append(refs.cards);
    const controls=make('div','aosc5-controls');const search=make('input','aosc5-search');search.type='search';search.placeholder='Szukaj na bieżącej stronie wyników (nazwa / ID)';search.addEventListener('input',()=>filterLocal(search.value));refs.search=search;
    controls.append(search);root.append(controls);
    const info=make('p','aosc5-muted');refs.status=info;info.setAttribute('role','status');root.append(info);
    refs.list=make('div','aosc5-list');root.append(refs.list);
    const pager=make('div','aosc5-pager');refs.prev=button('← Poprzednie',()=>{if(offset>0){offset=Math.max(0,offset-100);void load();}});
    refs.next=button('Następne →',()=>{if(last?.pagination?.has_more){offset+=100;void load();}});refs.page=make('span','aosc5-muted');pager.append(refs.prev,refs.page,refs.next);root.append(pager);
    root.append(make('p','aosc5-footnote','Wygasłe blokady nie są pokazywane jako aktywne. Zwykłe nieudane próby logowania i ograniczenia licznika logowań pozostają w dzienniku zdarzeń. Raporty CSV obejmują maksymalnie 3000 rekordów na eksport.'));
    if(anchor)anchor.insertAdjacentElement('afterend',root);else host.append(root);
    if(location.hash==='#aio-security-control-v5')root.scrollIntoView({block:'start',behavior:'smooth'});
    void load();
  }
  async function boot(){try{const a=await get('/api/community-auth');auth=!!(a.authenticated&&a.user?.is_owner===true&&a.email_verified===true);if(auth)mount();else if(root){root.remove();root=null;}}
    catch(_){/* Silent on unauthorized pages or temporary connectivity issues. */}
  }
  let scheduled=false;function scheduleMount(){if(root||!auth||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mount();});}
  const observer=new MutationObserver(scheduleMount);
  function start(){void boot();observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('aio-community-auth',()=>void boot());
    window.addEventListener('focus',()=>{if(root&&!document.hidden)void load();});
    window.setInterval(()=>{if(root&&!document.hidden)void load();},120000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
