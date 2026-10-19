/* AIO List Upload — zachowuje sesję społeczności, nigdy nie uzyskuje tokenu GitHub. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id), stat={pending:'Oczekuje na akceptację',publishing:'Publikowanie',published:'Opublikowana',applied:'Aktualizacja wdrożona',cancelled:'Wycofane przez autora',removing:'Usuwanie',editing:'Edycja',rejected:'Odrzucona',publish_failed:'Błąd publikacji — ponów',removed:'Usunięta'};
  let me=null,busy=false;
  function node(tag,text,cls){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;}
  function box(parent,txt,cls='alu-warning'){const x=node('div',txt,cls);parent.appendChild(x);return x;}
  function appendRow(target,item,admin=false){
    const card=node('article',undefined,'alu-record'),head=node('div',undefined,'alu-record-title');
    head.append(node('strong',item.name),node('span',stat[item.status]||item.status,'alu-status'));card.append(head);
    card.append(node('p',`${item.version||'wersja nieznana'} · ${item.file_name}${item.file_size>0?' · '+(item.file_size/1024).toFixed(0)+' KB':''}`));
    if(item.linked_legacy)card.append(node('p','Starsza lista przypisana do tego konta przez administratora.','alu-legacy-hint'));
    if(admin) card.append(node('p',`Autor: ${item.author} · ID użytkownika: ${item.user_id}`));
    if(item.review_reason) box(card,'Informacja: '+item.review_reason,item.status==='rejected'?'alu-error':'alu-warning');
    const report=item.report||{};
    if(report.stats) card.append(node('p',`Kontrola: ${report.stats.files} plików, ${report.stats.bouquets} bukietów, ${report.stats.services} wpisów #SERVICE.`));
    if((report.warnings||[]).length)box(card,'Ostrzeżenia: '+report.warnings.map(w=>w.detail).join(' • '),'alu-warning');
    if(!admin && item.status==='published' && !item.update_of) {
      const actions=node('div',undefined,'alu-actions');
      const remove=node('button','Usuń moją listę','alu-button');remove.type='button';remove.addEventListener('click',()=>removeOwn(item));
      const update=node('button','Aktualizuj ZIP','alu-button alu-primary');update.type='button';update.addEventListener('click',()=>beginUpdate(item));
      const edit=node('button','Edytuj nazwę / opis','alu-button');edit.type='button';edit.addEventListener('click',()=>editDetailsOwn(item));
      actions.prepend(update,edit);actions.append(remove);card.append(actions);
      card.append(node('p','Aktualizacja zachowa identyfikator i adres ZIP w AIO Panel. Nie trzeba usuwać listy.','alu-legacy-hint'));
    }
    if(!admin && item.status==='publish_failed' && me?.trusted_publisher && !item.update_of){
      const retry=node('button','Ponów publikację','alu-button alu-primary');retry.type='button';
      retry.addEventListener('click',async()=>{
        if(busy || !confirm('Ponowić publikację w GitHub dla: '+item.name+'?'))return;
        busy=true;try{const d=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'retry_own',id:item.id})});alert(d.message);await refresh();}
        catch(e){alert(e.message);await refresh();}finally{busy=false;}
      });card.append(retry);
    }
    if(!admin && ['pending','publish_failed'].includes(item.status)) {
      const cancel=node('button','Wycofaj moje zgłoszenie','alu-button');cancel.type='button';
      cancel.addEventListener('click',()=>cancelOwn(item));card.append(cancel);
    }
    if(item.update_of)card.append(node('p','Aktualizacja dotychczasowej listy (nazwa pozostaje bez zmian).'));
    if(admin){const actions=node('div',undefined,'alu-actions');
      const add=(label,action,enabled)=>{if(!enabled)return;const b=node('button',label,'alu-button');b.type='button';b.addEventListener('click',()=>perform(action,item));actions.append(b);};
      add('Zatwierdź i opublikuj','approve',['pending','publish_failed'].includes(item.status));
      add('Odrzuć z uzasadnieniem','reject',['pending','publish_failed'].includes(item.status));
      add('Usuń opublikowaną listę','remove',item.status==='published');
      add('Zablokuj dodawanie','block',item.status!=='removed');
      card.append(actions);
    }
    target.append(card);
  }
  async function cancelOwn(item){
    if(busy)return;
    if(!confirm('Wycofać własne zgłoszenie „'+item.name+'”? Nie będzie dostępne do zatwierdzenia.'))return;
    busy=true;
    try{const d=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'cancel_own',id:item.id})});alert(d.message);await refresh();}
    catch(e){alert('Błąd wycofania: '+e.message);await refresh();}
    finally{busy=false;}
  }
  function beginUpdate(item){
    if(busy || item.status!=='published'||item.update_of)return;
    const form=$('aluForm');form.reset();$('aluUpdateOf').value=item.id;
    form.elements.name.value=item.name||'';
    form.elements.name.readOnly=false;
    form.elements.description.value=item.description||'';
    form.elements.version.value=new Date().toISOString().slice(0,10);
    form.elements.satellite_slot.value=item.satellite_slot||'';
    form.elements.satellite_slot.disabled=!!item.satellite_slot;
    $('aluMode').querySelector('strong').textContent='Aktualizacja: '+item.name;
    $('aluNewMode').hidden=false;
    $('aluSubmit').textContent='Sprawdź ZIP i zaktualizuj istniejącą listę';
    $('aluUploadCard').scrollIntoView({behavior:'smooth',block:'start'});
    if(!item.satellite_slot)alert('Starsza lista nie ma przypisanej kategorii satelitów. Wybierz ją zgodnie z zawartością nowego ZIP.');
  }
  async function editDetailsOwn(item){
    if(busy||item.status!=='published')return;
    const name=prompt('Nazwa Twojej listy:',item.name);if(name===null)return;
    const description=prompt('Opis listy:',item.description||'');if(description===null)return;
    const version=prompt('Data aktualizacji RRRR-MM-DD:',item.version||new Date().toISOString().slice(0,10));if(version===null)return;
    if(!confirm('Zapisać nową nazwę, opis i datę bez zmiany archiwum ZIP?'))return;
    busy=true;
    try{
      const data=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'edit_details_own',id:item.id,name,description,version})});
      alert(data.message);await refresh();
    }catch(e){alert('Nie zapisano zmian: '+e.message);await refresh();}finally{busy=false;}
  }
  function newMode(){
    const form=$('aluForm');form.elements.satellite_slot.disabled=false;form.reset();$('aluUpdateOf').value='';
    form.elements.name.readOnly=false;
    form.elements.version.value=new Date().toISOString().slice(0,10);
    $('aluMode').querySelector('strong').textContent='Nowa lista';
    $('aluNewMode').hidden=true;
    $('aluSubmit').textContent='Sprawdź ZIP i zgłoś listę';
  }
  async function removeOwn(item){
    if(busy)return;
    const typed=prompt('Aby wycofać swoją listę z AIO Panel, wpisz DOKŁADNIE jej nazwę:', '');
    if(typed===null)return;
    if(typed!==item.name){alert('Nazwa różni się od nazwy Twojej listy. Niczego nie usunięto.');return;}
    if(!confirm('Czy na pewno wycofać tę listę z publicznego manifestu GitHub? Użytkownicy nie pobiorą już aktualnej wersji z AIO Panel.'))return;
    busy=true;
    try{
      const data=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete_own',id:item.id,confirm_name:typed})});
      alert(data.message||'Lista została wycofana.');await refresh();
    }catch(e){alert('Błąd wycofywania: '+e.message);await refresh();}
    finally{busy=false;}
  }
  function showLegacy(data){
    const target=$('aluLegacyList');if(!target)return;target.replaceChildren();
    const info=$('aluLegacyError');info.hidden=!data.manifest_error;info.textContent=data.manifest_error||'';
    if(!(data.legacy||[]).length){box(target,'Brak starszych list albo katalog GitHub jest chwilowo niedostępny.');return;}
    const filter=node('input');filter.type='search';filter.placeholder='Filtruj starsze listy po nazwie, autorze…';
    filter.className='alu-legacy-search';target.append(filter);
    const list=node('div',undefined,'alu-records');target.append(list);
    for(const item of data.legacy){
      const card=node('article',undefined,'alu-record');card.dataset.search=(item.name+' '+item.author).toLocaleLowerCase('pl');
      const head=node('div',undefined,'alu-record-title');head.append(node('strong',item.name),node('span',item.version,'alu-status'));card.append(head);
      card.append(node('p','Autor: '+(item.author||'nieokreślony')));
      const actions=node('div',undefined,'alu-actions');
      if(item.can_link){
        const assign=node('button','Przypisz autorowi (e-mail)','alu-button alu-primary');assign.type='button';
        assign.addEventListener('click',()=>assignLegacy(item));actions.append(assign);
      }else card.append(node('p','Nie można bezpiecznie przypisać: wpis ma zduplikowane ID lub nieobsługiwany adres ZIP.','alu-warning'));
      const btn=node('button','Wycofaj tę listę','alu-button');btn.type='button';btn.addEventListener('click',()=>removeLegacy(item));actions.append(btn);card.append(actions);list.append(card);
    }
    filter.addEventListener('input',()=>{
      const term=filter.value.trim().toLocaleLowerCase('pl');
      for(const card of list.children)card.hidden=!card.dataset.search.includes(term);
    });
  }
  async function assignLegacy(item){
    if(busy||!item.can_link)return;
    const email=prompt(`E-mail konta AIO, które ma zarządzać listą „${item.name}”:`, '');
    if(email===null)return;
    const trimmed=email.trim();
    if(!trimmed||!confirm(`Przypisać „${item.name}” do konta ${trimmed}? Potwierdź tożsamość autora przed zatwierdzeniem.`))return;
    busy=true;
    try{
      const d=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'assign_legacy',manifest_id:item.id,confirm_name:item.name,email:trimmed})});
      alert(d.message);await refresh();
    }catch(e){alert('Nie przypisano listy: '+e.message);await refresh();}finally{busy=false;}
  }
  async function removeLegacy(item){
    if(busy)return;
    const name=prompt('Potwierdź wycofanie wpisu z manifestu. Wpisz dokładną nazwę listy:', '');
    if(name===null)return;
    if(name!==item.name){alert('Nieprawidłowa nazwa. Niczego nie zmieniono.');return;}
    const reason=prompt('Podaj uzasadnienie wycofania (minimum 10 znaków):','Lista nieaktualna, wycofana z katalogu AIO Panel.');
    if(reason===null)return;
    if(reason.trim().length<10){alert('Podaj dokładniejszy powód.');return;}
    const del=confirm('Opcjonalnie usunąć także plik ZIP z bieżącej gałęzi GitHub?\nOK = wycofaj manifest i usuń ZIP\nAnuluj = wycofaj tylko manifest (zalecane)');
    if(!confirm('Ostatnie potwierdzenie: wycofać „'+item.name+'” z manifestu produkcyjnego AIO Panel?'))return;
    busy=true;
    try{
      const data=await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'hide_legacy',manifest_id:item.id,confirm_name:name,reason,delete_archive:del})});
      alert(data.message||'Wpis wycofany.');await refresh();
    }catch(e){alert('Błąd wycofania: '+e.message);await refresh();}
    finally{busy=false;}
  }
  async function call(options={}){
    const response=await fetch('/api/list-submissions',{cache:'no-store',credentials:'include',...options});
    let result;try{result=await response.json();}catch{throw new Error('Nie można odczytać odpowiedzi serwera.');}
    if(!response.ok||result.ok===false){const e=new Error(result.error||('HTTP '+response.status));e.result=result;throw e;}
    return result;
  }
  async function refresh(){
    try{
      const data=await call();
      me=data;
      $('aluAccountStatus').textContent=!data.authenticated?'Tylko zalogowani użytkownicy Społeczności AIO mogą dodawać listy.':`Zalogowano jako: ${data.user.display_name}${data.account_email?' · '+data.account_email:''} · ${data.trusted_publisher?'Publikowanie samodzielne aktywne':'Pierwsza lista wymaga akceptacji'}`;
      $('aluLogin').hidden=!!data.authenticated;
      $('aluUploadCard').hidden=!data.authenticated||!!data.blocked;
      $('aluHistory').hidden=!data.authenticated;
      $('aluBlocked').hidden=!data.blocked;
      if(data.blocked)$('aluBlocked').textContent='Konto nie ma uprawnień do dodawania list. Powód: '+data.blocked;
      const target=$('aluHistoryList');target.replaceChildren();
      if(!data.items.length)box(target,'Nie masz jeszcze zgłoszeń.');
      for(const row of data.items)appendRow(target,row);
      $('aluAdmin').hidden=!data.is_owner;
      if(data.is_owner) await refreshAdmin();
    }catch(e){$('aluAccountStatus').textContent=e.message;$('aluUploadCard').hidden=true;}
  }
  async function refreshAdmin(){
    const data=await fetch('/api/list-submissions?view=admin',{credentials:'include',cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Brak danych moderacji.');return d;});
    const target=$('aluAdminList');target.replaceChildren();
    if(!data.items.length)box(target,'Brak zgłoszeń do moderacji.');
    for(const item of data.items)appendRow(target,item,true);
    const blocks=$('aluAdminBlocks');blocks.replaceChildren();
    for(const b of data.blocks){
      const line=node('article',undefined,'alu-record');line.append(node('strong',b.author||b.user_id),node('p',b.reason));
      const btn=node('button','Odblokuj','alu-button');btn.type='button';btn.addEventListener('click',()=>perform('unblock',{user_id:b.user_id,name:b.author}));line.append(btn);blocks.append(line);
    }
    if(!data.blocks.length)box(blocks,'Brak zablokowanych użytkowników.');
    showLegacy(data);
  }
  async function perform(action,item){
    if(busy)return;
    let reason='';
    if(action==='reject'||action==='remove'||action==='block'){
      reason=prompt(`Podaj uzasadnienie (${action}) dla: ${item.name}`,'');
      if(reason===null)return;
      if(reason.trim().length<10){alert('Podaj powód liczący co najmniej 10 znaków.');return;}
    }
    if(action==='approve'&&!confirm(`Opublikować „${item.name}” w publicznym repozytorium i manifeście AIO Panel?`))return;
    if(action==='remove'&&!confirm('UWAGA: usunąć tę listę z repozytorium i manifestu? Zmiana wpłynie na użytkowników AIO Panel.'))return;
    if(action==='block'&&!confirm('Zablokować temu użytkownikowi przesyłanie nowych list?'))return;
    busy=true;
    try{
      await call({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id:item.id,user_id:item.user_id,reason})});
      alert('Operacja zakończona.');await refresh();
    }catch(e){alert('Błąd: '+e.message);await refresh();}
    finally{busy=false;}
  }
  async function submit(event){
    event.preventDefault();if(busy)return;
    const form=$('aluForm');if(!form.reportValidity())return;
    const f=$('aluZip').files[0];if(!f||f.size>12*1024*1024){box($('aluResult'),'ZIP może mieć maksymalnie 12 MB.','alu-error');$('aluResult').hidden=false;return;}
    const wasUpdate=!!$('aluUpdateOf').value;
    const data=new FormData(form), submitButton=$('aluSubmit'), result=$('aluResult');
    // Disabled select controls are not serialized by FormData.
    if(wasUpdate)data.set('satellite_slot',form.elements.satellite_slot.value);result.replaceChildren();result.hidden=false;
    busy=true;submitButton.disabled=true;submitButton.textContent='Sprawdzanie integralności i struktury archiwum…';
    try{
      const resp=await call({method:'POST',body:data});
      box(result,resp.message||'Zgłoszenie przyjęte.',resp.status==='publish_failed'?'alu-warning':'alu-success');
      if(resp.validation?.warnings?.length)box(result,'Uwagi: '+resp.validation.warnings.map(x=>x.detail).join('\n'),'alu-warning');
      newMode();await refresh();document.dispatchEvent(new Event('aio-list-updated'));
    }catch(e){
      box(result,e.message,'alu-error');
      if(e.result?.validation?.errors?.length)box(result,e.result.validation.errors.map(x=>`• ${x.detail}`).join('\n'),'alu-error');
      if(e.result?.validation?.warnings?.length)box(result,e.result.validation.warnings.map(x=>`• ${x.detail}`).join('\n'),'alu-warning');
    }finally{busy=false;submitButton.disabled=false;submitButton.textContent=$('aluUpdateOf').value?'Sprawdź ZIP i zaktualizuj istniejącą listę':'Sprawdź ZIP i zgłoś listę';}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('aluForm').addEventListener('submit',submit);
    $('aluNewMode').addEventListener('click',newMode);
    $('aluRefresh').addEventListener('click',refresh);
    $('aluLogin').addEventListener('click',event=>{event.stopPropagation();if(window.AIOCommunity?.openAuth)window.AIOCommunity.openAuth();else location.href='community.html';});
    document.addEventListener('aio-community-auth',refresh);
    document.addEventListener('aio-community-ready',refresh);
    $('aluForm').elements.version.value=new Date().toISOString().slice(0,10);
    refresh();
  });
})();
