/* AIO VIP V1: owner-only interactive management. The API independently verifies ownership. */
(()=>{'use strict';
  const $=s=>document.querySelector(s);
  const make=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;};
  const fmt=value=>{const d=new Date(value);return Number.isFinite(d.valueOf())?d.toLocaleString('pl-PL'):'—';};
  let panel,items,feedback,form,submit,emailField,noteField,summary;
  async function api(data){const r=await fetch('/api/owner-vip',{credentials:'include',cache:'no-store',...(data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||'Nie udało się wykonać operacji VIP.');return j;}
  function render(rows){items.replaceChildren();const now=Date.now();if(!rows.length){items.append(make('p','Nie nadano jeszcze żadnego dostępu VIP.'));return;}
    for(const row of rows){const card=make('article',undefined,'aio-vip-record');
      const head=make('div',undefined,'aio-vip-record-head');const title=make('strong',(row.display_name||'Użytkownik')+' — '+row.email);
      const active=row.status==='active'&&Date.parse(row.expires_at)>now;
      head.append(title,make('span',active?'VIP aktywny':row.status==='revoked'?'Wyłączony':'Wygasł',active?'aio-vip-state is-active':'aio-vip-state'));card.append(head);
      card.append(make('p','Aktywacja: '+fmt(row.issued_at)+'  |  Ważny do: '+fmt(row.expires_at)));
      if(row.note)card.append(make('p','Uwagi właściciela: '+row.note));
      if(row.revoked_at)card.append(make('p','Wyłączono: '+fmt(row.revoked_at)));
      const actions=make('div',undefined,'aio-vip-record-actions');
      const renew=make('button',active?'Przedłuż od dziś o miesiąc':'Aktywuj na miesiąc');renew.type='button';renew.className='aio-vip-button';
      renew.addEventListener('click',()=>{emailField.value=row.email;noteField.value=row.note||'';emailField.focus();panel.scrollIntoView({behavior:'smooth',block:'start'});feedback.textContent='Wybrano konto: '+row.email+'. Potwierdź aktywację poniżej.';});actions.append(renew);
      if(active){const revoke=make('button','Wyłącz VIP','aio-vip-button is-danger');revoke.type='button';revoke.addEventListener('click',async()=>{
        if(!confirm('Wyłączyć VIP dla '+row.email+'? Zwykłe i siedmiodniowe dostępy pozostaną bez zmian.'))return;
        revoke.disabled=true;try{const answer=await api({action:'revoke',user_id:row.user_id,confirm:true});feedback.textContent=answer.message;await refresh();}catch(e){feedback.textContent=e.message;}finally{revoke.disabled=false;}
      });actions.append(revoke);}card.append(actions);items.append(card);}
  }
  async function refresh(){try{const d=await api();summary.textContent='Aktywne konta VIP: '+d.active_count;render(d.grants||[]);}catch(e){feedback.textContent='Nie udało się odczytać listy: '+e.message;}}
  function build(){panel=make('section',undefined,'community-panel community-panel-pad aio-owner-vip');panel.id='aio-owner-vip';panel.setAttribute('aria-label','Zarządzanie kontami VIP');
    const h=make('h2','Konta VIP — miesięczny dostęp');panel.append(h,make('p','Przyznaj nielimitowane pobieranie na jeden miesiąc kalendarzowy od aktywacji. Konto musi być wcześniej zarejestrowane. VIP jest niezależny od zwykłego limitu i dostępu 7-dniowego.'));
    form=make('form',undefined,'aio-vip-form');form.autocomplete='off';
    const emailLabel=make('label','E-mail zarejestrowanego konta AIO');emailField=make('input');emailField.type='email';emailField.required=true;emailField.maxLength=254;emailField.placeholder='uzytkownik@example.com';emailLabel.append(emailField);
    const noteLabel=make('label','Notatka właściciela (opcjonalnie)');noteField=make('input');noteField.type='text';noteField.maxLength=220;noteField.placeholder='Np. VIP — kontakt przez Messenger';noteLabel.append(noteField);
    submit=make('button','Aktywuj VIP na miesiąc','aio-vip-button is-primary');submit.type='submit';
    form.append(emailLabel,noteLabel,submit);panel.append(form);
    panel.append(make('p','Uwaga: ponowna aktywacja ustawia nowy miesiąc od chwili zatwierdzenia. Nie sumuje czasu poprzednich okresów.','aio-vip-hint'));
    feedback=make('p','', 'aio-vip-feedback');feedback.setAttribute('role','status');panel.append(feedback);
    const bar=make('div',undefined,'aio-vip-record-head');summary=make('strong','Ładowanie aktywnych kont…');const btn=make('button','Odśwież listę','aio-vip-button');btn.type='button';btn.addEventListener('click',refresh);bar.append(summary,btn);panel.append(bar);
    items=make('div',undefined,'aio-vip-records');panel.append(items);
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;
      const email=emailField.value.trim();if(!confirm('Aktywować VIP na miesiąc od teraz dla '+email+'?\n\nDostęp będzie nielimitowany po potwierdzeniu.'))return;
      submit.disabled=true;feedback.textContent='Aktywuję VIP…';
      try{const d=await api({action:'activate',email,note:noteField.value,confirm:true});feedback.textContent=d.message+' Ważność do: '+fmt(d.expires_at);form.reset();await refresh();}catch(e){feedback.textContent=e.message;}finally{submit.disabled=false;}
    });
    const hero=$('.community-hero');if(hero)hero.insertAdjacentElement('afterend',panel);
    else $('#main-content')?.prepend(panel);
    void refresh();
  }
  async function boot(){try{const r=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});const d=await r.json();if(!r.ok||!d.authenticated||d.user?.is_owner!==true)return;build();}catch(e){console.warn('AIO VIP: nie można potwierdzić uprawnień.');}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
