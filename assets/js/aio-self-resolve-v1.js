/* AIO Self Resolve V1 — only the existing restricted appeal session. */
(()=>{'use strict';
  const area=document.getElementById('aio-self-resolve');
  if(!area)return;
  const msg=document.getElementById('aio-self-resolve-status');
  const names=document.getElementById('aio-self-resolve-list');
  const label=document.getElementById('aio-self-resolve-reason');
  const note=document.getElementById('aio-self-resolve-note');
  const api='/api/aio-self-resolve';
  const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
  let busy=false;
  function status(s,error=false){msg.textContent=s||'';msg.classList.toggle('error',!!error)}
  async function request(method,data){
    const res=await fetch(api,{method,cache:'no-store',credentials:'include',
      headers:method==='POST'?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
    const json=await res.json().catch(()=>({}));
    if(!res.ok||json.ok!==true)throw new Error(json.error||'Błąd komunikacji z serwerem.');
    return json;
  }
  function showAccount(u){
    const row=el('article','sr-account');
    row.append(el('strong','sr-name',u.name));
    const button=el('button','appeal-button sr-delete','Usuń to konto');button.type='button';
    const panel=el('form','sr-delete-form');panel.hidden=true;
    panel.append(el('p','', 'Nieodwracalne usunięcie konta „'+u.name+'”. Użyj hasła usuwanego konta.'));
    const passwordLabel=el('label','','Hasło usuwanego konta');
    const password=el('input','sr-input');password.type='password';password.required=true;password.autocomplete='off';
    password.minLength=1;password.maxLength=512;passwordLabel.append(password);
    const phraseLabel=el('label','','Wpisz dokładnie: USUN KONTO');
    const confirm=el('input','sr-input');confirm.type='text';confirm.required=true;confirm.autocomplete='off';phraseLabel.append(confirm);
    const send=el('button','appeal-button','Usuń bezpowrotnie');send.type='submit';
    const cancel=el('button','sr-cancel','Anuluj');cancel.type='button';
    cancel.addEventListener('click',()=>{password.value='';confirm.value='';panel.hidden=true;button.hidden=false;});
    panel.append(passwordLabel,phraseLabel,send,cancel);
    button.addEventListener('click',()=>{button.hidden=true;panel.hidden=false;password.focus();});
    panel.addEventListener('submit',async ev=>{
      ev.preventDefault();if(busy)return;
      if(confirm.value.trim()!=='USUN KONTO'){status('Wpisz dokładne potwierdzenie: USUN KONTO',true);return;}
      if(!window.confirm('Usunąć bezpowrotnie konto „'+u.name+'” wraz z jego danymi? Tej operacji nie można cofnąć.'))return;
      busy=true;send.disabled=true;status('Sprawdzam możliwość usunięcia konta…');
      try{
        const result=await request('POST',{action:'delete',user_id:u.id,account_name:u.name,password:password.value,confirm:confirm.value.trim()});
        password.value='';confirm.value='';status(result.message||'Operacja wykonana.');await load();
      }catch(err){status(err.message,true);password.value='';}
      finally{send.disabled=false;busy=false;}
    });
    row.append(button,panel);return row;
  }
  async function load(){
    try{
      const data=await request('GET');
      area.hidden=!data.eligible;
      if(!data.eligible)return;
      label.textContent=data.reason||'Dostęp do konta został ograniczony.';
      names.replaceChildren();
      if(data.related){
        names.append(el('div','sr-keeper','Konto do zachowania: '+(data.keeper?.name||'Bieżące konto')));
        names.append(el('p','sr-keeper-hint','Aby zachować inne konto, zaloguj się na nie i otwórz ponownie tę stronę.'));
        for(const account of data.accounts||[])names.append(showAccount(account));
      }
      note.textContent=data.note||'Możesz wysłać odwołanie, aby wyjaśnić przyczynę blokady.';
      if(!busy)status(data.accounts?.length?'Wybierz konto dodatkowe, które chcesz usunąć.':'Możesz skorzystać z odwołania.');
    }catch(err){area.hidden=false;status('Nie udało się wczytać listy kont: '+err.message,true);}
  }
  void load();
})();
