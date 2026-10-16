/* AIO Access V4.1 — accessible optional expedited verification dialog. */
(()=>{'use strict';
  const API='/api/aio-access-approvals';
  const $=(s,p=document)=>p.querySelector(s);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const fmt=v=>{try{return new Date(v).toLocaleString('pl-PL');}catch{return String(v||'');}};
  async function api(body){const r=await fetch(API,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Nie można pobrać statusu.');return d;}
  let latest=null;
  function ensureDialog(){
    let dlg=$('#aioApprovalDialog');if(dlg)return dlg;
    dlg=el('dialog');dlg.id='aioApprovalDialog';dlg.className='aio-approval-dialog';dlg.setAttribute('aria-labelledby','aioApprovalTitle');
    const title=el('h2','Poproś o szybszą weryfikację');title.id='aioApprovalTitle';
    dlg.append(title,el('p','Jeśli postawiłeś kawę i chcesz przyspieszyć potwierdzenie dostępu, możesz wysłać administratorowi jedną wiadomość. Nie podawaj haseł ani danych karty.'));
    const form=el('form');form.method='dialog';
    const label=el('label','Wiadomość dla administratora');const textarea=el('textarea');textarea.name='message';textarea.rows=5;textarea.minLength=20;textarea.maxLength=1200;textarea.required=true;textarea.placeholder='Np. Wspierałem projekt przez BuyCoffee. Podałem adres e-mail przypisany do mojego konta AIO. Proszę o weryfikację.';label.append(textarea);form.append(label);
    const status=el('p');status.className='aio-approval-dialog-status';status.setAttribute('role','status');form.append(status);
    const actions=el('div');actions.className='aio-approval-actions';const send=el('button','Wyślij do administratora');send.className='aio-approval-primary';send.type='submit';const close=el('button','Zamknij');close.type='button';close.addEventListener('click',()=>dlg.close());actions.append(send,close);form.append(actions);dlg.append(form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!latest)return;
      if(!textarea.value.trim()||textarea.value.trim().length<20){status.textContent='Wpisz co najmniej 20 znaków.';return;}
      send.disabled=true;
      try{const r=await api({action:'expedite',id:latest.id,message:textarea.value.trim()});status.textContent=r.message;await refresh();setTimeout(()=>dlg.close(),1500);}catch(x){status.textContent=x.message;}finally{send.disabled=false;}
    });
    document.body.append(dlg);return dlg;
  }
  function render(items){
    const root=$('#aioAccessApprovalStatus');if(!root)return;
    root.replaceChildren();latest=(items||[]).find(x=>x.status==='pending')||null;
    if(!latest){
      const approved=(items||[]).find(x=>x.status==='approved');
      if(approved)root.append(el('p','Twoje zgłoszenie wsparcia zostało zatwierdzone. Odśwież stronę, aby zobaczyć dostęp AIO Access.'));
      return;
    }
    const heading=el('strong','Weryfikacja wsparcia w toku');root.append(heading);
    root.append(el('p','Zgłoszenie otrzymaliśmy '+fmt(latest.created_at)+'. Standardowo staramy się sprawdzać wpłaty w ciągu 1–2 godzin, gdy administrator jest dostępny. Nie jest to automatyczne odblokowanie ani gwarantowany termin.'));
    root.append(el('p','Nie musisz pisać ponownie. Twoje zgłoszenie znajduje się już w panelu właściciela.'));
    if(!latest.priority_sent_at){const b=el('button','Poproś o szybszą weryfikację');b.className='aio-approval-primary';b.type='button';b.addEventListener('click',()=>ensureDialog().showModal());root.append(b);}
    else root.append(el('p','Prośba o szybszą weryfikację została przesłana '+fmt(latest.priority_sent_at)+'.'));
  }
  async function refresh(){try{const d=await api();if(!d.authenticated)return;render(d.requests||[]);}catch(e){console.warn('AIO Access approval status',e.message);}}
  function boot(){
    const main=$('#main-content')||$('main');if(!main)return;
    const status=el('aside');status.id='aioAccessApprovalStatus';status.className='aio-approval-user-status';status.setAttribute('aria-live','polite');
    const access=$('#accessCard');
    if(access)access.insertAdjacentElement('afterend',status);
    else main.insertBefore(status,main.firstChild);
    void refresh();
    window.addEventListener('aio-access-pending-approval',refresh);
    document.addEventListener('aio-community-auth',refresh);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
