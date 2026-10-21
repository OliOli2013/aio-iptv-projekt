/* Owner Security V4: collapsible journal, bounded CSV, deliberate account actions. */
(()=>{'use strict';
 if(window.__aioOwnerSecurityV4)return;window.__aioOwnerSecurityV4=true;
 const $=(q,r=document)=>r.querySelector(q),e=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
 const API='/api/owner-security-actions';
 async function api(path,body){const r=await fetch(path,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw Error(d.error||'Błąd odpowiedzi '+r.status);return d;}
 const exportKinds={'Rodzaje zdarzeń — 7 dni':'types','Aktywność kont — 7 dni':'accounts','Ostatnie zdarzenia':'events','Zatwierdzone wspólne sieci':'allowances'};
 function exporter(kind){const a=e('a','aos4-export','↓ Eksport CSV');a.href='/api/owner-security-export?kind='+encodeURIComponent(kind);a.download='AIO-'+kind+'.csv';a.addEventListener('click',ev=>ev.stopPropagation());return a;}
 function details(title,kind){const d=e('details','aos4-details'),s=e('summary','aos4-summary');s.append(e('span','',''+title),exporter(kind));d.append(s);return d;}
 function transform(root){
  if(!root)return;
  const hs=[...root.children].filter(x=>x.tagName==='H3');
  if(!hs.length)return;
  // The actionable hold list is always shown. Historical tables are collapsed by default.
  for(let i=hs.length-1;i>=0;i--){const h=hs[i],title=h.textContent.trim();if(title.startsWith('Wspólne IP i płatne konta'))continue;
    const kind=exportKinds[title];if(!kind)continue;
    const group=details(title,kind);let next=h.nextElementSibling;const nodes=[];
    while(next&&next.tagName!=='H3'&&!next.classList.contains('aos4-details')){const current=next;next=next.nextElementSibling;nodes.push(current);}
    h.replaceWith(group);const body=e('div','aos4-body');nodes.forEach(x=>body.append(x));group.append(body);
  }
  root.dataset.aos4Wrapped='1';
 }
 let inflight=false,modal;
 function actionButton(label,klass,fn){const b=e('button','aos4-btn '+(klass||''),label);b.type='button';b.addEventListener('click',fn);return b;}
 function flag(row,ip){return ip.other_accounts>0?' (uwaga: '+ip.other_accounts+' innych kont w tej sieci)':'';}
 function close(){if(modal){modal.close();modal.remove();modal=null;}}
 async function openAccount(userId){
   if(inflight)return;inflight=true;try{
   const d=await api(API+'?user_id='+encodeURIComponent(userId));close();modal=e('dialog','aos4-modal');const body=e('div','aos4-modal-body');modal.append(body);
   const head=e('div','aos4-modal-head');head.append(e('strong','','Zarządzanie kontem i siecią'),actionButton('✕','',close));body.append(head);
   const status=e('p','aos4-status','');status.setAttribute('role','status');
   const user=d.user;body.append(e('p','',user.name+' • '+(user.email||'brak e-maila')));
   const state=e('p','aos4-muted','Blokada konta: '+(user.banned_until||'brak')+' · E-mail: '+(user.email_blocked?'zablokowany':'bez blokady'));body.append(state);
   const note=e('label','aos4-label','Powód operacji (wymagany)');const input=e('input','aos4-input');input.maxLength=300;input.value='Weryfikacja bezpieczeństwa konta i korzystania z AIO';note.append(input);body.append(note);
   const actions=e('div','aos4-buttons');body.append(actions);
   async function mutate(action,ip=null,shared=false){
    const reason=input.value.trim();if(reason.length<8){status.textContent='Podaj powód (minimum 8 znaków).';return;}
    const text={block_account:'Zablokować całe konto na 30 dni?',unblock_account:'Zdjąć blokadę konta?',block_email:'Zablokować e-mail również dla przyszłych rejestracji i wylogować konto?',unblock_email:'Usunąć blokadę e-mail? Blokada konta pozostanie osobno.',block_ip:'Zablokować CAŁY adres IP na 7 dni? Może dotknąć innych użytkowników.',unblock_ip:'Zdjąć blokadę wskazanego IP?'}[action];
    if(!confirm(text+'\nKonto: '+user.name+'\n'+(ip?'IP: '+ip+'\n':'')+'Powód: '+reason))return;
    status.textContent='Wykonuję operację…';
    try{
     const response=await api(API,{action,user_id:userId,reason,confirm:true,...(ip?{ip,ack_shared:shared}: {})});
     status.textContent=response.message||'Zapisano.';state.textContent='Zmiana zapisana. Odśwież okno, aby zobaczyć aktualne dane.';
     if(action.startsWith('block')){actions.querySelectorAll('button').forEach(b=>b.disabled=true);}
     // Reopen after a moment only if user chooses to refresh, never duplicate writes.
    }catch(err){status.textContent='Błąd: '+err.message;}
   }
   actions.append(actionButton('Blokuj konto — 30 dni','aos4-warning',()=>mutate('block_account')));
   actions.append(actionButton('Odblokuj konto','',()=>mutate('unblock_account')));
   if(user.email){actions.append(actionButton('Blokuj e-mail i rejestrację','aos4-warning',()=>mutate('block_email')));actions.append(actionButton('Odblokuj e-mail','',()=>mutate('unblock_email')));}
   const ipSection=e('div','aos4-ip');ipSection.append(e('h3','','Adresy IP powiązane z kontem'));
   if(!d.ips?.length)ipSection.append(e('p','aos4-muted','Brak znanych adresów IP dla tego konta.'));
   else{
    const list=e('select','aos4-input');for(const ip of d.ips){const opt=e('option','',ip.ip+flag(user,ip)+(ip.blocked?' • BLOKADA':''));opt.value=ip.ip;list.append(opt);}ipSection.append(list);
    const ipInfo=e('p','aos4-muted','');ipSection.append(ipInfo);
    const setInfo=()=>{const x=d.ips.find(x=>x.ip===list.value);ipInfo.textContent=x?.other_accounts?'Ostrożnie: z tej sieci korzystało także '+x.other_accounts+' innych kont. Blokada IP dotknie wszystkie te konta.':'Adres odnotowany przy tym koncie. Najpierw sprawdź, czy blokada jest konieczna.';};list.addEventListener('change',setInfo);setInfo();
    const ipButtons=e('div','aos4-buttons');ipButtons.append(actionButton('Blokuj wybrany IP — 7 dni','aos4-danger',()=>{
      const ip=d.ips.find(x=>x.ip===list.value);if(!ip)return;
      if(ip.other_accounts>0){const typed=prompt('Sieć jest współdzielona. Aby ją zablokować, wpisz dokładnie adres IP: '+ip.ip);if(typed!==ip.ip)return;}
      void mutate('block_ip',ip.ip,ip.other_accounts>0);
     }),actionButton('Odblokuj wybrany IP','',()=>mutate('unblock_ip',list.value)));ipSection.append(ipButtons);
   }
   body.append(ipSection);
   const del=e('div','aos4-delete');del.append(e('strong','','Strefa nieodwracalna'));
   del.append(e('p','aos4-muted','Trwałe usunięcie konta i przypisanych treści. Zdarzenia bezpieczeństwa mogą nadal pozostać w dzienniku bez profilu.'));
   del.append(actionButton('Usuń konto i jego treści','aos4-danger',async()=>{
      const correct=user.email||user.name;const typed=prompt('To trwałe usunięcie! Wpisz dokładnie '+correct+' aby potwierdzić:');if(typed!==correct)return;
      if(!confirm('Ostatecznie USUNĄĆ konto '+user.name+'? Tej czynności nie można cofnąć.'))return;
      status.textContent='Usuwanie konta…';
      try{const result=await api('/api/community',{action:'admin_action',target:'user',op:'delete',id:user.id,reason:input.value.trim()||'Usunięcie przez właściciela'});status.textContent=result.message||'Konto usunięte.';del.querySelector('button').disabled=true;}
      catch(err){status.textContent='Błąd: '+err.message;}
   }));body.append(del,status);
   const footer=e('div','aos4-buttons');footer.append(actionButton('Odśwież dane konta','',()=>{close();void openAccount(userId)}),actionButton('Zamknij','',close));body.append(footer);
   document.body.append(modal);modal.addEventListener('click',ev=>{if(ev.target===modal)close();});modal.showModal();
   }catch(err){alert('Nie można odczytać konta: '+err.message);}finally{inflight=false;}
 }
 function enhance(root){
  const list=$('[data-asj-content]',root);if(!list)return;
  // Prevent observing DOM moves and mutations performed by our own UI.
  observer.disconnect();
  try{
   transform(list);
   for(const card of list.querySelectorAll('.asj-hold[data-asj-user-id]')){
     if(card.querySelector('[data-aos4-account]'))continue;
     const id=card.dataset.asjUserId;if(!id)continue;
     let actions=$('.asj-hold-actions',card);if(!actions){actions=e('div','asj-hold-actions');card.append(actions);}
     const btn=actionButton('Zarządzaj kontem / IP / e-mail','aos4-manage',()=>void openAccount(id));btn.dataset.aos4Account='1';actions.append(btn);
   }
   const holdList=$('.asj-holds',list);if(holdList&&!$('.aos4-holds-export',list)){
     const a=exporter('holds');a.classList.add('aos4-holds-export');holdList.insertAdjacentElement('beforebegin',a);
   }
  }finally{observer.observe(root,{childList:true,subtree:true});}
 }
 const observer=new MutationObserver(()=>{const root=document.getElementById('aio-security-journal');if(root&&$('[data-asj-content]',root))enhance(root);});
 function boot(){
   const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/css/aio-owner-security-v4.css?v=20261021-v4';document.head.append(css);
   observer.observe(document.body,{childList:true,subtree:true});
   const root=document.getElementById('aio-security-journal');if(root)enhance(root);
   enhanceOverview();
 }
 function enhanceOverview(){
   const root=document.getElementById('aov2-owner');if(!root||root.dataset.aos4Enhanced)return;
   root.dataset.aos4Enhanced='1';
   const head=$('.aov2-head-actions',root);
   if(head){const exportButton=actionButton('↓ Eksport widocznych spraw CSV','',()=>{
     const rows=[...root.querySelectorAll('.aov2-rows .aov2-item')].map(item=>[
       item.querySelector('strong')?.textContent||'',item.querySelector('.aov2-item-body p')?.textContent||'',item.querySelector('small')?.textContent||'',item.href||''
     ]);
     const csv=v=>{let str=String(v??'');if(/^\s*[=+@-]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"';};
     const content='\ufeff'+[['Sprawa','Użytkownik i szczegóły','Data','Dział'],...rows].map(row=>row.map(csv).join(',')).join('\r\n');
     const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=e('a');a.href=url;a.download='AIO-widoczne-sprawy-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
   });exportButton.className='aov2-btn';exportButton.title='Eksportuje tylko sprawy aktualnie wyświetlone w tym podglądzie';head.append(exportButton);}
   for(const [selector,title] of [['.aov2-feed','Najnowsze zgłoszenia i działania'],['.aov2-tools','Wszystkie narzędzia administracyjne']]){
     const section=$(selector,root);if(!section)continue;
     const d=e('details','aos4-overview-details'),sum=e('summary','aos4-summary',title+' — rozwiń');
     section.before(d);d.append(sum,section);
   }
 }
 const overviewObserver=new MutationObserver(()=>enhanceOverview());
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();overviewObserver.observe(document.body,{subtree:true,childList:true});},{once:true});else{boot();overviewObserver.observe(document.body,{subtree:true,childList:true});}
})();
