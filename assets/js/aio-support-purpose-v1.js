/* AIO Support Purpose: explicit intent, provider handoff, reported payment. Never grants access. */
(()=>{'use strict';
 if(window.__aioSupportPurposeV1)return;window.__aioSupportPurposeV1=true;
 const v2css='/assets/css/aio-support-purpose-v2.css?v=20261021-ui-v2';
 if(!document.querySelector('link[href*="aio-support-purpose-v2.css"]')){
   const s=document.createElement('link');s.rel='stylesheet';s.href=v2css;document.head.append(s);
 }
 const API='/api/aio-support-intent';
 const PROVIDERS={buycoffee:'https://buycoffee.to/pawelpawelek/rozwoj-strony-aio-iptv-pl-i-darmowych-projektow-enigma2',revolut:'https://revolut.me/pawelz75',kofi:'https://ko-fi.com/pawelpawlek'};
 const NAMES={donation:'Dobrowolne wsparcie projektu',access7:'7 dni nielimitowanego pobierania',vip30:'VIP — 30 dni (minimum 30 zł)'};
 const METHODS={buycoffee:'BuyCoffee',revolut:'Revolut',kofi:'Ko-fi'};
 const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
 const datetime=s=>s?new Date(s).toLocaleString('pl-PL'):'—';
 async function api(body){const r=await fetch(API+(body?'':'?scope=own'),{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Nie udało się połączyć z AIO.');return d;}
 let dialog=null,pending=null;
 function close(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
 function openDonation(method){
  // True voluntary donation: NO account, NO D1 intent, NO payment report.
  // Open through the original external provider in direct response to a click/change.
  const href=PROVIDERS[method];if(!href)return;
  close();
  const gateClose=document.querySelector('.support-gate-modal [data-support-close]');
  if(gateClose)gateClose.click();
  const a=el('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';
  a.dataset.aioPurposeDirect='1';a.hidden=true;document.body.append(a);a.click();a.remove();
 }
 function radio(name,value,label,group){
  const l=el('label',undefined,'asp-choice');l.dataset.purpose=value;
  const i=el('input');i.type='radio';i.name=name;i.value=value;i.checked=group===value;
  const icon=el('span',({donation:'♥',access7:'⇩',vip30:'★'})[value]||'•','asp-choice-icon');icon.setAttribute('aria-hidden','true');
  const copy=el('span',undefined,'asp-choice-copy');copy.append(el('strong',label));
  copy.append(el('small',({donation:'Bez dodatkowego dostępu • dowolna kwota',access7:'7 dni bez limitu • dowolna potwierdzona kwota',vip30:'30 dni bez limitu • minimum 30 zł'})[value]||''));
  const check=el('span','✓','asp-choice-check');check.setAttribute('aria-hidden','true');
  l.append(i,icon,copy,check);return l;
 }

 function openDialog(method,initialPurpose=''){
  close();pending=null;dialog=el('dialog',undefined,'asp-dialog');dialog.id='aio-support-purpose-dialog';
  const body=el('div',undefined,'asp-body'),head=el('div',undefined,'asp-head');head.append(el('strong','Cel wsparcia AIO-IPTV.pl'));
  const x=el('button','✕','asp-close');x.type='button';x.setAttribute('aria-label','Zamknij');x.addEventListener('click',close);head.append(x);body.append(head);
  const intro=el('p','Zanim otworzysz '+METHODS[method]+', wybierz cel. Dobrowolna darowizna przenosi od razu do wpłaty — bez rejestracji i zgłoszenia. Tylko dostęp 7 dni i VIP wymagają zapisania celu w Centrum Właściciela.');body.append(intro);
  const f=el('form');f.id='asp-form';const fs=el('fieldset');fs.append(el('legend','Wybierz cel wpłaty'));
  for(const [k,v] of Object.entries(NAMES))fs.append(radio('asp-purpose',k,v,initialPurpose));f.append(fs);
  // The payment method is already known; choosing a pure donation immediately opens it.
  fs.addEventListener('change',e=>{if(e.target?.name==='asp-purpose'&&e.target.value==='donation')openDonation(method);});
  const notice=el('p','Dobrowolna darowizna nie daje dodatkowego pobierania. Dostęp 7-dniowy wymaga zweryfikowanej wpłaty. VIP na 30 dni wymaga minimum 30 zł, sprawdzonych przez właściciela.','asp-notice');f.append(notice);
  const msg=el('p','','asp-msg');msg.setAttribute('role','status');f.append(msg);
  const actions=el('div',undefined,'asp-actions'),go=el('button','Zapisz wybór','asp-primary');go.type='submit';const cancel=el('button','Nie teraz');cancel.type='button';cancel.addEventListener('click',close);actions.append(go,cancel);f.append(actions);body.append(f);dialog.append(body);document.body.append(dialog);dialog.showModal();
  f.addEventListener('submit',async e=>{e.preventDefault();const chosen=f.querySelector('input[name=asp-purpose]:checked')?.value;if(!chosen){msg.textContent='Najpierw wybierz cel wpłaty.';return;}
    if(chosen==='donation'){openDonation(method);return;}
    go.disabled=true;msg.textContent='Zapisywanie celu w AIO…';try{const d=await api({action:'create',purpose:chosen,method});pending={id:d.id,reference:d.reference,purpose:chosen,method};showCreated(body,pending);}catch(err){msg.textContent=String(err.message||err);if(/Zaloguj|Brak dostępu|401|nie zalogowano/i.test(msg.textContent)){const link=el('a','Zaloguj się do AIO →');link.href='/community.html';msg.append(' ',link);}}finally{go.disabled=false;}
  });
 }
 function showCreated(body,item){
  body.replaceChildren();dialog.classList.add('asp-created');
  const method=METHODS[item.method]||item.method;
  const typeName=NAMES[item.purpose]||item.purpose;
  const brand=PROVIDERS[item.method];
  const head=el('div',undefined,'asp-head asp-created-head');
  const icon=el('span','✓','asp-success-icon');icon.setAttribute('aria-hidden','true');
  const title=el('div',undefined,'asp-title-stack');title.append(el('small','ZGŁOSZENIE GOTOWE'),el('strong','Teraz wykonaj wpłatę'));
  head.append(icon,title);const x=el('button','×','asp-close');x.type='button';x.setAttribute('aria-label','Zamknij');x.addEventListener('click',close);head.append(x);body.append(head);
  body.append(el('p',typeName+' · '+method,'asp-purpose-summary'));

  const ref=el('div',undefined,'asp-ref-card');
  const refText=el('div',undefined,'asp-ref-content');refText.append(el('span','NUMER ZGŁOSZENIA DO WPŁATY','asp-ref-label'),el('strong',item.reference,'asp-ref-number'));
  const copy=el('button','⧉ Kopiuj','asp-copy');copy.type='button';
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.reference);copy.textContent='✓ Skopiowano';}catch(_){copy.textContent='Zaznacz numer';refText.querySelector('strong')?.focus();}});
  ref.append(refText,copy);body.append(ref);
  const workflow=el('div',undefined,'asp-step-line');workflow.append(el('span','01','asp-step-number'),el('strong','Wykonaj wpłatę u operatora'));body.append(workflow);
  const provider=el('a',undefined,'asp-provider-cta asp-provider-'+item.method);
  provider.href=brand;provider.target='_blank';provider.rel='noopener noreferrer';provider.dataset.aioPurposeDirect='1';
  provider.append(el('span',({buycoffee:'☕',kofi:'♥',revolut:'R'})[item.method]||'↗','asp-provider-symbol'),el('strong','Otwórz '+method),el('span','↗','asp-provider-arrow'));
  body.append(provider);
  body.append(el('p','Jeżeli operator umożliwia dodanie wiadomości, wpisz numer zgłoszenia z pola powyżej.','asp-short-hint'));

  const section=el('section',undefined,'asp-report');
  const labelHead=el('div',undefined,'asp-step-line');labelHead.append(el('span','02','asp-step-number'),el('strong','Po wpłacie zgłoś ją do weryfikacji'));section.append(labelHead);
  const form=el('form');form.autocomplete='off';
  const fields=el('div',undefined,'asp-fields');
  const label=el('label','Nazwa lub e-mail z płatności');const who=el('input');who.required=true;who.minLength=3;who.maxLength=150;who.autocomplete='email';who.placeholder='np. e-mail z '+method;label.append(who);fields.append(label);
  const amtLabel=el('label','Wpłacona kwota (PLN)');const amt=el('input');amt.type='number';amt.min='0.01';amt.max='100000';amt.step='0.01';amt.inputMode='decimal';amt.required=true;amt.placeholder='np. 30.00';amtLabel.append(amt);fields.append(amtLabel);
  form.append(fields);
  const msg=el('p','','asp-msg');msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');form.append(msg);
  const send=el('button','➤ Zgłoś wykonaną wpłatę','asp-submit');send.type='submit';form.append(send);
  section.append(form);body.append(section);
  body.append(el('p','Zgłoszenie nie odblokowuje plików automatycznie. Właściciel sprawdza wpłatę i dopiero wtedy przyznaje dostęp.','asp-verification-hint'));
  form.addEventListener('submit',async e=>{e.preventDefault();send.disabled=true;msg.textContent='Zapisuję zgłoszenie w Centrum Właściciela…';
    try{const d=await api({action:'report',id:item.id,payer_identifier:who.value,declared_pln:amt.value});msg.textContent='✓ '+d.message;msg.classList.add('asp-ok');send.hidden=true;void renderHistory();}
    catch(err){msg.textContent=String(err.message||err);send.disabled=false;}
  });
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
 function createDirectPaidIntent(method,purpose){
  // /support already collected purpose. Never ask for the same choice again.
  close();pending=null;dialog=el('dialog',undefined,'asp-dialog');dialog.id='aio-support-purpose-dialog';
  const body=el('div',undefined,'asp-body');dialog.append(body);document.body.append(dialog);dialog.showModal();
  const heading=el('div',undefined,'asp-head');heading.append(el('strong','Przygotowuję zgłoszenie'));const x=el('button','×','asp-close');x.type='button';x.addEventListener('click',close);heading.append(x);body.append(heading);
  const message=el('p',NAMES[purpose]+' · '+METHODS[method]+' — zapisuję cel w Centrum Właściciela…','asp-loading');body.append(message);
  const loadingDialog=dialog;
  void api({action:'create',purpose,method}).then(d=>{
    // If dialog closed during request, do not resurrect it.
    if(dialog!==loadingDialog)return;
    pending={id:d.id,reference:d.reference,purpose,method};showCreated(body,pending);void renderHistory();
  }).catch(err=>{
    if(dialog!==loadingDialog)return;
    message.textContent=String(err.message||err);
    if(/Zaloguj|Brak dostępu|401|nie zalogowano/i.test(message.textContent)){
      message.append(' ',el('a','Zaloguj się do AIO →'));message.querySelector('a').href='/community.html';
    }
  });
 }
 document.addEventListener('click',e=>{
   const direct=e.target.closest('a[href]');const method=providerFromLink(direct);
   if(method){
     const pageChoices=document.querySelector('.asp-inline-options');
     if(pageChoices){
       const selected=pageChoices.querySelector('input[name=asp-support-page-purpose]:checked');
       if(!selected){e.preventDefault();e.stopImmediatePropagation();
         pageChoices.classList.remove('asp-pick-warning');void pageChoices.offsetWidth;pageChoices.classList.add('asp-pick-warning');
         const note=document.querySelector('.asp-next-step');if(note)note.textContent='Najpierw wybierz jedną z trzech opcji powyżej.';
         pageChoices.scrollIntoView({behavior:'smooth',block:'center'});pageChoices.querySelector('input')?.focus({preventScroll:true});return;
       }
       if(selected.value==='donation')return; // direct external link, no account or D1 operation
       e.preventDefault();e.stopImmediatePropagation();createDirectPaidIntent(method,selected.value);return;
     }
     e.preventDefault();e.stopImmediatePropagation();openDialog(method);return;
   }
   const old=e.target.closest('.support-gate-continue');if(old){const selected=document.querySelector('.support-gate-modal [data-access-method].is-selected');if(!selected)return;
     const m=String(selected.dataset.accessMethod||'');if(!PROVIDERS[m])return;
     e.preventDefault();e.stopImmediatePropagation();openDialog(m,'access7');return;
   }
 },true);
 function init(){const funding=document.querySelector('.aio-support-v2-funding');if(!funding)return;
   const methods=funding.querySelector('.aio-support-v2-methods');if(!methods)return;
   const panel=el('section',undefined,'asp-inline');panel.append(el('h3','1 · Wybierz, na co przeznaczasz wpłatę'));
   const intro=el('p','Dobrowolne wsparcie prowadzi bezpośrednio do wybranego operatora bez zapisu zgłoszenia. Przy wyborze pobierania 7 dni lub VIP zgłoszenie trafi do właściciela i będzie wymagało potwierdzenia wpłaty.');panel.append(intro);
   const radios=el('div',undefined,'asp-inline-options');for(const [k,v] of Object.entries(NAMES))radios.append(radio('asp-support-page-purpose',k,v,''));panel.append(radios);
   const choose=el('p','2 · Wybierz operatora płatności poniżej. Dla 7 dni lub VIP cel zapiszemy już bez ponownego wybierania.','asp-next-step');panel.append(choose);
   methods.before(panel);const history=el('div',undefined,'asp-history');history.id='asp-history';funding.append(history);void renderHistory();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
