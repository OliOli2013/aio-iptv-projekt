/* AIO Owner Post Contact V1 — integrated with owner-only moderation, no public e-mail exposure. */
(()=>{'use strict';
  const OWNER_API='/api/aio-owner-post-author';
  const MAIL_API='/api/aio-owner-messages';
  const root=document.querySelector('[data-community-admin]');
  if(!root||window.__aioOwnerPostContactV1)return;
  window.__aioOwnerPostContactV1=true;
  const make=(tag,cls,txt)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(txt!==undefined)n.textContent=txt;
    return n;
  };
  let dialog,recipient,form,subject,content,sendBtn,status,current=null,busy=false,requestId=null,openSeq=0;
  const timeoutFetch=async(url,options={})=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
      const response=await fetch(url,{credentials:'include',cache:'no-store',signal:controller.signal,...options});
      const data=await response.json().catch(()=>({ok:false,error:'Serwer zwrócił nieprawidłową odpowiedź.'}));
      if(!response.ok||data.ok!==true)throw new Error(data.error||'Błąd HTTP '+response.status);
      return data;
    }finally{clearTimeout(timer);}
  };
  const setStatus=(message,error=false)=>{if(status){status.textContent=message||'';status.classList.toggle('aopc-error',error);}};
  function renderIdentity(meta,row){
    row.replaceChildren();
    if(!meta){row.textContent='Nie udało się odczytać danych autora.';return;}
    row.append(make('span','', 'Konto: '));
    row.append(make('strong','',meta.display_name||'Użytkownik'));
    row.append(make('span','', ' • E-mail: '));
    row.append(make('span','',meta.email||'brak przypisanego adresu'));
    row.append(make('span','', ' • ID: '));
    row.append(make('code','',meta.user_id));
  }
  function attachButtons(){
    const cards=[...root.querySelectorAll('[data-admin-post]')].filter(card=>!card.dataset.aopcReady);
    if(!cards.length)return;
    const pending=[];
    for(const card of cards){
      const actions=card.querySelector('.community-admin-actions');
      const head=card.querySelector('.community-admin-item-head');
      const id=card.getAttribute('data-admin-post')||'';
      if(!actions||!head||!/^[a-f\d-]{36}$/i.test(id))continue;
      card.dataset.aopcReady='1';
      const button=make('button','button aopc-contact','✉ Napisz do autora');
      button.type='button';button.dataset.aopcPost=id;
      actions.append(button);
      const identity=make('div','aopc-identity','Sprawdzanie konta autora…');
      (head.querySelector(':scope > div:last-child')||head).append(identity);
      pending.push({id,identity});
    }
    if(!pending.length)return;
    void (async()=>{
      try{
        const data=await timeoutFetch(OWNER_API+'?ids='+encodeURIComponent(pending.map(p=>p.id).join(',')));
        const map=new Map((data.rows||[]).map(x=>[x.post_id,x]));
        for(const item of pending)if(item.identity.isConnected)renderIdentity(map.get(item.id),item.identity);
      }catch(e){
        for(const item of pending)if(item.identity.isConnected)item.identity.textContent='Dane autora dostępne po kliknięciu „Napisz do autora”.';
      }
    })();
  }
  function ensureDialog(){
    if(dialog)return;
    dialog=make('dialog','aopc-dialog');
    const wrap=make('div','aopc-sheet');
    const heading=make('div','aopc-heading');
    heading.append(make('p','aopc-kicker','WIADOMOŚĆ PRYWATNA • PANEL WŁAŚCICIELA'));
    heading.append(make('h2','', 'Napisz do autora wpisu'));
    recipient=make('p','aopc-recipient','Odczytywanie danych autora…');
    const close=make('button','aopc-close','✕');close.type='button';close.setAttribute('aria-label','Zamknij okno wiadomości');
    close.addEventListener('click',()=>{if(!busy)dialog.close();});
    heading.append(close,recipient);wrap.append(heading);
    form=make('form','aopc-form');form.addEventListener('submit',send);
    const subjectLabel=make('label','', 'Temat wiadomości');
    subject=make('input','aopc-input');subject.type='text';subject.required=true;subject.minLength=3;subject.maxLength=120;
    subjectLabel.append(subject);
    const contentLabel=make('label','', 'Treść do użytkownika');
    content=make('textarea','aopc-input aopc-body');content.required=true;content.minLength=3;content.maxLength=4000;content.rows=8;
    contentLabel.append(content);
    status=make('p','aopc-status','');status.setAttribute('role','status');
    const buttons=make('div','aopc-controls');
    const cancel=make('button','aopc-secondary','Anuluj');cancel.type='button';cancel.addEventListener('click',()=>{if(!busy)dialog.close();});
    sendBtn=make('button','aopc-primary','✉ Wyślij do autora');sendBtn.type='submit';
    buttons.append(cancel,sendBtn);
    form.append(subjectLabel,contentLabel,make('p','aopc-help','Wiadomość trafi do „Moje konto” konkretnego autora, a nie do innych osób o takiej samej nazwie. E-mail służy tu jedynie do identyfikacji konta.'),status,buttons);
    wrap.append(form);dialog.append(wrap);document.body.append(dialog);
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  }
  async function openForPost(id){
    ensureDialog();const generation=++openSeq;current=null;requestId=null;form.reset();
    sendBtn.disabled=true;setStatus('');recipient.textContent='Sprawdzanie autora wpisu…';
    dialog.showModal();
    try{
      const data=await timeoutFetch(OWNER_API+'?ids='+encodeURIComponent(id));
      const item=(data.rows||[]).find(row=>row.post_id===id);
      if(!item||!item.user_id)throw new Error('Nie znaleziono konta autora tego wpisu.');
      if(!dialog.open||generation!==openSeq)return;
      current=item;requestId=crypto.randomUUID();
      recipient.replaceChildren(make('strong','',item.display_name));
      recipient.append(make('span','',' • '+(item.email||'brak e-maila')+' • ID: '));
      recipient.append(make('code','',item.user_id));
      const proposed=('Prośba o poprawienie wpisu: '+String(item.post_title||'').trim()).slice(0,120);
      subject.value=proposed.length>=3?proposed:'Prośba dotycząca wpisu AIO';
      content.value='Dzień dobry,\n\nProszę o poprawienie lub uzupełnienie wpisu „'+String(item.post_title||'').trim().slice(0,160)+'”.\n\nDo poprawienia: \n\nPozdrawiam,\nAdministracja AIO';
      sendBtn.disabled=false;
    }catch(e){if(generation===openSeq)setStatus(e.message||'Nie udało się ustalić autora.',true);}
  }
  async function send(event){
    event.preventDefault();
    if(!current||busy||!requestId||!form.reportValidity())return;
    const postId=current.post_id;
    if(!window.confirm('Wysłać prywatną wiadomość na konto „'+current.display_name+'” (ID '+current.user_id+')?'))return;
    busy=true;sendBtn.disabled=true;setStatus('Wysyłanie wiadomości…');
    try{
      // The existing owner-message API validates the owner and recipient server-side.
      const result=await timeoutFetch(MAIL_API,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'send',audience:'user',user_id:current.user_id,
          subject:subject.value.trim(),content:content.value.trim(),request_id:requestId})});
      setStatus((result.duplicate?'Wiadomość była już wysłana.':'✓ Wiadomość wysłana.')+' Autor odczyta ją w „Moje konto”.');
      sendBtn.textContent='✓ Wysłano';requestId=null;
      const card=root.querySelector('[data-admin-post="'+postId+'"]');
      if(card&&!card.querySelector('.aopc-sent-note'))card.append(make('p','aopc-sent-note','✓ Wysłano prywatną wiadomość do autora wpisu.'));
    }catch(e){setStatus('Nie wysłano: '+(e.message||'spróbuj ponownie'),true);sendBtn.disabled=false;}
    finally{busy=false;}
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-aopc-post]');
    if(!button)return;
    event.preventDefault();event.stopPropagation();
    void openForPost(button.dataset.aopcPost);
  },true);
  const observer=new MutationObserver(()=>attachButtons());
  observer.observe(root,{childList:true,subtree:true});
  attachButtons();
})();
