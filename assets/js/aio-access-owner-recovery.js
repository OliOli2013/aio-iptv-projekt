/* Only in owner dashboard; API separately enforces requireAdmin. */
(()=>{'use strict';
  async function request(body){
    const r=await fetch('/api/aio-account-access',{method:'POST',credentials:'include',cache:'no-store',
      headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({error:'Nieprawidłowa odpowiedź.'}));
    if(!r.ok||data.ok===false)throw new Error(data.error||'Błąd odczytu.');return data;
  }
  const el=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;return n;};
  async function boot(){
    const hero=document.querySelector('.community-hero');if(!hero)return;
    let check;try{check=await request({action:'history'});}catch{return;}
    const root=el('section');root.className='community-panel community-panel-pad';root.id='aio-access-owner-recovery';
    root.style.cssText='padding:22px;margin:20px auto;max-width:1200px;';
    const title=el('h2','AIO Access — odzyskiwanie 7-dniowego dostępu');root.append(title);
    root.append(el('p','Dostępy są przypisane do kont, nie do IP. Zarejestrowanym użytkownikom, którzy ukończyli ścieżkę AIO Access od 14 października, przywracany jest pozostały czas do 7 dni od pierwotnego odblokowania.'));
    root.append(el('p','Przelewy BuyCoffee są potwierdzane osobno. Wpisz e-mail podany przez wspierającego w potwierdzeniu, godzinę wpłaty i jej identyfikator. Nie ujawniaj tych danych w publicznym repozytorium.'));
    const form=el('form');form.style.cssText='display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:18px 0;';
    function inp(label,type,placeholder,required=true){const w=el('label',label);w.style.cssText='display:grid;gap:5px;flex:1;min-width:170px;';let input=el('input');input.type=type;input.placeholder=placeholder||'';input.required=required;input.style.cssText='padding:11px;border:1px solid #376078;background:#071e2c;color:white;border-radius:8px;min-height:42px';w.append(input);form.append(w);return input;}
    const email=inp('E-mail z potwierdzenia BuyCoffee','email','wspierajacy@example.com');
    const when=inp('Data i godzina wpłaty','datetime-local','');
    const ref=inp('Numer / opis potwierdzenia','text','BuyCoffee — potwierdzona wpłata');
    const btn=el('button','Przywróć 7 dni od wpłaty');btn.type='submit';btn.className='button primary';form.append(btn);root.append(form);
    const status=el('p');status.setAttribute('aria-live','polite');root.append(status);
    const refresh=el('button','Odśwież historię kont');refresh.className='button';refresh.type='button';root.append(refresh);
    const list=el('div');list.style.cssText='margin-top:14px;max-height:310px;overflow:auto;';root.append(list);
    function show(data){list.replaceChildren();const history=data.history||[],grants=data.grants||[];
      list.append(el('p',`Historyczne odblokowania przypisane do kont: ${history.length}. Zapisane uprawnienia: ${grants.length}. Potwierdzone wpłaty w D1: ${data.receipts_count||0}.`));
      for(const item of history){const until=new Date(Date.parse(item.unlocked_at)+7*86400000).toLocaleString('pl-PL');list.append(el('p',`${item.display_name||'Użytkownik'} — ukończono: ${new Date(item.unlocked_at).toLocaleString('pl-PL')} — wygasa: ${until}.`));}
      if(!history.length)list.append(el('p','Brak wcześniejszych odblokowań przypisanych do kont w okresie migracji.'));
      list.append(el('p','Zdarzenia access_unlocked nie są potwierdzeniami opłacenia kawy. Zweryfikuj wpłaty na podstawie wiadomości BuyCoffee.'));
    }
    show(check);
    form.addEventListener('submit',async e=>{e.preventDefault();btn.disabled=true;
      try{const d=await request({action:'receipt',email:email.value,paid_at:new Date(when.value).toISOString(),reference:ref.value});
        status.textContent=d.matched_account?'Dostęp przypisany do istniejącego konta do '+new Date(d.expires_at).toLocaleString('pl-PL'):'Zapisano potwierdzenie. Dostęp zacznie obowiązywać po rejestracji konta z tym samym e-mailem (najpóźniej do pierwotnej daty wygaśnięcia).';
        form.reset();show(await request({action:'history'}));
      }catch(e){status.textContent='Błąd: '+e.message;}finally{btn.disabled=false;}
    });
    refresh.addEventListener('click',async()=>{try{show(await request({action:'history'}));status.textContent='Odświeżono.';}catch(e){status.textContent=e.message;}});
    hero.insertAdjacentElement('afterend',root);
  }
  document.addEventListener('aio-community-ready',()=>{void boot();},{once:true});
  if(document.readyState!=='loading'&&window.AIOCommunity?.ready)void boot();
})();
