/* AIO: personal support applications in Moje Konto. API enforces user ownership and terminal payment states. */
(()=>{'use strict';
 const root=document.getElementById('aio-my-support-history');if(!root)return;
 const API='/api/aio-support-intent';
 const PURPOSE={access7:'7 dni pobierania bez limitu',vip30:'VIP — 30 dni',donation:'Dobrowolne wsparcie'};
 const METHOD={buycoffee:'BuyCoffee',kofi:'Ko-fi',revolut:'Revolut'};
 const URL={buycoffee:'https://buycoffee.to/pawelpawelek/rozwoj-strony-aio-iptv-pl-i-darmowych-projektow-enigma2',kofi:'https://ko-fi.com/pawelpawlek',revolut:'https://revolut.me/pawelz75'};
 const STATES={started:'Wybrano cel — bez zgłoszenia wpłaty',reported:'Zgłoszono do weryfikacji',approved:'Wpłata potwierdzona',rejected:'Zgłoszenie odrzucone',cancelled:'Anulowano'};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const status=root.querySelector('[data-asm-status]'),list=root.querySelector('[data-asm-list]'),count=root.querySelector('[data-asm-count]');
 let busy=false,dialog=null,requestNo=0;
 function message(t,error=false){status.textContent=t||'';status.classList.toggle('is-error',!!error);}
 function date(s){if(!s)return '';const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString('pl-PL'):'';}
 function money(v){return Number.isFinite(Number(v))?Number(v).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł':'';}
 async function api(body){const r=await fetch(API+(body?'':'?scope=own'),{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw Error(d.error||'Błąd pobierania danych.');return d;}
 function close(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
 function addButton(host,text,fn,kind){const b=el('button',text,'asm-btn'+(kind?' '+kind:''));b.type='button';b.addEventListener('click',fn);host.append(b);return b;}
 function field(form,label,type,value='',options=null){const wrap=el('label',undefined,'asm-field');wrap.append(el('span',label));let input;
   if(options){input=el('select');for(const [id,name] of Object.entries(options)){const op=el('option',name);op.value=id;input.append(op);}input.value=value;}
   else {input=el('input');input.type=type;input.value=value||'';}
   input.required=true;wrap.append(input);form.append(wrap);return input;
 }
 function modal(item,type){close();dialog=el('dialog',undefined,'asm-dialog');const panel=el('div',undefined,'asm-dialog-body');dialog.append(panel);
   const head=el('div',undefined,'asm-dialog-head');head.append(el('h3',type==='edit'?'Zmień zgłoszenie':'Zgłoś wykonaną wpłatę'));
   addButton(head,'✕',close,'asm-close');panel.append(head);
   panel.append(el('p','Numer: '+item.reference+' · '+(PURPOSE[item.purpose]||item.purpose),'asm-modal-meta'));
   if(type==='edit'&&item.status==='reported')panel.append(el('p','Po zmianie zgłoszenie wróci do stanu „Wybrano cel”. Aby właściciel mógł zweryfikować wpłatę, trzeba będzie ponownie wysłać dane płatności.','asm-warning'));
   const form=el('form',undefined,'asm-form');form.autocomplete='off';panel.append(form);
   let purpose,method,payer,amount;
   if(type==='edit'){
     purpose=field(form,'Cel wpłaty','text',item.purpose,{access7:PURPOSE.access7,vip30:PURPOSE.vip30});
     method=field(form,'Operator płatności','text',item.method,METHOD);
   }else{
     payer=field(form,'Nazwa lub e-mail użyte przy wpłacie','text',item.payer_identifier||'');payer.minLength=3;payer.maxLength=150;payer.placeholder='E-mail lub nazwa darczyńcy';
     amount=field(form,'Wpłacona kwota (PLN)','number',item.declared_pln??'');amount.min='0.01';amount.max='100000';amount.step='0.01';amount.inputMode='decimal';
   }
   const msg=el('p','','asm-form-msg');msg.setAttribute('role','status');form.append(msg);
   const actions=el('div',undefined,'asm-form-actions');const send=el('button',type==='edit'?'Zapisz zmiany':'Wyślij do weryfikacji','asm-btn primary');send.type='submit';actions.append(send);addButton(actions,'Anuluj',close);form.append(actions);
   form.addEventListener('submit',async ev=>{ev.preventDefault();if(busy)return;
     if(type==='report'&&!confirm('Czy rzeczywiście dokonano wpłaty? Samo wysłanie zgłoszenia nie przyznaje dostępu.'))return;
     busy=true;send.disabled=true;msg.textContent='Zapisywanie…';
     try{const body=type==='edit'?{action:'update',id:item.id,purpose:purpose.value,method:method.value}:{action:'report',id:item.id,payer_identifier:payer.value.trim(),declared_pln:amount.value};const d=await api(body);close();await refresh();message(d.message||'Zapisano.');}
     catch(e){msg.textContent=e.message;send.disabled=false;}finally{busy=false;}
   });
   document.body.append(dialog);dialog.showModal();
 }
 async function perform(item,action){if(busy)return;const isDelete=action==='delete';const text=isDelete?'Usunąć na stałe nieopłacony wybór? Tej czynności nie można cofnąć.':'Anulować zgłoszenie wpłaty? Nie będzie już oczekiwało na zatwierdzenie. Potwierdzonych płatności to nie zmienia.';
   if(!confirm(text))return;busy=true;message('Zapisywanie zmiany…');
   try{const d=await api({action,id:item.id});await refresh();message(d.message||'Zapisano.');}catch(e){message(e.message,true);}finally{busy=false;}
 }
 function card(item){const box=el('article',undefined,'asm-item status-'+item.status);
   const heading=el('div',undefined,'asm-item-heading');const identity=el('div',undefined,'asm-item-title');identity.append(el('strong',PURPOSE[item.purpose]||item.purpose));identity.append(el('span',item.reference+' · '+(METHOD[item.method]||item.method)+' · '+date(item.created_at)));
   heading.append(identity,el('span',item.status==='started'&&item.reported_at?'Po korekcie — zgłoś ponownie':(STATES[item.status]||item.status),'asm-state'));box.append(heading);
   const meta=el('div',undefined,'asm-meta');if(item.declared_pln!==null&&item.declared_pln!==undefined)meta.append(el('span','Deklarowana kwota: '+money(item.declared_pln)));
   if(item.verified_pln!==null&&item.verified_pln!==undefined)meta.append(el('span','Zweryfikowano: '+money(item.verified_pln)));
   if(item.review_note)meta.append(el('span',item.review_note));if(item.entitlement_expires_at)meta.append(el('span','Dostęp do: '+date(item.entitlement_expires_at)));
   if(meta.childNodes.length)box.append(meta);
   if(item.status==='started'||item.status==='reported'){
     const actions=el('div',undefined,'asm-item-actions');
     if(item.status==='started'){
       const a=el('a','↗ Otwórz '+(METHOD[item.method]||item.method),'asm-btn provider-'+item.method);a.href=URL[item.method]||'/support.html';a.target='_blank';a.rel='noopener noreferrer';actions.append(a);
       addButton(actions,'Zgłoś wpłatę',()=>modal(item,'report'),'primary');
     }
     addButton(actions,'Edytuj',()=>modal(item,'edit'));
     const removable=item.status==='started'&&!item.reported_at;
     addButton(actions,removable?'Usuń nieopłacony wybór':'Anuluj zgłoszenie',()=>void perform(item,removable?'delete':'cancel'),'danger');
     box.append(actions);
   }
   return box;
 }
 async function refresh(){const seq=++requestNo;message('Odświeżam historię…');
   try{const authRes=await fetch('/api/community-auth',{credentials:'include',cache:'no-store'});const auth=await authRes.json();if(seq!==requestNo)return;
     if(!authRes.ok||!auth.authenticated||auth.user?.is_owner===true){root.hidden=true;return;}
     root.hidden=false;const d=await api();if(seq!==requestNo)return;
     list.replaceChildren();const rows=d.rows||[];count.textContent=String(rows.length);
     if(!rows.length){const empty=el('div',undefined,'asm-empty');empty.append(el('strong','Brak zgłoszeń dotyczących dostępu'));empty.append(el('p','Wybór 7 dni lub VIP zapiszesz na stronie wsparcia. Dobrowolne darowizny nie wymagają zgłoszenia.'));const a=el('a','Wybierz wsparcie →','asm-btn primary');a.href='/support.html#wesprzyj-projekt';empty.append(a);list.append(empty);}
     else for(const item of rows)list.append(card(item));message('');
   }catch(e){if(seq!==requestNo)return;root.hidden=false;message('Nie udało się pobrać zgłoszeń: '+e.message,true);}
 }
 const start=()=>{void refresh();document.addEventListener('aio-community-auth',()=>void refresh());document.addEventListener('aio-community-ready',()=>void refresh());root.querySelector('[data-asm-refresh]')?.addEventListener('click',()=>void refresh());};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
