/* AIO Support Purpose: explicit intent, provider handoff, reported payment. Never grants access. */
(()=>{'use strict';
 if(window.__aioSupportPurposeV1)return;window.__aioSupportPurposeV1=true;
 const API='/api/aio-support-intent';
 const PROVIDERS={buycoffee:'https://buycoffee.to/pawelpawelek/rozwoj-strony-aio-iptv-pl-i-darmowych-projektow-enigma2',revolut:'https://revolut.me/pawelz75',kofi:'https://ko-fi.com/pawelpawlek'};
 const NAMES={donation:'Dobrowolne wsparcie projektu',access7:'7 dni nielimitowanego pobierania',vip30:'VIP — 30 dni (minimum 30 zł)'};
 const METHODS={buycoffee:'BuyCoffee',revolut:'Revolut',kofi:'Ko-fi'};
 const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
 const datetime=s=>s?new Date(s).toLocaleString('pl-PL'):'—';
 async function api(body){const r=await fetch(API+(body?'':'?scope=own'),{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Nie udało się połączyć z AIO.');return d;}
 let dialog=null,pending=null;
 function close(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
 function radio(name,value,label,group){const l=el('label',undefined,'asp-choice');const i=el('input');i.type='radio';i.name=name;i.value=value;i.checked=group===value;const span=el('span',label);l.append(i,span);return l;}
 function openDialog(method,initialPurpose=''){
  close();pending=null;dialog=el('dialog',undefined,'asp-dialog');dialog.id='aio-support-purpose-dialog';
  const body=el('div',undefined,'asp-body'),head=el('div',undefined,'asp-head');head.append(el('strong','Cel wsparcia AIO-IPTV.pl'));
  const x=el('button','✕','asp-close');x.type='button';x.setAttribute('aria-label','Zamknij');x.addEventListener('click',close);head.append(x);body.append(head);
  const intro=el('p','Zanim otworzysz '+METHODS[method]+', wybierz, czego dotyczy wpłata. Zapiszemy wybór w Centrum Właściciela — sama deklaracja nie jest potwierdzeniem płatności.');body.append(intro);
  const f=el('form');f.id='asp-form';const fs=el('fieldset');fs.append(el('legend','Wybierz cel wpłaty'));
  for(const [k,v] of Object.entries(NAMES))fs.append(radio('asp-purpose',k,v,initialPurpose));f.append(fs);
  const notice=el('p','Dobrowolna darowizna nie daje dodatkowego pobierania. Dostęp 7-dniowy wymaga zweryfikowanej wpłaty. VIP na 30 dni wymaga minimum 30 zł, sprawdzonych przez właściciela.','asp-notice');f.append(notice);
  const msg=el('p','','asp-msg');msg.setAttribute('role','status');f.append(msg);
  const actions=el('div',undefined,'asp-actions'),go=el('button','Zapisz wybór','asp-primary');go.type='submit';const cancel=el('button','Nie teraz');cancel.type='button';cancel.addEventListener('click',close);actions.append(go,cancel);f.append(actions);body.append(f);dialog.append(body);document.body.append(dialog);dialog.showModal();
  f.addEventListener('submit',async e=>{e.preventDefault();const chosen=f.querySelector('input[name=asp-purpose]:checked')?.value;if(!chosen){msg.textContent='Najpierw wybierz cel wpłaty.';return;}
    go.disabled=true;msg.textContent='Zapisywanie celu w AIO…';try{const d=await api({action:'create',purpose:chosen,method});pending={id:d.id,reference:d.reference,purpose:chosen,method};showCreated(body,pending);}catch(err){msg.textContent=String(err.message||err);if(/Zaloguj|Brak dostępu|401|nie zalogowano/i.test(msg.textContent)){const link=el('a','Zaloguj się do AIO →');link.href='/community.html';msg.append(' ',link);}}finally{go.disabled=false;}
  });
 }
 function showCreated(body,item){body.replaceChildren();const head=el('div',undefined,'asp-head');head.append(el('strong','Cel wsparcia zapisany'));const x=el('button','✕','asp-close');x.type='button';x.addEventListener('click',close);head.append(x);body.append(head);
  body.append(el('p',NAMES[item.purpose]+'. Metoda: '+METHODS[item.method]+'.'));
  const code=el('div',item.reference,'asp-code');body.append(el('p','Numer zgłoszenia do powiązania wpłaty:'),code);
  const hint=el('p','Jeżeli operator płatności pozwala dopisać wiadomość, umieść w niej powyższy numer. Dodatkowo użyj tego samego e-maila lub nazwy darczyńcy. Operatorzy nie przekazują automatycznie do AIO potwierdzeń przelewów.','asp-notice');body.append(hint);
  const actions=el('div',undefined,'asp-actions');const copy=el('button','Kopiuj numer');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.reference);copy.textContent='Skopiowano ✓';}catch(_){copy.textContent='Zaznacz numer powyżej';}});
  const provider=el('a','Otwórz '+METHODS[item.method]+' ↗','asp-primary');provider.href=PROVIDERS[item.method];provider.target='_blank';provider.rel='noopener noreferrer';provider.setAttribute('data-aio-purpose-direct','1');actions.append(copy,provider);body.append(actions);
  const section=el('section',undefined,'asp-report');section.append(el('h3','Po wpłacie zgłoś ją do weryfikacji'));
  const form=el('form');const label=el('label','Nazwa lub e-mail użyte przy wpłacie');const who=el('input');who.required=true;who.minLength=3;who.maxLength=150;who.placeholder='np. e-mail z BuyCoffee';label.append(who);form.append(label);
  const amtLabel=el('label','Kwota wpłaty (PLN lub równowartość PLN)');const amt=el('input');amt.type='number';amt.min='0.01';amt.max='100000';amt.step='0.01';amt.inputMode='decimal';amt.required=true;amt.placeholder='np. 30.00';amtLabel.append(amt);form.append(amtLabel);
  const msg=el('p','','asp-msg');msg.setAttribute('role','status');const send=el('button','Zgłoś wykonaną wpłatę','asp-primary');send.type='submit';form.append(msg,send);section.append(form);body.append(section);
  form.addEventListener('submit',async e=>{e.preventDefault();send.disabled=true;msg.textContent='Wysyłanie do Centrum Właściciela…';try{const d=await api({action:'report',id:item.id,payer_identifier:who.value,declared_pln:amt.value});msg.textContent=d.message;send.hidden=true;void renderHistory();}catch(err){msg.textContent=err.message;}finally{send.disabled=false;}});
 }
 function openReport(item){openDialog(item.method,item.purpose);if(dialog){pending=item;showCreated(dialog.querySelector('.asp-body'),item);}}
 async function renderHistory(){const host=document.getElementById('asp-history');if(!host)return;host.replaceChildren();
   try{const d=await api();const rows=d.rows||[];host.append(el('h3','Moje zgłoszenia wsparcia'));
     if(!rows.length){host.append(el('p','Nie masz jeszcze zapisanych zgłoszeń.'));return;}
     for(const row of rows.slice(0,12)){
       const card=el('article',undefined,'asp-history-row'),txt=el('div');txt.append(el('strong',NAMES[row.purpose]||row.purpose),el('span',`${row.reference} · ${METHODS[row.method]||row.method} · ${datetime(row.created_at)}`));
       const state=({started:'Wybrano cel (wpłata niepotwierdzona)',reported:'Zgłoszone do weryfikacji',approved:'Wpłata potwierdzona',rejected:'Odrzucone'})[row.status]||row.status;txt.append(el('small',state));if(row.review_note)txt.append(el('small',row.review_note));card.append(txt);
       if(row.status==='started'){const b=el('button','Zgłoś wpłatę');b.type='button';b.addEventListener('click',()=>openReport(row));card.append(b);}host.append(card);
     }
   }catch(err){if(!/Zaloguj|Brak dostępu|401/i.test(err.message||''))host.append(el('p','Historia jest dostępna po zalogowaniu.'));else host.append(el('p','Zaloguj się, aby zobaczyć powiązane z kontem zgłoszenia.'));}
 }
 function providerFromLink(a){if(!a||a.dataset.aioPurposeDirect)return null;let u;try{u=new URL(a.href,location.href);}catch(_){return null;}
  if(u.hostname==='revolut.me'&&u.pathname.toLowerCase().startsWith('/pawelz75'))return 'revolut';
  if(u.hostname==='ko-fi.com'&&u.pathname.toLowerCase().startsWith('/pawelpawlek'))return 'kofi';
  if(u.hostname==='buycoffee.to'&&u.pathname.toLowerCase().startsWith('/pawelpawelek'))return 'buycoffee';return null;}
 document.addEventListener('click',e=>{
   const direct=e.target.closest('a[href]');const method=providerFromLink(direct);
   if(method){e.preventDefault();e.stopImmediatePropagation();const initial=document.querySelector('input[name=asp-support-page-purpose]:checked')?.value||'';openDialog(method,initial);return;}
   const old=e.target.closest('.support-gate-continue');if(old){const selected=document.querySelector('.support-gate-modal [data-access-method].is-selected');if(!selected)return;
     const m=String(selected.dataset.accessMethod||'');if(!PROVIDERS[m])return;
     e.preventDefault();e.stopImmediatePropagation();openDialog(m,'access7');return;}
 },true);
 function init(){const funding=document.querySelector('.aio-support-v2-funding');if(!funding)return;
   const methods=funding.querySelector('.aio-support-v2-methods');if(!methods)return;
   const panel=el('section',undefined,'asp-inline');panel.append(el('h3','1. Najpierw wybierz cel wsparcia'));
   const intro=el('p','Dzięki temu właściciel od razu zobaczy, czy wpłacasz dobrowolnie, wybierasz pobieranie na 7 dni, czy VIP. Potwierdzenie wpłaty następuje osobno.');panel.append(intro);
   const radios=el('div',undefined,'asp-inline-options');for(const [k,v] of Object.entries(NAMES))radios.append(radio('asp-support-page-purpose',k,v,''));panel.append(radios);
   panel.append(el('p','2. Następnie wybierz BuyCoffee, Ko-fi lub Revolut poniżej.','asp-notice'));
   methods.before(panel);const history=el('div',undefined,'asp-history');history.id='asp-history';funding.append(history);void renderHistory();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
