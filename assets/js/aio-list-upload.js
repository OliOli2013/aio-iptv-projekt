/* AIO List Upload — zachowuje sesję społeczności, nigdy nie uzyskuje tokenu GitHub. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id), stat={pending:'Oczekuje na akceptację',publishing:'Publikowanie',published:'Opublikowana',rejected:'Odrzucona',publish_failed:'Błąd publikacji — ponów',removed:'Usunięta'};
  let me=null,busy=false;
  function node(tag,text,cls){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;}
  function box(parent,txt,cls='alu-warning'){const x=node('div',txt,cls);parent.appendChild(x);return x;}
  function appendRow(target,item,admin=false){
    const card=node('article',undefined,'alu-record'),head=node('div',undefined,'alu-record-title');
    head.append(node('strong',item.name),node('span',stat[item.status]||item.status,'alu-status'));card.append(head);
    card.append(node('p',`${item.version} · ${item.file_name} · ${(item.file_size/1024).toFixed(0)} KB`));
    if(admin) card.append(node('p',`Autor: ${item.author} · ID użytkownika: ${item.user_id}`));
    if(item.review_reason) box(card,'Informacja: '+item.review_reason,item.status==='rejected'?'alu-error':'alu-warning');
    const report=item.report||{};
    if(report.stats) card.append(node('p',`Kontrola: ${report.stats.files} plików, ${report.stats.bouquets} bukietów, ${report.stats.services} wpisów #SERVICE.`));
    if((report.warnings||[]).length)box(card,'Ostrzeżenia: '+report.warnings.map(w=>w.detail).join(' • '),'alu-warning');
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
      $('aluAccountStatus').textContent=!data.authenticated?'Tylko zalogowani użytkownicy Społeczności AIO mogą dodawać listy.':`Zalogowano jako: ${data.user.display_name}`;
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
    const data=new FormData(form), submitButton=$('aluSubmit'), result=$('aluResult');result.replaceChildren();result.hidden=false;
    busy=true;submitButton.disabled=true;submitButton.textContent='Sprawdzanie integralności i struktury archiwum…';
    try{
      const resp=await call({method:'POST',body:data});
      box(result,resp.message||'Lista trafiła do moderacji.','alu-success');
      if(resp.validation?.warnings?.length)box(result,'Uwagi: '+resp.validation.warnings.map(x=>x.detail).join('\n'),'alu-warning');
      form.reset();await refresh();
    }catch(e){
      box(result,e.message,'alu-error');
      if(e.result?.validation?.errors?.length)box(result,e.result.validation.errors.map(x=>`• ${x.detail}`).join('\n'),'alu-error');
      if(e.result?.validation?.warnings?.length)box(result,e.result.validation.warnings.map(x=>`• ${x.detail}`).join('\n'),'alu-warning');
    }finally{busy=false;submitButton.disabled=false;submitButton.textContent='Sprawdź ZIP i zgłoś listę';}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('aluForm').addEventListener('submit',submit);
    $('aluRefresh').addEventListener('click',refresh);
    $('aluLogin').addEventListener('click',event=>{event.stopPropagation();if(window.AIOCommunity?.openAuth)window.AIOCommunity.openAuth();else location.href='community.html';});
    document.addEventListener('aio-community-auth',refresh);
    document.addEventListener('aio-community-ready',refresh);
    $('aluForm').elements.version.value=new Date().toISOString().slice(0,10);
    refresh();
  });
})();
